// T16m-a 完成條件：規格 §8 每段腳本的工具呼叫和結果（真的資料、時刻表、引擎、假後端；模型是腳本）。畫面由 T16m-b、T16m-c 的 e2e 跑。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { placeFit15 } from '../src/lib/filter.ts';
import { EMPTY_FILTER } from '../src/lib/filter.ts';
import { splitPlaceTags, toApiMessages, incompleteTurn, titleFrom } from '../src/ai/transcript.ts';
import { nameScore } from '../src/ai/search.ts';
import { applyOps } from '../src/ai/ops.ts';
import type { ChatMessage } from '../src/ai/types.ts';
import { ItineraryError } from '@travel-helper/engine';
import { harness, memoryStorage } from './aiHarness.ts';

const DAY3 = '2027-02-04';
const itemsOn = (h: Awaited<ReturnType<typeof harness>>, date: string) => h.data.getState().itinerary!.days.find((d) => d.date === date)!.items;
const placesOn = (h: Awaited<ReturnType<typeof harness>>, date: string) => itemsOn(h, date).flatMap((i) => (i.type === 'visit' ? i.options.map((o) => o.place) : []));

// --- 一般 ---

test('S1 找地點：結果都能坐 15 人；呈現是結果集，探索的篩選收起來；手動按想去、再篩選，✕ 還原', async () => {
  const h = await harness();
  h.app.getState().setFilter({ types: ['spot'] });
  assert.deepEqual(await h.chat.send('鳥羽能坐 15 人的海鮮餐廳'), { ok: true });
  assert.deepEqual(h.called(), ['search_places', 'get_place', 'show_places', 'suggest_replies']);
  const found = h.lastResult('search_places');
  assert.ok(found.total >= 3);
  const { byId } = h.data.getState();
  for (const p of found.places) {
    assert.equal(placeFit15(byId.get(p.id)!), 'yes');
    assert.equal(byId.get(p.id)!.area, 'toba');
  }
  // 回覆的名字從工具結果來、地點是標籤
  const ids = h.app.getState().aiResult!.ids;
  assert.equal(ids.length, 3);
  assert.ok(ids.every((id) => h.allText().includes(`[[place:${id}]]`)));
  assert.equal(h.app.getState().mode, 'explore');
  assert.deepEqual(h.app.getState().filter, EMPTY_FILTER);
  assert.equal(h.cardOf('show_places')?.view, 'applied');

  await h.shared.vote(ids[0], 'like');
  h.app.getState().setFilter({ tiers: ['A'] });
  assert.ok(h.app.getState().aiResult);
  h.commands.clearResult();
  assert.deepEqual(h.app.getState().filter.types, ['spot']);
  h.close();
});

test('S2 問單點：問 AI 只帶晶片和建議問題、不送出；回答從資料來；畫面不動', async () => {
  const h = await harness();
  await h.chat.ask([{ kind: 'place', id: 'toba-osakaya' }]);
  assert.equal(h.chat.store.getState().messages.length, 0);
  assert.ok(h.chat.store.getState().suggestions.includes('15 人坐得下嗎？'));
  const mode = h.app.getState().mode;
  await h.chat.send('15 人坐得下嗎？');
  assert.deepEqual(h.called(), ['get_place']);
  assert.match(h.reply(), /全部坐一起不行、要分桌/);
  assert.match(h.reply(), /80 席/);
  assert.match(h.reply(), /分成 4～6 人可以/);
  assert.equal(h.app.getState().mode, mode);
  assert.equal(h.app.getState().aiResult, null);
  // 晶片跟著訊息存下來，輸入框上面的留著
  assert.deepEqual(h.chat.store.getState().messages[0].contexts, [{ kind: 'place', id: 'toba-osakaya' }]);
  assert.equal(h.chat.store.getState().contexts.length, 1);
  h.close();
});

test('S3 資料未查：fit15 是 unknown，不說可以或不行；別的條件比到的也算進 unknownExcluded', async () => {
  const h = await harness();
  await h.chat.send('漣坐得下 15 人嗎？');
  assert.equal(h.lastResult('search_places').places[0].id, 'toba-sazanami');
  assert.match(h.allText(), /沒有查到/);
  assert.doesNotMatch(h.allText(), /坐不下/);
  const r = (await h.chat.tools.find((t) => t.name === 'search_places')!.run({ areas: ['toba'], types: ['restaurant'], fit15: ['yes'] })).output as unknown as { unknownExcluded: number };
  assert.ok(r.unknownExcluded > 0);
  const g = (await h.chat.tools.find((t) => t.name === 'get_place')!.run({ ids: ['toba-sazanami'], sections: ['kids', 'menu'] })).output as unknown as { places: Record<string, Record<string, unknown>>[] };
  assert.ok('kids' in g.places[0].kids);
  h.close();
});

