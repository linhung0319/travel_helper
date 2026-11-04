// T16m-a 完成條件：規格 §8 每段腳本的工具呼叫和結果（真的資料、時刻表、引擎、假後端；模型是腳本）。畫面由 T16m-b、T16m-c 的 e2e 跑。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { placeFit15 } from '../src/lib/filter.ts';
import { EMPTY_FILTER } from '../src/lib/filter.ts';
import { parseRich, splitPlaceTags, toApiMessages, incompleteTurn, titleFrom, turnsOf } from '../src/ai/transcript.ts';
import { dayDiff } from '../src/lib/proposalDiff.ts';
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
  assert.deepEqual(h.called(), ['search_places', 'get_place', 'show_places']);
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
  assert.ok('kids' in g.places[0] && 'menu' in g.places[0] && !('group' in g.places[0]));
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

test('S8 貼連結：解析座標，打開確認畫面（via ai），沒按不存；短網址交給畫面展開', async () => {
  const h = await harness();
  const n = h.shared.store.getState().userPlaces.length;
  await h.chat.send('https://www.google.com/maps/place/%E3%83%86%E3%82%B9%E3%83%88/@34.48,136.84,17z/data=!3m1!4b1!4m6!3m5!1s0x0:0x0!8m2!3d34.4812!4d136.8421');
  assert.deepEqual(h.added[0].coords, [136.8421, 34.4812]);
  assert.equal(h.added[0].via, 'ai');
  assert.equal(h.added[0].name, 'テスト');
  assert.equal(h.shared.store.getState().userPlaces.length, n);

  await h.chat.send('https://maps.app.goo.gl/abc123');
  assert.equal(h.added.length, 2);
  assert.equal(h.added[1].entry, 'https://maps.app.goo.gl/abc123');
  assert.equal(h.added[1].via, 'ai');
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

test('S11 主流程：不在編輯中也能提議；行程不變；採用 → 時間軸更新、有快照、候選拿掉、不進編輯（T39）', async () => {
  const h = await harness();
  assert.equal(h.app.getState().planning, false);
  const before = placesOn(h, DAY3);
  const snapshots = h.shared.store.getState().snapshots.length;
  await h.chat.send('幫我排第 3 天，加午餐');
  assert.deepEqual(h.called(), ['get_day', 'get_opinions', 'search_places', 'suggest_position', 'check_changes', 'propose_changes']);
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
  assert.equal(h.app.getState().planning, false);
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

test('S11 不要：行程沒變，提議清掉', async () => {
  const h = await harness();
  const before = placesOn(h, DAY3);
  await h.chat.send('幫我排第 3 天，加午餐');
  const id = h.lastUse('propose_changes').id;
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

test('S13 多天提議：有改動的天都標出來，跳到整趟；採用後留在整趟（T48）', async () => {
  const h = await harness();
  h.app.getState().selectDay('2027-02-05');
  await h.chat.send('把還沒排的分到各天');
  const p = h.app.getState().proposal!;
  assert.ok(p.dates.length >= 2, `dates=${p.dates.join()}`);
  assert.equal(h.app.getState().day, 'all');
  await h.chat.confirmCard(h.lastUse('propose_changes').id);
  assert.equal(h.app.getState().planning, false);
  assert.equal(h.app.getState().day, 'all');
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
  // 採用過的卡片維持原狀，不能再看、再按一次
  assert.deepEqual(await b.chat.confirmCard(card), { ok: true });
  b.close();
  const c = await harness({ storage });
  assert.equal(c.chat.present(card).ok, false);
  assert.equal((await c.chat.confirmCard(card)).ok, false);
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

// --- 接著改、用說的決定（規格 §3.3、§3.5） ---

const itineraryOf = (h: Awaited<ReturnType<typeof harness>>) => JSON.stringify(h.data.getState().itinerary);
const cardsOf = (h: Awaited<ReturnType<typeof harness>>) => Object.assign({}, ...h.chat.store.getState().messages.map((m) => m.cards ?? {}));
const PEARL = 'toba-mikimoto-pearl-island';

test('S25 邊聊邊改：看得到提議後的行程；每版是完整清單；舊卡被取代；行程一直沒變', async () => {
  const h = await harness();
  const before = itineraryOf(h);
  await h.chat.send('幫我排第 3 天，加午餐');
  const v1 = h.lastUse('propose_changes');
  await h.chat.send('再加珍珠島，排在午餐後面');
  const v2 = h.lastUse('propose_changes');
  // 看的是提議後的行程：有剛剛的午餐，而且標 draftOnly（ID 不能用在 ops）
  const day = h.lastResult('get_day');
  assert.equal(day.on, 'draft');
  const lunch = (v1.input.ops as any[])[0].place;
  assert.ok(day.entries.some((e: any) => e.placeId === lunch && e.draftOnly));
  // 完整清單：兩個 add，不是疊加
  assert.deepEqual((v2.input.ops as any[]).map((o) => o.place), [lunch, PEARL]);
  await h.chat.send('把珍珠島移到午餐前面');
  const v3 = h.lastUse('propose_changes');
  const stops = () => h.app.getState().proposal!.itinerary.days.find((d) => d.date === '2027-02-04')!.items.flatMap((i) => (i.type === 'visit' ? [i.options[i.selected].place] : []));
  assert.ok(stops().indexOf(PEARL) < stops().indexOf(lunch));
  const cards = cardsOf(h);
  assert.equal(cards[v1.id].status, 'superseded');
  assert.equal(cards[v2.id].status, 'superseded');
  assert.equal(cards[v3.id].status, 'pending');
  assert.equal(itineraryOf(h), before);
  h.close();
});

test('S25 沒有提議時，on=draft 回明確的錯誤', async () => {
  const h = await harness();
  const run = (name: string, input: Record<string, unknown>) => h.chat.tools.find((t) => t.name === name)!.run(input);
  assert.equal((await run('get_day', { date: '2027-02-04', on: 'draft' })).output.ok, false);
  assert.equal((await run('suggest_position', { placeId: PEARL, date: '2027-02-04', on: 'draft' })).output.ok, false);
  h.close();
});

test('S26 回到上一版：舊版變成目前這版，新版被取代；可以再切回去；按鈕和用說的一樣', async () => {
  const h = await harness();
  await h.chat.send('幫我排第 3 天，加午餐');
  const v1 = h.lastUse('propose_changes').id;
  await h.chat.send('換一家不要義大利麵的');
  const v2 = h.lastUse('propose_changes').id;
  await h.chat.send('剛剛那版比較好');
  assert.equal(h.chat.proposals.store.getState().active?.cardId, v1);
  assert.equal(cardsOf(h)[v1].status, 'pending');
  assert.equal(cardsOf(h)[v2].status, 'superseded');
  assert.deepEqual(h.chat.present(v2), { ok: true });
  assert.equal(h.chat.proposals.store.getState().active?.cardId, v2);
  assert.equal(cardsOf(h)[v1].status, 'superseded');
  // 同時只有一版在等決定：不要了也能再打開
  await h.chat.rejectCard(v2);
  assert.equal(h.chat.proposals.store.getState().active, null);
  assert.deepEqual(h.chat.present(v2), { ok: true });
  assert.equal(cardsOf(h)[v2].status, 'pending');
  h.close();
});

test('S27 用說的採用：走同一條路；其他版沒有用上、不能再開；按復原後這版可以再開', async () => {
  const h = await harness();
  const before = itineraryOf(h);
  await h.chat.send('幫我排第 3 天，加午餐');
  const v1 = h.lastUse('propose_changes').id;
  await h.chat.send('換一家不要義大利麵的');
  const v2 = h.lastUse('propose_changes').id;
  await h.chat.send('採用');
  assert.equal(h.lastResult('decide_card').ok, true);
  assert.notEqual(itineraryOf(h), before);
  assert.equal(h.app.getState().planning, false);
  assert.equal(h.app.getState().proposal, null);
  assert.equal(cardsOf(h)[v2].status, 'confirmed');
  assert.equal(cardsOf(h)[v1].status, 'closed');
  assert.equal(h.chat.present(v1).ok, false);
  // 復原：行程回去，卡片標已復原，這版可以再打開
  await h.shared.store.getState().toast!.action!.run();
  assert.equal(itineraryOf(h), before);
  assert.equal(cardsOf(h)[v2].status, 'undone');
  assert.deepEqual(h.chat.present(v2), { ok: true });
  assert.equal(cardsOf(h)[v2].status, 'pending');
  h.close();
});

test('T39 用說的採用：不經過編輯模式，直接寫入，有復原', async () => {
  const h = await harness();
  const before = itineraryOf(h);
  await h.chat.send('幫我排第 3 天，加午餐');
  await h.chat.send('採用');
  assert.equal(h.lastResult('decide_card').ok, true);
  assert.notEqual(itineraryOf(h), before);
  assert.equal(h.app.getState().planning, false);
  assert.match(h.shared.store.getState().toast?.text ?? '', /^已採用提議/);
  h.close();
});

test('S27 已經在編輯中：留在編輯中，直接寫入，有復原', async () => {
  const h = await harness();
  await h.chat.send('幫我排第 3 天，加午餐');
  h.app.getState().selectDay('2027-02-04');
  h.app.getState().setPlanning(true);
  await h.chat.send('採用');
  assert.equal(h.lastResult('decide_card').ok, true);
  assert.equal(h.app.getState().planning, true);
  assert.match(h.shared.store.getState().toast?.text ?? '', /^已採用提議/);
  h.close();
});

test('S27 不要了；同一輪出的卡不能決定；沒顯示的提議要先看；留言也能用說的送', async () => {
  const h = await harness();
  const before = itineraryOf(h);
  await h.chat.send('幫我排第 3 天，加午餐');
  await h.chat.send('不要了');
  assert.equal(h.app.getState().proposal, null);
  assert.equal(itineraryOf(h), before);
  assert.deepEqual(h.chat.store.getState().decisions.at(-1)?.status, 'rejected');

  // 新對話才看得出來：提議還沒顯示就不能採用
  await h.chat.send('幫我排第 3 天，加午餐');
  const card = h.lastUse('propose_changes').id;
  h.chat.proposals.hide();
  const decide = h.chat.tools.find((t) => t.name === 'decide_card')!;
  const hidden = await decide.run({ cardId: card, decision: 'confirm' });
  assert.equal(hidden.output.ok, false);
  assert.match(String((hidden.output as { error: string }).error), /show_again/);
  assert.equal(itineraryOf(h), before);

  await h.chat.send('幫我跟大家說媽媽膝蓋不好，珍珠島不要爬太多樓梯');
  const n = h.shared.store.getState().comments.length;
  await h.chat.send('送出吧');
  assert.equal(h.shared.store.getState().comments.length, n + 1);
  assert.equal(h.cardOf('draft_comment')?.status, 'confirmed');
  h.close();
});

test('S27 這一輪才出的卡不能決定：「移到前面然後採用」只出新的一版', async () => {
  const h = await harness();
  const before = itineraryOf(h);
  await h.chat.send('幫我排第 3 天，加午餐');
  await h.chat.send('再加珍珠島，排在午餐後面');
  await h.chat.send('把珍珠島移到午餐前面然後採用');
  assert.equal(itineraryOf(h), before);
  assert.equal(h.called().includes('decide_card'), false);
  assert.match(h.reply(), /還沒看過/);
  // 工具本身也擋：模型直接呼叫時，這一輪的卡回錯誤
  const model = h.model.send.bind(h.model);
  let sent = false;
  h.model.send = async function* (req, signal) {
    const proposed = req.messages.at(-2)?.content.find((b) => b.type === 'tool_use' && b.name === 'propose_changes');
    if (proposed?.type === 'tool_use' && !sent) {
      sent = true;
      yield { type: 'tool_use', id: 'same-turn', name: 'decide_card', input: { cardId: proposed.id, decision: 'confirm' } };
      yield { type: 'done', usage: 'ok' };
      return;
    }
    yield* model(req, signal);
  };
  await h.chat.send('把珍珠島移到午餐前面');
  const r = h.chat.store.getState().messages.flatMap((m) => m.content).find((b) => b.type === 'tool_result' && b.tool_use_id === 'same-turn');
  assert.match(JSON.stringify(r), /這一輪才出現/);
  assert.equal(itineraryOf(h), before);
  h.close();
});

test('過期的提議可以按不要收掉', async () => {
  const h = await harness();
  await h.chat.send('2/5 午餐換成大阪屋');
  const card = h.lastUse('propose_changes').id;
  const it = h.data.getState().itinerary!;
  await h.shared.changeItinerary((x) => ({ ...x, days: x.days.map((d) => ({ ...d, items: d.items.filter((i) => i.id !== 'i-7') })) }), '別人刪掉');
  assert.notEqual(h.data.getState().itinerary, it);
  assert.equal(cardsOf(h)[card].status, 'stale');
  assert.deepEqual(await h.chat.rejectCard(card), { ok: true });
  assert.equal(cardsOf(h)[card].status, 'rejected');
  h.close();
});

test('S28 結果集：累加保留理由、拿掉一家照順序、新問題取代、舊的再看一次回得來', async () => {
  const h = await harness();
  await h.chat.send('鳥羽能坐 15 人的海鮮餐廳');
  const first = h.lastUse('show_places').id;
  const ids = [...h.app.getState().aiResult!.ids];
  const notes = { ...h.app.getState().aiResult!.notes };
  await h.chat.send('再多找幾家');
  const r = h.app.getState().aiResult!;
  assert.equal(r.ids.length, 5);
  assert.deepEqual(r.ids.slice(0, 3), ids);
  assert.equal(r.notes[ids[0]], notes[ids[0]]);
  await h.chat.send('拿掉第二家');
  assert.deepEqual(h.app.getState().aiResult!.ids, [r.ids[0], ...r.ids.slice(2)]);
  await h.chat.send('那伊勢有什麼海鮮');
  assert.equal(h.app.getState().aiResult!.title, '伊勢的餐廳');
  assert.deepEqual(h.chat.present(first), { ok: true });
  assert.deepEqual(h.app.getState().aiResult!.ids, ids);
  h.close();
});

test('S29 一次處理多個：想去一顆復原還原每一家；候選一張卡全部加入', async () => {
  const h = await harness();
  await h.chat.send('鳥羽能坐 15 人的海鮮餐廳');
  const ids = [...h.app.getState().aiResult!.ids];
  const mine = (id: string) => h.shared.store.getState().votes.find((v) => v.placeId === id && v.memberId === h.shared.store.getState().me?.id)?.value ?? null;
  await h.shared.vote(ids[0], 'dislike');
  await h.chat.send('這幾家都按想去');
  assert.deepEqual(ids.map(mine), ['like', 'like', 'like']);
  await h.chat.undoCard(h.lastUse('vote').id);
  assert.deepEqual(ids.map(mine), ['dislike', null, null]);

  await h.chat.send('都加到 2/5 候選');
  const has = (id: string) => h.shared.store.getState().candidates.some((c) => c.placeId === id && c.day === '2027-02-05');
  assert.equal(ids.some(has), false);
  assert.deepEqual(await h.chat.confirmCard(h.lastUse('add_candidate').id), { ok: true });
  assert.equal(ids.every(has), true);
  h.close();
});

test('多個地點晶片：建議問題換成比較、怎麼排；輸入框的字跟著核心，換對話才清掉；✕ 拿掉的正在看拿得回來', async () => {
  const h = await harness();
  await h.chat.ask([{ kind: 'place', id: 'toba-osakaya' }]);
  assert.match(h.chat.store.getState().suggestions[0], /15 人/);
  await h.chat.ask([{ kind: 'place', id: 'toba-hakkai' }]);
  assert.deepEqual(h.chat.store.getState().suggestions, ['比較這 2 家', '這 2 個排哪天比較順？']);
  h.chat.setDraftText('打到一半');
  h.chat.setScreenOff(true);
  h.chat.setScreenOff(false);
  assert.equal(h.chat.store.getState().screenOff, false);
  assert.equal(h.chat.store.getState().draftText, '打到一半');
  await h.chat.newConversation();
  assert.equal(h.chat.store.getState().draftText, '');
  h.close();
});

test('提議卡的新警告：照操作清單算；算不出來是空的', async () => {
  const h = await harness();
  assert.deepEqual(h.chat.newWarnings([{ op: 'remove', itemId: '不存在' }] as never), []);
  // 有警告的提議：坐不下、打烊；只有資訊類的（計程車台數這類）不算
  assert.deepEqual(h.chat.newWarnings([{ op: 'replace', itemId: 'i-7', place: 'toba-osakaya' }] as never), ['全員 15 人：要分桌或分批（fit15: split），要先打電話確認', '17:54 已經打烊（營業到 17:00）']);
  h.close();
});

test('S30 指稱：選中的點、結果集的第二家；晶片優先於畫面；✕ 拿掉正在看時不帶', async () => {
  const h = await harness();
  h.app.getState().select('toba-osakaya');
  await h.chat.send('這家 15 人坐得下嗎？');
  assert.deepEqual(h.lastUse('get_place').input.ids, ['toba-osakaya']);
  await h.chat.ask([{ kind: 'place', id: 'toba-hakkai' }]);
  await h.chat.send('這家 15 人坐得下嗎？');
  assert.deepEqual(h.lastUse('get_place').input.ids, ['toba-hakkai']);
  h.chat.removeContext(0);

  await h.chat.send('鳥羽能坐 15 人的海鮮餐廳');
  const ids = h.app.getState().aiResult!.ids;
  await h.chat.send('第二家坐得下嗎？');
  assert.deepEqual(h.lastUse('get_place').input.ids, [ids[1]]);

  h.chat.setScreenOff(true);
  await h.chat.send('這家 15 人坐得下嗎？');
  assert.match(h.reply(), /哪一家/);
  h.close();
});

test('S31 手動才有的操作：主選、備註、自由時間、撤下回候選（復原也回去）', async () => {
  const h = await harness();
  const item = (id: string) => h.data.getState().itinerary!.days.flatMap((d) => d.items).find((i) => i.id === id) as any;
  const adopt = async () => assert.deepEqual(await h.chat.confirmCard(h.lastUse('propose_changes').id), { ok: true });

  await h.chat.send('2/5 午餐這次改選一榮');
  await adopt();
  assert.equal(item('i-7').options[item('i-7').selected].place, 'toba-kazuei');

  await h.chat.send('2/5 午餐備註寫客滿就去漣');
  await adopt();
  assert.equal(item('i-7').note, '客滿就去漣');

  const items = () => h.data.getState().itinerary!.days.find((d) => d.date === '2027-02-05')!.items;
  await h.chat.send('2/5 留 30 分自由時間');
  await adopt();
  assert.ok(items().some((i) => i.type === 'free' && i.minutes === 30));

  const cand = () => h.shared.store.getState().candidates.some((c) => c.placeId === 'toba-aquarium' && c.day === '2027-02-05');
  const scheduled = () => items().some((i) => i.type === 'visit' && i.options.some((o) => o.place === 'toba-aquarium'));
  assert.equal(scheduled(), true);
  await h.chat.send('撤下 2/5 的水族館');
  assert.equal(cand(), false);
  await adopt();
  assert.equal(scheduled(), false);
  assert.equal(cand(), true);
  await h.shared.store.getState().toast!.action!.run();
  assert.equal(scheduled(), true);
  assert.equal(cand(), false);
  h.close();
});

test('S31 候選：別人加的要理由，理由變成留言；別人加的不能移；自己加的可以', async () => {
  const h = await harness();
  const has = (date: string) => h.shared.store.getState().candidates.some((c) => c.placeId === 'toba-bay-cruise-irukajima' && c.day === date);
  await h.chat.send('把遊覽船從 2/5 候選拿掉');
  assert.equal(h.lastResult('remove_candidate').ok, false);
  await h.chat.send('把遊覽船從 2/5 候選拿掉，因為太冷');
  assert.equal(has('2027-02-05'), true);
  assert.deepEqual(await h.chat.confirmCard(h.lastUse('remove_candidate').id), { ok: true });
  assert.equal(has('2027-02-05'), false);
  assert.match(h.shared.store.getState().comments.at(-1)!.text, /太冷/);

  await h.chat.send('把遊覽船加到 2/6 的候選');
  await h.chat.confirmCard(h.lastUse('add_candidate').id);
  await h.chat.send('把遊覽船的候選從 2/6 移到 2/7');
  assert.deepEqual(await h.chat.confirmCard(h.lastUse('move_candidate').id), { ok: true });
  assert.equal(has('2027-02-06'), false);
  assert.equal(has('2027-02-07'), true);
  h.close();
});

test('S32 預約：查得到清單；按了才標已訂；清單沒有的項目回錯誤', async () => {
  const h = await harness();
  await h.chat.send('哪幾家還沒訂？');
  const rows = h.lastResult('get_reservations').rows;
  assert.ok(rows.length > 0);
  assert.ok(rows.every((r: any) => r.status === 'pending'));
  const row = rows[0];
  const state = () => h.shared.store.getState().reservations.find((r) => r.date === row.date && r.placeId === row.placeId)?.status ?? 'pending';
  await h.chat.send(`${row.name}訂好了`);
  assert.equal(state(), 'pending');
  assert.deepEqual(await h.chat.confirmCard(h.lastUse('set_reservation').id), { ok: true });
  assert.equal(state(), 'booked');
  const set = h.chat.tools.find((t) => t.name === 'set_reservation')!;
  assert.equal((await set.run({ date: '2027-02-05', placeId: 'toba-aquarium-nope', status: 'booked' })).output.ok, false);
  h.close();
});

test('S33 切畫面：切分頁；打開面板交給平台', async () => {
  const h = await harness();
  await h.chat.send('打開想去');
  assert.equal(h.app.getState().mode, 'wish');
  await h.chat.send('給我看討論');
  assert.equal(h.lastResult('show_screen').ok, true);
  const screen = h.chat.tools.find((t) => t.name === 'show_screen')!;
  assert.equal((await screen.run({})).output.ok, false);
  assert.equal((await screen.run({ tab: 'wish', panel: 'comments' })).output.ok, false);
  h.close();
});

test('S34 停止：不呈現；已進來的字留著、標沒有回完；可以重試，也可以直接問新的', async () => {
  const h = await harness({ delayMs: 5 });
  const r = h.chat.send('鳥羽能坐 15 人的海鮮餐廳');
  await new Promise<void>((resolve) => {
    const off = h.chat.store.subscribe((s) => {
      if (s.status === 'streaming') {
        off();
        resolve();
      }
    });
  });
  await h.chat.stop();
  await r;
  assert.equal(h.chat.store.getState().status, 'idle');
  assert.equal(h.app.getState().aiResult, null);
  assert.ok(h.chat.incomplete());
  assert.ok(h.reply().length > 0);
  // 不留下沒結果的工具呼叫
  const uses = h.chat.store.getState().messages.flatMap((m) => m.content.flatMap((b) => (b.type === 'tool_use' ? [b.id] : [])));
  const results = h.chat.store.getState().messages.flatMap((m) => m.content.flatMap((b) => (b.type === 'tool_result' ? [b.tool_use_id] : [])));
  assert.deepEqual(uses, results);
  h.model.settings.delayMs = 0;
  assert.deepEqual(await h.chat.retry(), { ok: true });
  assert.equal(h.chat.incomplete(), null);
  assert.ok(h.app.getState().aiResult);
  h.close();
});

test('脈絡：draft 帶完整的操作，cards 帶等決定的卡和提議的每一版', async () => {
  const h = await harness();
  const requests: { draft: unknown; cards: { id: string; tool: string; status: string }[] }[] = [];
  const send = h.model.send.bind(h.model);
  h.model.send = (req, signal) => {
    requests.push({ draft: req.context.draft, cards: req.context.cards });
    return send(req, signal);
  };
  await h.chat.send('幫我排第 3 天，加午餐');
  const v1 = h.lastUse('propose_changes');
  await h.chat.send('幫我跟大家說媽媽膝蓋不好，珍珠島不要爬太多樓梯');
  const last = requests.at(-1)!;
  assert.deepEqual((last.draft as { ops: unknown }).ops, v1.input.ops);
  assert.deepEqual(last.cards.map((c) => [c.id, c.status]), [[v1.id, 'pending']]);
  await h.chat.send('換一家不要義大利麵的');
  assert.deepEqual(requests.at(-1)!.cards.map((c) => c.tool), ['propose_changes', 'draft_comment']);
  h.close();
});

test('T36 脈絡：晶片只在第一次帶完整內容，之後同一個晶片只帶 repeated；換一個晶片照樣帶完整的', async () => {
  const h = await harness();
  const chips: Record<string, unknown>[][] = [];
  const send = h.model.send.bind(h.model);
  h.model.send = (req, signal) => {
    chips.push(req.context.chips as Record<string, unknown>[]);
    return send(req, signal);
  };
  await h.chat.ask([{ kind: 'day', date: '2027-02-05' }]);
  await h.chat.send('幫我檢查這天');
  const first = chips.at(-1)!;
  assert.ok(first[0].day && !first[0].repeated);
  const n = chips.length;
  await h.chat.send('長輩會不會太累？');
  const second = chips[n];
  assert.deepEqual(second, [{ kind: 'day', date: '2027-02-05', repeated: true }]);
  // 新加的晶片帶完整的，舊的仍是 repeated
  await h.chat.ask([{ kind: 'place', id: 'toba-aquarium' }]);
  const m = chips.length;
  await h.chat.send('這兩個怎麼排');
  const third = chips[m];
  assert.equal(third[0].repeated, true);
  assert.ok(third[1].place && !third[1].repeated);
  // 換新對話：重新帶完整的
  await h.chat.newConversation();
  await h.chat.ask([{ kind: 'day', date: '2027-02-05' }]);
  const k = chips.length;
  await h.chat.send('幫我檢查這天');
  assert.ok(chips[k][0].day);
  h.close();
});

test('T36 決定：加候選（placeIds）的決定摘要有地點，不是空的', async () => {
  const h = await harness();
  await h.chat.send('把遊覽船加到 2/6 的候選');
  const use = h.lastUse('add_candidate');
  assert.equal((await h.chat.confirmCard(use.id)).ok, true);
  const d = h.chat.store.getState().decisions;
  assert.equal(d.at(-1)!.tool, 'add_candidate');
  assert.match(d.at(-1)!.summary, /toba-bay-cruise-irukajima/);
  h.close();
});

test('applyOps：新的操作：選項要在卡上；自由時間要有分鐘；撤下只能是地點的卡', async () => {
  const h = await harness();
  const check = h.chat.tools.find((t) => t.name === 'check_changes')!;
  const run = async (ops: unknown[]) => (await check.run({ ops })).output;
  assert.equal((await run([{ op: 'selectOption', itemId: 'i-7', place: 'toba-aquarium' }])).ok, false);
  assert.equal((await run([{ op: 'removeOption', itemId: 'i-7', place: 'toba-sazanami' }])).ok, true);
  assert.equal((await run([{ op: 'addFree', date: '2027-02-05', minutes: 0 }])).ok, false);
  assert.equal((await run([{ op: 'withdraw', itemId: 'no-such' }])).ok, false);
  h.close();
});

test('parseRich：地點標籤、粗體、條列、連結；只認 http(s)，其他照原文', () => {
  assert.deepEqual(parseRich('先看 [[place:a]]，**很近**\n\n- 第一\n- [路線](https://x.test/y)\n全員走約 5 分。路線：https://www.google.com/maps/dir/?api=1'), [
    { kind: 'p', parts: [{ text: '先看 ' }, { place: 'a' }, { text: '，' }, { text: '很近', bold: true }] },
    { kind: 'list', items: [[{ text: '第一' }], [{ href: 'https://x.test/y', label: '路線' }]] },
    { kind: 'p', parts: [{ text: '全員走約 5 分。路線：' }, { href: 'https://www.google.com/maps/dir/?api=1', label: 'Google Maps' }] },
  ]);
  assert.deepEqual(parseRich('[壞連結](javascript:alert(1)) # 標題'), [{ kind: 'p', parts: [{ text: '[壞連結](javascript:alert(1)) # 標題' }] }]);
});

test('turnsOf：一輪一組；查資料併起來、快速選項分開；決定、再看一次不畫卡片', async () => {
  const h = await harness();
  await h.chat.send('鳥羽能坐 15 人的海鮮餐廳');
  const read = new Set(h.chat.tools.filter((t) => t.kind === 'read').map((t) => t.name));
  const [t] = turnsOf(h.chat.store.getState().messages, read);
  assert.equal(t.user, '鳥羽能坐 15 人的海鮮餐廳');
  assert.deepEqual(t.reads.map((x) => x.name), ['search_places', 'get_place']);
  assert.deepEqual(t.uses.map((x) => x.block.name), ['show_places']);
  assert.equal(t.uses[0].card?.view, 'applied');
  assert.equal(t.replies.length, 2);
  assert.equal(t.texts.length, 1);
  h.close();
});

test('dayDiff：新增、換掉、拿掉、移到別天', async () => {
  const h = await harness();
  const check = h.chat.tools.find((t) => t.name === 'check_changes')!;
  const before = h.data.getState().itinerary!;
  const ops = [
    { op: 'replace', itemId: 'i-7', place: 'toba-osakaya' },
    { op: 'remove', itemId: 'i-21' },
    { op: 'move', itemId: 'i-8', date: '2027-02-06' },
    { op: 'add', date: '2027-02-05', place: 'toba-hakkai', index: 0 },
  ];
  const out = (await check.run({ ops })).output as unknown as { changes: never[] };
  const after = applyOps(before, ops as never, { placeType: (id) => h.data.getState().byId.get(id)?.type, likesOf: () => [], me: null });
  const d = dayDiff(out.changes, before, after, '2027-02-05');
  assert.deepEqual(d.ghosts.map((g) => [g.itemId, g.beforeItemId, g.movedTo]), [
    ['i-21', 'i-6', null],
    ['i-7', 'i-7', null],
    ['i-8', null, '2027-02-06'],
  ]);
  assert.equal(d.ghosts[1].place, 'toba-sazanami');
  assert.equal(d.ghosts[2].place, 'toba-mikimoto-pearl-island');
  assert.ok(d.marked.has('i-7'));
  assert.equal(d.marked.size, 2);
  // 被移過去的那天標提議
  assert.ok(dayDiff(out.changes, before, after, '2027-02-06').marked.has('i-8'));
  h.close();
});

test('摘要：換點講前後，其他欄位用看得懂的字，不露內部欄位名', async () => {
  const h = await harness();
  const check = h.chat.tools.find((t) => t.name === 'check_changes')!;
  const summary = async (ops: unknown[]) => ((await check.run({ ops })).output as unknown as { summary: string[] }).summary.join('；');
  assert.match(await summary([{ op: 'replace', itemId: 'i-7', place: 'toba-osakaya' }]), /^2\/5：.+ → 大阪屋 鳥羽店 \d/);
  assert.match(await summary([{ op: 'selectOption', itemId: 'i-7', place: 'toba-kazuei' }]), /^2\/5：.+ → .+ \d/);
  assert.match(await summary([{ op: 'setNote', itemId: 'i-7', note: '客滿' }]), /改了備註/);
  assert.match(await summary([{ op: 'setTags', itemId: 'i-7', tags: ['dinner'] }]), /改了標籤/);
  assert.match(await summary([{ op: 'removeOption', itemId: 'i-7', place: 'toba-kazuei' }]), /改了備選/);
  assert.doesNotMatch(await summary([{ op: 'setStay', itemId: 'i-7', minutes: 30 }]), /stayMinutes|options/);
  h.close();
});

test('工具：格式都是 Claude API 的 tools，名字不重複，有規格列的工具', async () => {
  const h = await harness();
  const names = h.chat.tools.map((t) => t.name);
  assert.equal(new Set(names).size, names.length);
  for (const n of ['search_places', 'get_place', 'get_day', 'get_trip_overview', 'check_changes', 'suggest_position', 'get_route', 'get_timetable', 'get_opinions', 'get_trip_info', 'show_places', 'show_route', 'show_day', 'open_place', 'move_map', 'set_filter', 'clear_view', 'propose_changes', 'draft_comment', 'add_candidate', 'propose_place_edit', 'propose_user_place', 'vote', 'get_reservations', 'show_screen', 'show_again', 'remove_candidate', 'move_candidate', 'set_reservation', 'decide_card']) {
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
  assert.equal((await run('get_trip_overview', {})).ok, true);
  assert.equal((await run('get_day', { date: '2030-01-01' })).ok, false);
  h.close();
});

test('T36 get_trip_info：只回要的分項、沒有來源；沒給分項、分項不對回錯誤並列出可用的', async () => {
  const h = await harness();
  const run = async (name: string, input: Record<string, unknown>) => (await h.chat.tools.find((t) => t.name === name)!.run(input)).output as Record<string, unknown>;
  const passes = await run('get_trip_info', { topic: 'passes', sections: ['passes', 'comparison'] });
  assert.ok(passes.passes && passes.comparison && !('fares' in passes));
  const air = await run('get_trip_info', { topic: 'airport', sections: ['day1'] });
  assert.ok(air.day1);
  for (const r of [passes, air]) assert.ok(!/"(sources|retrieved|basedOn)"/.test(JSON.stringify(r)));
  // 機場的 day1 一份就夠回答「第一天怎麼去」，比整份小很多
  assert.ok(JSON.stringify(air).length < 5000);
  const none = await run('get_trip_info', { topic: 'airport' });
  assert.equal(none.ok, false);
  assert.match(String(none.error), /day1/);
  assert.equal((await run('get_trip_info', { topic: 'passes', sections: ['day1'] })).ok, false);
  assert.ok((await run('get_trip_info', { topic: 'party' })).party);
  h.close();
});

test('T36 get_timetable 路線：給上下車站只回兩站的時間、站名直接寫；沒給 after 從頭列（中途站 9 點前的班不漏）', async () => {
  const h = await harness();
  const run = async (name: string, input: Record<string, unknown>) => (await h.chat.tools.find((t) => t.name === name)!.run(input)).output as Record<string, unknown>;
  type Trip = { from: string; depart: string; to: string; arrive: string };
  const r = await run('get_timetable', { route: 'kamome-2-wistarian', date: '2027-02-06', from: '鳥羽駅', to: 'ウィスタリアン' });
  assert.equal(r.ok, true);
  const trips = r.trips as Trip[];
  assert.ok(trips.length > 0);
  for (const t of trips) {
    assert.match(t.from, /鳥羽駅/);
    assert.match(t.to, /ウィスタリアン/);
    assert.ok(t.depart < t.arrive);
  }
  // 模擬時漏掉的 08:17：以前用第一站的時間濾 9 點以後。這班經過鳥羽駅兩次（08:11 繞マリンターミナル、08:17 再回來），取 08:17 那次，同引擎的 get_route
  assert.ok(trips.some((t) => t.depart === '08:17' && t.arrive === '08:45'), JSON.stringify(trips));
  assert.ok(!trips.some((t) => t.depart === '08:11'), JSON.stringify(trips));
  assert.ok(!('stops' in r));
  assert.ok(JSON.stringify(r).length < 2000);
  // 沒給站：站名清單（不重複、不是代號）和每班起訖
  const all = await run('get_timetable', { route: 'kamome-2-wistarian', date: '2027-02-06' });
  const stops = all.stops as string[];
  assert.equal(new Set(stops).size, stops.length);
  assert.ok(stops.includes('鳥羽駅'));
  assert.ok((all.trips as { first: unknown }[])[0].first);
  // 站名對不到：回空的，附站名
  const miss = await run('get_timetable', { route: 'kamome-2-wistarian', date: '2027-02-06', from: '不存在的站' });
  assert.deepEqual(miss.trips, []);
  assert.ok(miss.stops);
  h.close();
});

test('T36 get_place：分區的欄位直接放在點上，來源網址和產生日期拿掉', async () => {
  const h = await harness();
  const r = (await h.chat.tools.find((t) => t.name === 'get_place')!.run({ ids: ['toba-osakaya'], sections: ['summary', 'assessment'] })).output as unknown as { places: Record<string, unknown>[] };
  const p = r.places[0];
  assert.ok((p.summary as { text: string }).text);
  assert.ok((p.assessment as { scores: unknown }).scores);
  assert.ok(!/"(basedOn|generated|assessed|sources)"/.test(JSON.stringify(p)));
  h.close();
});

test('T36 get_day：一樣的警告併成一則，itemIds 列出是哪幾項', async () => {
  const h = await harness();
  const r = (await h.chat.tools.find((t) => t.name === 'get_day')!.run({ date: '2027-02-04' })).output as unknown as { warnings: { level: string; message: string; itemIds: string[] }[] };
  const keys = r.warnings.map((w) => `${w.level}${w.message}`);
  assert.equal(new Set(keys).size, keys.length);
  assert.ok(r.warnings.some((w) => w.itemIds.length > 1));
  h.close();
});

test('T36 search_places：簡介被切斷時標「…」', async () => {
  const h = await harness();
  const r = (await h.chat.tools.find((t) => t.name === 'search_places')!.run({ areas: ['toba'], types: ['restaurant'], limit: 30 })).output as unknown as { places: { summary: string | null }[] };
  for (const s of r.places.map((x) => x.summary).filter((x): x is string => !!x)) assert.ok(/[。！？!?…]$/.test(s) || [...s].length < 80, s);
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

test('T38：get_day、get_trip_overview 標 booked，沒有的不帶；提議換掉已訂的住宿要標', async () => {
  const h = await harness();
  const run = (name: string, input: Record<string, unknown>) => h.chat.tools.find((t) => t.name === name)!.run(input);
  const day = (await run('get_day', { date: '2027-02-05' })).output as any;
  assert.equal(day.lodging.id, 'toba-kokusai-hotel');
  assert.equal(day.lodging.booked, true);
  assert.ok(!('user' in day.lodging));
  const other = (await run('get_day', { date: '2027-02-07' })).output as any;
  assert.ok(other.entries.every((e: any) => !('user' in e)));
  const all = (await run('get_trip_overview', {})).output as any;
  assert.equal(all.days.find((d: any) => d.date === '2027-02-05').lodging.booked, true);
  const lodging = h.data.getState().places.find((p) => p.type === 'lodging' && p.id !== 'toba-kokusai-hotel')!;
  const warn = h.chat.bookedWarnings([{ op: 'setLodging', date: '2027-02-05', lodging: lodging.id } as never]);
  assert.equal(warn.length, 1);
  assert.match(warn[0], /這晚已訂，採用的話要記得自己去取消/);
  assert.deepEqual(h.chat.bookedWarnings([]), []);
  h.close();
});

test('T38：加好地點後卡片標已加入，下一輪脈絡帶新點的 ID', async () => {
  const h = await harness();
  await h.chat.send('https://www.google.com/maps/place/%E3%83%86%E3%82%B9%E3%83%88/@34.48,136.84,17z/data=!3m1!4b1!4m6!3m5!1s0x0:0x0!8m2!3d34.4812!4d136.8421');
  await h.chat.placeAdded({ id: 'user-1', name: 'テスト', type: 'lodging' });
  const use = h.lastUse('propose_user_place');
  const card = h.chat.store.getState().messages.flatMap((m) => Object.entries(m.cards ?? {})).find(([id]) => id === use.id)?.[1];
  assert.deepEqual(card?.added, { id: 'user-1', name: 'テスト', type: 'lodging' });
  const d = h.chat.store.getState().decisions.at(-1)!;
  assert.equal(d.tool, 'propose_user_place');
  assert.match(d.summary, /user-1/);
  h.close();
});

// --- T41 地區工具、搜尋條件 ---

const runTool = async (h: Awaited<ReturnType<typeof harness>>, name: string, input: Record<string, unknown>) => (await h.chat.tools.find((t) => t.name === name)!.run(input)).output as any;

test('T41 get_areas：全部的區照行程順序，有特色、代表的點（帶名字）、二月注意；子地區只有名字和要不要搭車', async () => {
  const h = await harness();
  const r = await runTool(h, 'get_areas', {});
  assert.equal(r.ok, true);
  assert.deepEqual(r.areas.map((a: { id: string }) => a.id), h.data.getState().areas.map((a) => a.id));
  const shima = r.areas.find((a: { id: string }) => a.id === 'shima');
  assert.ok(shima.summary && shima.transport);
  assert.ok(shima.highlights.some((p: { id: string; name: string }) => p.id === 'shima-yokoyama-observatory' && p.name));
  assert.ok(shima.february.some((t: string) => /西班牙村/.test(t)));
  assert.deepEqual(Object.keys(shima.regions[0]).sort(), ['id', 'name', 'needsCar']);
  const text = JSON.stringify(r);
  assert.ok(!text.includes('"sources"') && !text.includes('"basedOn"') && !text.includes('"points"'));
  assert.ok(text.length < 8000, String(text.length));
  h.close();
});

test('T41 get_areas：給 area 只回那一區，子地區也有介紹；區域不對回錯誤', async () => {
  const h = await harness();
  const r = await runTool(h, 'get_areas', { area: 'shima' });
  assert.equal(r.areas.length, 1);
  const k = r.areas[0].regions.find((x: { id: string }) => x.id === 'shima-kashikojima');
  assert.equal(k.needsCar, false);
  assert.ok(k.summary && k.highlights.length && 'febNote' in k);
  const bad = await runTool(h, 'get_areas', { area: 'nope' });
  assert.equal(bad.ok, false);
  assert.match(bad.error, /shima/);
  h.close();
});

test('T41 elderly、kids：沒有評分的不排掉，排在有評分的後面，fitUnknown 算出來', async () => {
  const h = await harness();
  const r = await runTool(h, 'search_places', { areas: ['shima'], types: ['spot'], elderly: true, kids: true, limit: 30 });
  const ids = r.places.map((p: { id: string }) => p.id);
  // 伊雜宮（A）沒有 elderFit：以前被排掉。橫山展望台 elderFit 是 1（施工期間要走石階迂回），照樣拿掉
  assert.ok(ids.includes('shima-izawanomiya'));
  assert.ok(!ids.includes('shima-yokoyama-observatory'));
  assert.ok(r.fitUnknown > 0);
  const byId = h.data.getState().byId;
  const scored = (id: string) => typeof byId.get(id)!.assessment?.scores?.elderFit === 'number' && typeof byId.get(id)!.assessment?.scores?.kidsFit === 'number';
  const firstUnscored = ids.findIndex((id: string) => !scored(id));
  assert.ok(firstUnscored > 0 && ids.slice(firstUnscored).every((id: string) => !scored(id)));
  assert.equal(ids.length - firstUnscored, r.fitUnknown);
  // 有評分但低於 3 的還是拿掉
  for (const id of ids.slice(0, firstUnscored)) assert.ok((byId.get(id)!.assessment!.scores!.elderFit as number) >= 3, id);
  // 沒要 elderly、kids 不帶 fitUnknown
  assert.ok(!('fitUnknown' in (await runTool(h, 'search_places', { areas: ['shima'], types: ['spot'] }))));
  h.close();
});

test('T41、T58 weather：景點只留室內、有遮蔽的，餐廳不受影響；結果帶 weather、stayMinutes、needsCar', async () => {
  const h = await harness();
  const r = await runTool(h, 'search_places', { areas: ['toba'], types: ['spot'], weather: ['indoor', 'covered'], limit: 30 });
  assert.ok(r.total > 0);
  assert.ok(r.places.every((p: { weather: string }) => p.weather === 'indoor' || p.weather === 'covered'));
  assert.ok(r.places.some((p: { weather: string }) => p.weather === 'covered'));
  const only = await runTool(h, 'search_places', { areas: ['toba'], types: ['spot'], weather: ['indoor'], limit: 30 });
  assert.ok(only.total > 0 && only.total < r.total && only.places.every((p: { weather: string }) => p.weather === 'indoor'));
  const aq = r.places.find((p: { id: string }) => p.id === 'toba-aquarium');
  assert.ok(aq && 'stayMinutes' in aq && typeof aq.needsCar === 'boolean');
  const all = await runTool(h, 'search_places', { areas: ['toba'], types: ['restaurant'], limit: 30 });
  const rain = await runTool(h, 'search_places', { areas: ['toba'], types: ['restaurant'], weather: ['indoor'], limit: 30 });
  assert.equal(rain.total, all.total);
  assert.ok(!('weather' in rain.places[0]) && 'stayMinutes' in rain.places[0]);
  h.close();
});

test('T41 wholeRental、maxGuestsAtLeast：只留住宿，資料沒寫的算 unknownExcluded', async () => {
  const h = await harness();
  const whole = await runTool(h, 'search_places', { areas: ['ise'], wholeRental: true, limit: 30 });
  const ids = whole.places.map((p: { id: string }) => p.id);
  assert.ok(['ise-oyado-ichi', 'ise-yadoya-isuzu', 'ise-okage-mairi-shukuba'].every((id) => ids.includes(id)));
  assert.ok(whole.places.every((p: { type: string }) => p.type === 'lodging'));
  assert.ok(whole.unknownExcluded > 0);
  const big = await runTool(h, 'search_places', { areas: ['ise'], wholeRental: true, maxGuestsAtLeast: 15, limit: 30 });
  assert.deepEqual(big.places.map((p: { id: string }) => p.id), ['ise-okage-mairi-shukuba']);
  h.close();
});

test('T57 access：不用搭車只留 accessEase ≥ 4 的（沒有評分的排後面）', async () => {
  const h = await harness();
  const r = await runTool(h, 'search_places', { areas: ['shima'], types: ['spot'], access: true, limit: 30 });
  const byId = h.data.getState().byId;
  const ids: string[] = r.places.map((p: { id: string }) => p.id);
  assert.ok(ids.includes('shima-izawanomiya'));
  assert.ok(!ids.includes('shima-yokoyama-observatory'));
  for (const id of ids) {
    const v = byId.get(id)!.assessment?.scores?.accessEase;
    assert.ok(v == null || (v as number) >= 4, id);
  }
  h.close();
});

test('T41 tiers：「一定要去」只留 S、A；沒有評分的點標 fitUnknown', async () => {
  const h = await harness();
  const r = await runTool(h, 'search_places', { areas: ['shima'], types: ['spot'], tiers: ['S', 'A'], elderly: true, kids: true, limit: 30 });
  assert.ok(r.places.length > 0 && r.places.every((p: { tier: string }) => p.tier === 'S' || p.tier === 'A'));
  const iza = r.places.find((p: { id: string }) => p.id === 'shima-izawanomiya');
  assert.equal(iza?.fitUnknown, true);
  assert.equal(r.places.filter((p: { fitUnknown?: true }) => p.fitUnknown).length, r.fitUnknown);
  h.close();
});