test('S4 比較：晶片帶 3 個點，地圖標 A、B、C', async () => {
  const h = await harness();
  await h.chat.ask(['toba-yakigai-iroha', 'toba-hakkai', 'toba-osakaya'].map((id) => ({ kind: 'place' as const, id })));
  await h.chat.send('比較這 3 家');
  assert.deepEqual(h.called(), ['get_place', 'show_places']);
  assert.deepEqual(h.app.getState().aiResult?.ids, ['toba-yakigai-iroha', 'toba-hakkai', 'toba-osakaya']);
  assert.equal(h.app.getState().aiResult?.lettered, true);
  assert.match(h.reply(), /A\. .*\nB\. .*\nC\. /);
  h.close();
});

test('S5 路線：分鐘從引擎來、地圖畫線、附 Google Maps 連結', async () => {
  const h = await harness();
  await h.chat.send('從水族館走到珍珠島多久？');
  assert.deepEqual(h.called(), ['get_route', 'show_route']);
  const r = h.lastResult('get_route');
  assert.ok(r.minutes > 0);
  assert.equal(h.app.getState().routes[0].minutes, r.minutes);
  assert.match(h.reply(), new RegExp(`約 ${r.minutes} 分`));
  assert.match(h.reply(), /google\.com\/maps\/dir.*travelmode=walking/);
  h.close();
});

test('S6 留言、想去、候選：留言和候選要按才寫；想去直接做，可以復原', async () => {
  const h = await harness();
  const comments = () => h.shared.store.getState().comments.filter((c) => c.target === 'toba-mikimoto-pearl-island').length;
  const n = comments();
  await h.chat.send('幫我跟大家說媽媽膝蓋不好，珍珠島不要爬太多樓梯');
  assert.equal(comments(), n);
  assert.equal(h.cardOf('draft_comment')?.status, 'pending');
  const id = h.lastUse('draft_comment').id;
  assert.deepEqual(await h.chat.confirmCard(id, { text: '媽媽膝蓋不好，珍珠島不要爬樓梯，謝謝' }), { ok: true });
  assert.equal(comments(), n + 1);
  assert.equal(h.shared.store.getState().comments.at(-1)!.text, '媽媽膝蓋不好，珍珠島不要爬樓梯，謝謝');
  assert.equal(h.cardOf('draft_comment')?.status, 'confirmed');
  // 不能再按一次
  assert.equal((await h.chat.confirmCard(id)).ok, false);
  assert.equal(comments(), n + 1);

  const mine = () => h.shared.store.getState().votes.find((v) => v.placeId === 'toba-aquarium' && v.memberId === h.shared.store.getState().me?.id)?.value ?? null;
  await h.shared.vote('toba-aquarium', 'dislike');
  await h.chat.send('想去水族館');
  assert.equal(mine(), 'like');
  await h.chat.undoCard(h.lastUse('vote').id);
  assert.equal(mine(), 'dislike');

  const cand = () => h.shared.store.getState().candidates.some((c) => c.placeId === 'toba-bay-cruise-irukajima' && c.day === '2027-02-06');
  await h.chat.send('把遊覽船加到 2/6 的候選');
  assert.equal(cand(), false);
  await h.chat.confirmCard(h.lastUse('add_candidate').id);
  assert.equal(cand(), true);
  h.close();
});

test('S7 修改資料：按「確認」才寫進修改層，詳情標已修改、可以復原', async () => {
  const h = await harness();
  const closed = () => h.data.getState().byId.get('toba-osakaya')!.closedNote;
  const before = closed();
  await h.chat.send('大阪屋週三公休');
  assert.equal(closed(), before);
  assert.equal(h.lastResult('propose_place_edit').before, before);
  await h.chat.confirmCard(h.lastUse('propose_place_edit').id);
  assert.equal(closed(), '週三公休');
  const p = h.data.getState().byId.get('toba-osakaya')!;
  assert.ok(p.edited.closedNote);
  assert.equal(p.edited.closedNote.baseValue, before);
  await h.shared.revertEdit(p.edited.closedNote.editId);
  assert.equal(closed(), before);
  h.close();
});

test('S7 拒絕：不寫，下一輪 AI 看得到使用者拒絕了', async () => {
  const h = await harness();
  await h.chat.send('大阪屋週三公休');
  await h.chat.rejectCard(h.lastUse('propose_place_edit').id);
  assert.equal(h.cardOf('propose_place_edit')?.status, 'rejected');
  assert.equal(h.chat.store.getState().decisions[0].status, 'rejected');
  await h.chat.send('想去水族館');
  assert.deepEqual(h.chat.store.getState().decisions, []);
  h.close();
});

test('S8 貼連結：解析座標，打開確認畫面（via ai），沒按不存；短網址要請使用者貼完整網址', async () => {
  const h = await harness();
  const n = h.shared.store.getState().userPlaces.length;
  await h.chat.send('https://www.google.com/maps/place/%E3%83%86%E3%82%B9%E3%83%88/@34.48,136.84,17z/data=!3m1!4b1!4m6!3m5!1s0x0:0x0!8m2!3d34.4812!4d136.8421');
  assert.deepEqual(h.added[0].coords, [136.8421, 34.4812]);
  assert.equal(h.added[0].via, 'ai');
  assert.equal(h.added[0].name, 'テスト');
  assert.equal(h.shared.store.getState().userPlaces.length, n);

  await h.chat.send('https://maps.app.goo.gl/abc123');
  assert.equal(h.added.length, 1);
  assert.match(h.reply(), /短網址/);
  h.close();
});

test('S9 探索清單：晶片帶篩選，結果集收起篩選，✕ 還原', async () => {
  const h = await harness();
  h.app.getState().setFilter({ types: ['restaurant'], areas: ['toba'] });
  const filter = h.app.getState().filter;
  await h.chat.ask([{ kind: 'list', source: 'explore', filter, query: '', count: 10 }]);
  assert.ok(h.chat.store.getState().suggestions.some((s) => s.startsWith('挑 3 家')));
  await h.chat.send('挑 3 家最適合長輩的');
  const { byId } = h.data.getState();
  const ids = h.app.getState().aiResult!.ids;
  assert.equal(ids.length, 3);
  for (const id of ids) {
    const p = byId.get(id)!;
    assert.equal(p.type, 'restaurant');
    assert.equal(p.area, 'toba');
    assert.ok((p.assessment!.scores.elderFit as number) >= 3);
  }
  assert.deepEqual(h.app.getState().filter, EMPTY_FILTER);
  h.commands.clearResult();
  assert.deepEqual(h.app.getState().filter, filter);
  h.close();
});

// --- 行程 ---

test('S10 檢查一天：引擎的警告、候選、有人不喜歡要講；切到那天', async () => {
  const h = await harness();
  await h.chat.ask([{ kind: 'day', date: '2027-02-05' }]);
  await h.chat.send('幫我檢查這天');
  const day = h.lastResult('get_day');
  assert.equal(day.date, '2027-02-05');
  assert.ok(day.entries.length > 0);
  assert.ok(day.candidates.some((c: { id: string }) => c.id === 'toba-osakaya'));
  assert.match(h.allText(), /媽媽 不喜歡 \[\[place:toba-osakaya\]\]/);
  assert.equal(h.app.getState().day, '2027-02-05');
  h.close();
});

test('S11 主流程：不在編輯中也能提議；行程不變；採用 → 確認編輯 → 時間軸更新、有快照、候選拿掉、留在編輯中', async () => {
  const h = await harness();
  assert.equal(h.app.getState().planning, false);
  const before = placesOn(h, DAY3);
  const snapshots = h.shared.store.getState().snapshots.length;
  await h.chat.send('幫我排第 3 天，加午餐');
  assert.deepEqual(h.called(), ['get_day', 'get_opinions', 'search_places', 'suggest_position', 'check_changes', 'propose_changes', 'suggest_replies']);
  // 沒有寫進行程，只在畫面上
  assert.deepEqual(placesOn(h, DAY3), before);
  const proposal = h.app.getState().proposal!;
  assert.deepEqual(proposal.dates, [DAY3]);
  assert.equal(h.app.getState().day, DAY3);
  assert.equal(h.cardOf('propose_changes')?.status, 'pending');
  const added = h.lastUse('propose_changes').input.ops as { place: string }[];
  // 開的時間、坐得下：工具真的篩過
  const found = h.lastResult('search_places').places[0];
  assert.equal(added[0].place, found.id);
  assert.notEqual(found.open, 'closed');
  // 有人不喜歡要講
  assert.match(h.allText(), /阿公 不喜歡 \[\[place:shima-daiozaki-lighthouse\]\]/);

  // 候選也有這個點時，採用要拿掉
  await h.shared.addCandidate(added[0].place, DAY3);
  assert.deepEqual(await h.chat.confirmCard(h.lastUse('propose_changes').id), { ok: true });
  assert.ok(placesOn(h, DAY3).includes(added[0].place));
  assert.equal(h.app.getState().proposal, null);
  assert.equal(h.app.getState().planning, true);
  assert.equal(h.cardOf('propose_changes')?.status, 'confirmed');
  assert.equal(h.shared.store.getState().snapshots.length, snapshots + 1);
  assert.equal(h.shared.store.getState().candidates.some((c) => c.placeId === added[0].place && c.day === DAY3), false);
  // 提示上有復原
  const toast = h.shared.store.getState().toast!;
  assert.equal(toast.action?.label, '復原');
  await toast.action!.run();
  assert.deepEqual(placesOn(h, DAY3), before);
  assert.equal(h.shared.store.getState().candidates.some((c) => c.placeId === added[0].place && c.day === DAY3), true);
  h.close();
});

test('S11 不要、取消：行程都沒變；取消後提議還在，不要才清掉', async () => {
  const h = await harness({ confirm: false });
  const before = placesOn(h, DAY3);
  await h.chat.send('幫我排第 3 天，加午餐');
  const id = h.lastUse('propose_changes').id;
  assert.equal((await h.chat.confirmCard(id)).ok, false);
  assert.deepEqual(placesOn(h, DAY3), before);
  assert.ok(h.app.getState().proposal);
  assert.equal(h.cardOf('propose_changes')?.status, 'pending');
  await h.chat.rejectCard(id);
  assert.equal(h.app.getState().proposal, null);
  assert.deepEqual(placesOn(h, DAY3), before);
  h.close();
});

test('S12 提議過期：別人刪掉要換的那項 → 過期；別人只改其他項 → 照樣套得上、差異重算', async () => {
  const h = await harness();
  await h.chat.send('2/5 午餐換成大阪屋');
  const id = h.lastUse('propose_changes').id;
  assert.ok(h.app.getState().proposal);
  const changes = h.app.getState().proposal!.changes;

  // 別人改其他項目：還在
  const { moveItem, removeItem } = await import('@travel-helper/engine');
  const put = async (fn: (it: never) => never) => {
    const doc = await h.backend.getItinerary();
    await h.backend.putItinerary(doc.version, fn(doc.data as never), 'x');
    await h.shared.loadItinerary();
  };
  await put((it) => moveItem(it, 'i-8', 'up') as never);
  assert.ok(h.app.getState().proposal);
  assert.notEqual(h.app.getState().proposal!.changes, changes);
  assert.equal(h.cardOf('propose_changes')?.status, 'pending');

  // 別人刪掉要換的那項：過期，行程照別人的
  await put((it) => removeItem(it, 'i-7') as never);
  assert.equal(h.app.getState().proposal, null);
  assert.equal(h.cardOf('propose_changes')?.status, 'stale');
  assert.equal((await h.chat.confirmCard(id)).ok, false);
  h.close();
});

test('S13 多天提議：有改動的天都標出來，不切天', async () => {
  const h = await harness();
  await h.chat.send('把還沒排的分到各天');
  const p = h.app.getState().proposal!;
  assert.ok(p.dates.length >= 2, `dates=${p.dates.join()}`);
  assert.equal(h.app.getState().day, 'all');
  await h.chat.confirmCard(h.lastUse('propose_changes').id);
  // 從整趟採用：要先選到一天，編輯才不會被整趟關掉
  assert.equal(h.app.getState().planning, true);
  assert.equal(h.app.getState().day, p.dates[0]);
  h.close();
});

test('S14 提議後接著說：新的取代舊的，舊的卡標「已被新的取代」', async () => {
  const h = await harness();
  await h.chat.send('幫我排第 3 天，加午餐');
  const first = h.lastUse('propose_changes').id;
  const firstOps = JSON.stringify(h.lastUse('propose_changes').input.ops);
  await h.chat.send('換一家不要義大利麵的');
  const second = h.lastUse('propose_changes').id;
  assert.notEqual(first, second);
  assert.notEqual(JSON.stringify(h.lastUse('propose_changes').input.ops), firstOps);
  const cards = Object.assign({}, ...h.chat.store.getState().messages.map((m) => m.cards ?? {}));
  assert.equal(cards[first].status, 'superseded');
  assert.equal(cards[second].status, 'pending');
  assert.equal(h.chat.proposals.store.getState().active?.cardId, second);
  h.close();
});

// --- 狀態 ---

test('S15 不搶畫面：回覆中使用者動過畫面 → 呈現不生效，標 deferred；按「看結果」才呈現', async () => {
  const h = await harness({ delayMs: 5 });
  const run = h.chat.send('鳥羽能坐 15 人的海鮮餐廳');
  await new Promise((r) => setTimeout(r, 2));
  h.app.getState().setMode('wish');
  await run;
  assert.equal(h.app.getState().aiResult, null);
  assert.equal(h.app.getState().mode, 'wish');
  assert.equal(h.cardOf('show_places')?.view, 'deferred');
  assert.deepEqual(h.chat.present(h.lastUse('show_places').id), { ok: true });
  assert.ok(h.app.getState().aiResult);
  assert.equal(h.cardOf('show_places')?.view, 'applied');
  h.close();
});

test('S16 手動接手：打開詳情、切分頁，結果集還在；新的回覆才取代', async () => {
  const h = await harness();
  await h.chat.send('鳥羽能坐 15 人的海鮮餐廳');
  const ids = h.app.getState().aiResult!.ids;
  h.app.getState().openDetail(ids[0]);
  h.app.getState().setMode('map');
  h.app.getState().setMode('explore');
  assert.deepEqual(h.app.getState().aiResult?.ids, ids);
  await h.chat.ask(['toba-hakkai', 'toba-osakaya'].map((id) => ({ kind: 'place' as const, id })));
  h.app.getState().closeDetail();
  await h.chat.send('比較這幾家');
  assert.deepEqual(h.app.getState().aiResult?.ids, ['toba-hakkai', 'toba-osakaya']);
  h.close();
});

test('S17 再看一次：結果集回來，路線照舊（不同類的不取代）', async () => {
  const h = await harness();
  await h.chat.send('鳥羽能坐 15 人的海鮮餐廳');
  const ids = h.app.getState().aiResult!.ids;
  const places = h.lastUse('show_places').id;
  h.commands.clearResult();
  await h.chat.send('從水族館走到珍珠島多久？');
  assert.equal(h.app.getState().routes.length, 1);
  assert.deepEqual(h.chat.present(places), { ok: true });
  assert.deepEqual(h.app.getState().aiResult?.ids, ids);
  assert.equal(h.app.getState().routes.length, 1);
  h.close();
});

test('S18 狀態：思考中、逐字；出錯可以重試；超過每天上限有明確的錯誤', async () => {
  const h = await harness({ delayMs: 1 });
  const seen = new Set<string>();
  const off = h.chat.store.subscribe((s) => void seen.add(s.status));
  await h.chat.send('想去水族館');
  off();
  assert.ok(seen.has('thinking') && seen.has('streaming') && seen.has('tools'));
  assert.equal(h.chat.store.getState().status, 'idle');

  h.model.settings.next = 'error';
  await h.chat.send('想去水族館');
  assert.equal(h.chat.store.getState().error?.code, 'network');
  assert.ok(h.chat.incomplete());
  assert.deepEqual(await h.chat.retry(), { ok: true });
  assert.equal(h.chat.store.getState().error, null);
  assert.equal(h.chat.incomplete(), null);
  // 重試換掉那一輪，沒有多一句
  assert.equal(h.chat.store.getState().messages.filter((m) => m.role === 'user' && m.content[0].type === 'text').length, 2);

  h.model.settings.next = 'quota';
  await h.chat.send('想去水族館');
  assert.equal(h.chat.store.getState().error?.code, 'quota');
  h.close();
});

test('S19 對不到腳本：回可以試的句子', async () => {
  const h = await harness();
  await h.chat.send('今天天氣如何');
  assert.match(h.reply(), /原型只能回答/);
  assert.match(h.reply(), /鳥羽能坐 15 人的海鮮餐廳/);
  assert.deepEqual(h.called(), []);
  h.close();
});

// --- 對話（§11） ---

test('S20 新對話和清單：新對話送出才建立；新的在上面；標題取第一句；舊對話可以接著問', async () => {
  const h = await harness();
  await h.chat.send('鳥羽能坐 15 人的海鮮餐廳');
  const first = h.chat.store.getState().currentId!;
  await h.chat.newConversation();
  assert.equal(h.chat.store.getState().currentId, null);
  assert.equal(h.chat.store.getState().conversations.length, 1);
  await new Promise((r) => setTimeout(r, 2));
  await h.chat.send('想去水族館');
  const list = h.chat.store.getState().conversations;
  assert.deepEqual(list.map((c) => c.title), ['想去水族館', '鳥羽能坐 15 人的海鮮餐廳']);
  await h.chat.switchTo(first);
  assert.match(h.allText(), /符合的有/);
  await new Promise((r) => setTimeout(r, 2));
  await h.chat.send('想去水族館');
  assert.equal(h.chat.store.getState().conversations[0].id, first);
  h.close();
});

test('S20 切換對話：提議清掉、提議卡還在可以重新看；結果集不動；晶片清掉', async () => {
  const h = await harness();
  await h.chat.send('鳥羽能坐 15 人的海鮮餐廳');
  const result = h.app.getState().aiResult;
  await h.chat.send('幫我排第 3 天，加午餐');
  const first = h.chat.store.getState().currentId!;
  const card = h.lastUse('propose_changes').id;
  await h.chat.ask([{ kind: 'trip' }]);
  await h.chat.newConversation();
  assert.equal(h.app.getState().proposal, null);
  assert.deepEqual(h.app.getState().aiResult, result);
  assert.deepEqual(h.chat.store.getState().contexts, []);
  await h.chat.switchTo(first);
  assert.deepEqual(h.chat.present(card), { ok: true });
  assert.ok(h.app.getState().proposal);
  h.close();
});

test('S21 多個使用者：各看各的；切回來原本的還在', async () => {
  const h = await harness();
  await h.chat.send('想去水族館');
  h.backend.setMe('dev-mama');
  await h.shared.reloadMe();
  await new Promise((r) => setTimeout(r, 5));
  assert.deepEqual(h.chat.store.getState().conversations, []);
  assert.deepEqual(h.chat.store.getState().messages, []);
  h.backend.setMe('dev-baba');
  await h.shared.reloadMe();
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(h.chat.store.getState().conversations.length, 1);
  assert.ok(h.chat.store.getState().messages.length > 0);
  h.close();
});

test('S22 對話滿了：快滿還能問；滿了不能送，舊訊息照常；按問 AI 自動開新對話帶晶片', async () => {
  const h = await harness();
  h.model.settings.usage = 'near';
  await h.chat.send('想去水族館');
  assert.equal(h.chat.store.getState().conversations[0].usage, 'near');
  assert.equal(h.chat.isFull(), false);
  h.model.settings.usage = 'full';
  await h.chat.send('鳥羽能坐 15 人的海鮮餐廳');
  assert.equal(h.chat.isFull(), true);
  assert.equal((await h.chat.send('想去水族館')).ok, false);
  // 舊訊息的再看一次照常
  h.commands.clearResult();
  assert.deepEqual(h.chat.present(h.lastUse('show_places').id), { ok: true });

  h.model.settings.usage = 'ok';
  const full = h.chat.store.getState().currentId;
  await h.chat.ask([{ kind: 'place', id: 'toba-osakaya' }]);
  assert.notEqual(h.chat.store.getState().currentId, full);
  assert.equal(h.chat.store.getState().currentId, null);
  assert.equal(h.chat.store.getState().contexts.length, 1);
  h.close();
});

test('S23 重新整理：對話還在；呈現、提議不自動恢復；提議卡用最新的行程重新檢查', async () => {
  const storage = memoryStorage();
  const a = await harness({ storage });
  await a.chat.send('幫我排第 3 天，加午餐');
  const card = a.lastUse('propose_changes').id;
  a.close();

  const b = await harness({ storage });
  assert.ok(b.chat.store.getState().messages.length > 0);
  assert.equal(b.app.getState().proposal, null);
  assert.equal(b.chat.incomplete(), null);
  assert.deepEqual(b.chat.present(card), { ok: true });
  assert.ok(b.app.getState().proposal);
  // 已送出的卡片維持原狀
  await b.chat.rejectCard(card);
  b.close();
  const c = await harness({ storage });
  assert.equal(c.chat.present(card).ok, false);
  c.close();
});

test('S24 回覆中關閉：標沒有回完；送給模型的歷史沒有沒結果的工具呼叫；重試不重複寫入', async () => {
  const storage = memoryStorage();
  const a = await harness({ storage, delayMs: 3 });
  const run = a.chat.send('幫我排第 3 天，加午餐');
  // 等第一輪工具（get_day）存好，下一輪卡住，再關掉
  while (!a.chat.store.getState().messages.some((m) => m.content.some((b) => b.type === 'tool_result'))) await new Promise((r) => setTimeout(r, 1));
  a.close();
  await run;

  const b = await harness({ storage });
  const turn = b.chat.incomplete();
  assert.ok(turn);
  // 沒回完的那輪不送
  assert.deepEqual(toApiMessages(b.chat.store.getState().messages), []);
  const before = placesOn(b, DAY3);
  assert.deepEqual(await b.chat.retry(), { ok: true });
  assert.equal(b.chat.incomplete(), null);
  // 每個工具呼叫都有結果
  const msgs = toApiMessages(b.chat.store.getState().messages);
  const uses = msgs.flatMap((m) => m.content.flatMap((x) => (x.type === 'tool_use' ? [x.id] : [])));
  const results = msgs.flatMap((m) => m.content.flatMap((x) => (x.type === 'tool_result' ? [x.tool_use_id] : [])));
  assert.deepEqual(uses, results);
  assert.equal(b.chat.store.getState().messages.filter((m) => m.role === 'user' && m.content[0].type === 'text').length, 1);
  assert.deepEqual(placesOn(b, DAY3), before);
  b.close();
});

// --- 工具、純函式 ---

test('工具：格式都是 Claude API 的 tools，名字不重複，有規格列的工具', async () => {
  const h = await harness();
  const names = h.chat.tools.map((t) => t.name);
  assert.equal(new Set(names).size, names.length);
  for (const n of ['search_places', 'get_place', 'get_day', 'get_trip_overview', 'check_changes', 'suggest_position', 'get_route', 'get_timetable', 'get_opinions', 'get_trip_info', 'show_places', 'show_route', 'show_day', 'open_place', 'move_map', 'set_filter', 'clear_view', 'propose_changes', 'draft_comment', 'add_candidate', 'propose_place_edit', 'propose_user_place', 'vote', 'suggest_replies']) {
    assert.ok(names.includes(n), n);
  }
  for (const t of h.chat.tools) assert.equal((t.input_schema as { type: string }).type, 'object', t.name);
  h.close();
});

test('工具：get_place 只回要的分區、不帶照片和來源；找不到、分區不對回錯誤', async () => {
  const h = await harness();
  const run = async (name: string, input: Record<string, unknown>) => (await h.chat.tools.find((t) => t.name === name)!.run(input)).output as Record<string, unknown>;
  const r = await run('get_place', { ids: ['toba-osakaya', 'nope'], sections: ['group'] });
  assert.deepEqual(r.unknown, ['nope']);
  const text = JSON.stringify(r);
  assert.ok(!text.includes('"photos"') && !text.includes('"sources"') && !text.includes('"menu"'));
  assert.ok(text.length < 2000);
  assert.equal((await run('get_place', { ids: ['nope'] })).ok, false);
  assert.equal((await run('get_place', { ids: ['toba-osakaya'], sections: ['xx'] })).ok, false);
  h.close();
});

test('工具：get_timetable、get_trip_info、get_trip_overview 拿得到資料；日期不在旅程裡回錯誤', async () => {
  const h = await harness();
  const run = async (name: string, input: Record<string, unknown>) => (await h.chat.tools.find((t) => t.name === name)!.run(input)).output as Record<string, unknown>;
  const tt = await run('get_timetable', { station: 'toba', date: '2027-02-05', after: '10:00' });
  assert.equal(tt.ok, true);
  assert.ok((tt.directions as unknown[]).length > 0);
  const route = h.data.getState().places.length && (await run('get_timetable', { route: '鳥羽', date: '2027-02-05' }));
  assert.ok(route);
  assert.equal((await run('get_timetable', { station: 'toba', date: '2030-01-01' })).ok, false);
  assert.ok(((await run('get_trip_info', { topic: 'passes' })).info as { passes: unknown }).passes);
  assert.equal((await run('get_trip_overview', {})).ok, true);
  assert.equal((await run('get_day', { date: '2030-01-01' })).ok, false);
  h.close();
});

test('工具：show_* 只驗證、不動畫面（一輪結束才呈現）；參數不對回錯誤', async () => {
  const h = await harness();
  const show = h.chat.tools.find((t) => t.name === 'show_places')!;
  const r = await show.run({ ids: ['toba-osakaya', 'nope'], title: '測試' });
  assert.deepEqual(r.output, { ok: true, ids: ['toba-osakaya'], unknown: ['nope'] });
  assert.equal(h.app.getState().aiResult, null);
  assert.equal((await show.run({ ids: ['nope'], title: 'x' })).output.ok, false);
  assert.equal((await h.chat.tools.find((t) => t.name === 'set_filter')!.run({ tiers: ['Z'] })).output.ok, false);
  assert.equal((await h.chat.tools.find((t) => t.name === 'show_day')!.run({ date: '2030-01-01' })).output.ok, false);
  h.close();
});

test('nameScore：中日文、錯字比得到；不相干的比不到', async () => {
  const h = await harness();
  const p = h.data.getState().byId.get('toba-aquarium')!;
  assert.equal(nameScore(p, '水族館'), 1);
  assert.equal(nameScore(p, '鳥羽水族館'), 1);
  assert.ok(nameScore(p, '鳥羽水族舘') >= 0.5);
  assert.ok(nameScore(p, '大阪屋') < 0.5);
  h.close();
});

test('applyOps：一步不行就丟 ItineraryError，原本的行程不變；車站、住宿不能當一般項目', async () => {
  const h = await harness();
  const it = h.data.getState().itinerary!;
  const copy = JSON.stringify(it);
  const ctx = { placeType: (id: string) => h.data.getState().byId.get(id)?.type, likesOf: () => [], me: 'dev-baba' };
  assert.throws(() => applyOps(it, [{ op: 'remove', itemId: 'nope' }], ctx), ItineraryError);
  assert.throws(() => applyOps(it, [{ op: 'add', date: DAY3, place: 'toba' }], ctx), /車站/);
  assert.throws(() => applyOps(it, [{ op: 'add', date: DAY3, place: 'toba-kokusai-hotel' }], ctx), /住宿/);
  assert.throws(() => applyOps(it, [{ op: 'add', date: DAY3, place: 'nope' }], ctx), /沒有資料點/);
  assert.throws(() => applyOps(it, [], ctx), ItineraryError);
  const next = applyOps(it, [{ op: 'replace', itemId: 'i-7', place: 'toba-osakaya' }], ctx);
  const item = next.days.find((d) => d.date === '2027-02-05')!.items.find((x) => x.id === 'i-7')!;
  assert.ok(item.type === 'visit' && item.options[0].place === 'toba-osakaya' && item.options[1].place === 'toba-kazuei');
  assert.equal(JSON.stringify(it), copy);
  h.close();
});

test('transcript：地點標籤、標題、沒回完的輪', () => {
  assert.deepEqual(splitPlaceTags('去 [[place:a]] 和 [[place:b]]！'), [{ text: '去 ' }, { placeId: 'a' }, { text: ' 和 ' }, { placeId: 'b' }, { text: '！' }]);
  assert.equal(titleFrom('  一二三\n四五  '), '一二三 四五');
  assert.equal(titleFrom('一'.repeat(25)), `${'一'.repeat(20)}…`);
  const m = (id: string, turn: string, end = false): ChatMessage => ({ id, turn, createdAt: '', role: 'user', content: [{ type: 'text', text: id }], ...(end ? { end } : {}) });
  const list = [m('1', 'a'), m('2', 'a', true), m('3', 'b')];
  assert.equal(incompleteTurn(list), 'b');
  assert.equal(incompleteTurn(list, 'b'), null);
  assert.equal(toApiMessages(list).length, 2);
  assert.equal(toApiMessages(list, 'b').length, 3);
  assert.equal(toApiMessages([m('1', 'a'), { ...m('2', 'a', true), content: [] }]).length, 1);
});
