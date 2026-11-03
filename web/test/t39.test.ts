// T39：送出馬上有反應、不閃「沒有回完」、文字解析、推薦問題、採用不進編輯、想去的篩選、連住第幾晚。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { harness, memoryStorage } from './aiHarness.ts';
import { parseRich, toApiMessages, turnsOf, untagged } from '../src/ai/transcript.ts';
import { compactSteps, legChips } from '../src/lib/legView.ts';
import { firstStarter, type StarterDay, type StarterInput } from '../src/ai/prompts.ts';
import { legTitle, needsStart, stayNight, stopMarks } from '../src/lib/planView.ts';
import { setVoteLookup } from '../src/lib/filter.ts';
import { createStore } from 'zustand/vanilla';
import { ensurePlan, startPlanner, type PlanState } from '../src/planStore.ts';

const day = (date: string, lodging = false): StarterDay => ({ date, area: 'shima', lodging, dinnerIncluded: false, dinnerExcluded: false, hasStops: false, hasLunch: false, hasDinner: false, areaName: null, nearbyWishes: 0, errorWarning: null });
const dates = Array.from({ length: 12 }, (_, i) => `2027-02-${String(i + 2).padStart(2, '0')}`);
const input = (days: StarterDay[]): StarterInput => ({ days, day: null, warnings: 0, wishesUnplaced: 0, popularUnplaced: 0, anyLiked: false });

test('推薦問題：一晚都沒有時問前幾晚，不問每晚', () => {
  assert.equal(firstStarter(input(dates.map((d) => day(d)))).q, '幫我決定前幾晚住哪');
});

test('推薦問題：一次最多問連續 3 晚', () => {
  const days = dates.map((d, i) => day(d, i < 3));
  assert.equal(firstStarter(input(days)).q, '幫我決定 2/5～2/7 住哪');
});

test('文字：粗體裡的地點標籤要變成標籤，不是原文', () => {
  const [p] = parseRich('推薦 **[[place:shima-miyako-bayside-terrace]]**，風景好');
  assert.equal(p.kind, 'p');
  assert.deepEqual(p.kind === 'p' && p.parts.find((x) => 'place' in x), { place: 'shima-miyako-bayside-terrace' });
  assert.ok(p.kind === 'p' && !p.parts.some((x) => 'text' in x && x.text.includes('[[')));
});

test('文字：表格變成條列，第一格粗體，表頭和分隔列不畫', () => {
  const blocks = parseRich('| 店家 | 人數 |\n|---|---|\n| 大阪屋 | 15 人 |\n| [[place:a]] | 分桌 |\n結論');
  assert.equal(blocks.length, 2);
  const list = blocks[0];
  assert.ok(list.kind === 'list');
  assert.equal(list.items.length, 2);
  assert.deepEqual(list.items[0][0], { text: '大阪屋', bold: true });
  assert.deepEqual(list.items[1][0], { place: 'a' });
  assert.equal(JSON.stringify(blocks).includes('|'), false);
  assert.equal(JSON.stringify(blocks).includes('---'), false);
});

test('文字：標題、編號、分隔線、其他圓點', () => {
  const blocks = parseRich('## 結論\n---\n1. 第一\n2. 第二\n• 三');
  assert.deepEqual(blocks[0], { kind: 'p', parts: [{ text: '結論', bold: true }] });
  assert.equal(blocks[1].kind === 'list' && blocks[1].ordered, true);
  assert.equal(blocks[1].kind === 'list' && blocks[1].items.length, 2);
  assert.equal(blocks[2].kind === 'list' && !blocks[2].ordered, true);
});

test('不畫標籤的地方：標記換成名字', () => {
  assert.equal(untagged('2/4：＋[[place:a]] 午餐', () => '大阪屋'), '2/4：＋大阪屋 午餐');
});

test('按下送出：同一個更新裡就看到自己的話、開始等 AI，不閃「沒有回完」，也不等後端', async () => {
  const h = await harness({ storage: memoryStorage() });
  const realCreate = h.repo.createConversation;
  const realAppend = h.repo.appendMessages;
  // 後端卡住：畫面照樣要動
  let release = () => {};
  const gate = new Promise<void>((r) => (release = r));
  h.repo.createConversation = async (...a) => {
    await gate;
    return realCreate(...a);
  };
  h.repo.appendMessages = async (...a) => {
    await gate;
    return realAppend(...a);
  };
  const seen: { blank: boolean; status: string; incomplete: string | null }[] = [];
  const off = h.chat.store.subscribe((s) => seen.push({ blank: s.messages.length === 0, status: s.status, incomplete: h.chat.incomplete() }));
  const done = h.chat.send('鳥羽能坐 15 人的海鮮餐廳');
  // send 同步的部分跑完
  const s = h.chat.store.getState();
  assert.equal(s.status, 'thinking');
  assert.equal(turnsOf(s.messages, new Set())[0]?.user, '鳥羽能坐 15 人的海鮮餐廳');
  assert.ok(s.currentId);
  release();
  await done;
  off();
  // 整輪沒有任何一刻「最後一輪沒回完而且閒置」
  assert.equal(seen.filter((x) => !x.blank && x.status === 'idle' && x.incomplete).length, 0);
  h.close();
});

test('對話的 ID 瀏覽器先定好，先建對話才存訊息', async () => {
  const h = await harness({ storage: memoryStorage() });
  const order: string[] = [];
  const realCreate = h.repo.createConversation;
  const realAppend = h.repo.appendMessages;
  h.repo.createConversation = async (title, id) => {
    order.push(`create:${id}`);
    return realCreate(title, id);
  };
  h.repo.appendMessages = async (id, m) => {
    order.push(`append:${id}`);
    return realAppend(id, m);
  };
  await h.chat.send('2/5 會不會太趕？');
  const id = h.chat.store.getState().currentId;
  assert.equal(order[0], `create:${id}`);
  assert.equal(order[1], `append:${id}`);
  assert.equal((await realList(h)).some((c) => c.id === id), true);
  h.close();
});

const realList = (h: Awaited<ReturnType<typeof harness>>) => h.repo.listConversations();

test('存檔失敗：再試一次；還是不行才提示，對話不中斷', async () => {
  const h = await harness({ storage: memoryStorage() });
  const realAppend = h.repo.appendMessages;
  let calls = 0;
  h.repo.appendMessages = async (id, m) => {
    calls += 1;
    if (calls === 1) throw new Error('網路斷了');
    return realAppend(id, m);
  };
  const r = await h.chat.send('2/5 會不會太趕？');
  assert.equal(r.ok, true);
  assert.equal(h.chat.store.getState().error, null);
  const saved = await h.repo.loadMessages(h.chat.store.getState().currentId!);
  assert.equal(saved.at(0)?.role, 'user');
  h.close();
});

test('想去的：votes any 找得到只有一個人按的點，popular 找不到', async () => {
  const h = await harness();
  const search = h.chat.tools.find((t) => t.name === 'search_places')!;
  const id = 'toba-osakaya';
  setVoteLookup({ likes: (x) => (x === id ? 1 : 0), likedByMe: () => false });
  const of = async (votes: string[]) => (((await search.run({ votes, areas: ['toba'], types: ['restaurant'], limit: 30 })).output as unknown as { places: { id: string }[] }).places).map((p) => p.id);
  assert.deepEqual(await of(['any']), [id]);
  assert.deepEqual(await of(['popular']), []);
  const filter = h.chat.tools.find((t) => t.name === 'set_filter')!;
  assert.equal((await filter.run({ areas: ['toba'], types: ['restaurant'], votes: ['any'] })).output.ok, true);
  h.close();
});

test('第一天機場到遠的住宿：搭到附近車站再接計程車，不報到不了，時間接得起來', async () => {
  const h = await harness();
  await h.shared.changeItinerary((it) => ({ ...it, nights: { ...it.nights, [it.days[0].date]: { area: 'shima', lodging: 'shima-ichiraku-onsen' } }, days: it.days.map((d, i) => (i === 0 ? { ...d, items: d.items.filter((x) => x.type === 'flight') } : d)) }), '測試');
  await new Promise((r) => setTimeout(r, 50));
  const day = h.plan.getState().plan!.days[0];
  assert.equal(day.warnings.some((x) => x.code === 'travel-unknown'), false);
  for (const m of day.warnings.map((x) => x.message)) assert.doesNotMatch(m, /travel|minutes|data\/|§/);
  const leg = day.entries.find((e) => e.kind === 'lodging')!.travel!;
  assert.ok(leg.taxiAfter, leg.basis);
  // 資料寫「賢島駅車程約 25 分」：不用會跨海灣的直線估算
  assert.deepEqual(leg.taxiAfter, { station: 'kashikojima', minutes: 25 });
  assert.ok(leg.rides.length > 0);
  assert.equal(leg.taxi?.cars, 4);
  const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
  assert.equal(toMin(leg.arrive), toMin(leg.rides.at(-1)!.arrive) + (leg.walkAfter ?? 0) + leg.taxiAfter.minutes);
  assert.equal(leg.minutes, toMin(leg.arrive) - toMin(leg.depart));
  assert.ok(day.warnings.some((x) => x.code === 'rail-taxi'));
  const steps = compactSteps(leg, '關西機場', '一樂', (id) => id, 10);
  assert.equal(steps.at(-2)?.kind, 'taxi');
  assert.equal(legTitle(leg).startsWith('大眾運輸＋計程車'), true);
  assert.equal(legChips(leg, (id) => id).rides.at(-1)?.mode, 'taxi');
  h.close();
});

test('轉乘到得了的住宿：不會多插計程車', async () => {
  const h = await harness();
  await h.shared.changeItinerary((it) => ({ ...it, nights: { ...it.nights, [it.days[0].date]: { area: 'toba', lodging: 'toba-kokusai-hotel' } }, days: it.days.map((d, i) => (i === 0 ? { ...d, items: d.items.filter((x) => x.type === 'flight') } : d)) }), '測試');
  await new Promise((r) => setTimeout(r, 50));
  const leg = h.plan.getState().plan!.days[0].entries.find((e) => e.kind === 'lodging')!.travel!;
  assert.equal(leg.taxiAfter, undefined);
  assert.equal(leg.taxiBefore, undefined);
  assert.ok(leg.rides.length > 0);
  h.close();
});

test('沒回完的原因：出錯、按停止都記在這輪第一則訊息，不送給模型', async () => {
  const h = await harness({ storage: memoryStorage() });
  h.model.settings.next = 'error';
  await h.chat.send('2/5 會不會太趕？');
  const first = h.chat.store.getState().messages.find((m) => m.role === 'user')!;
  assert.ok(first.failure);
  assert.notEqual(first.failure.code, 'stopped');
  const saved = await h.repo.loadMessages(h.chat.store.getState().currentId!);
  assert.equal(saved[0].failure?.code, first.failure.code);
  assert.equal(JSON.stringify(toApiMessages(h.chat.store.getState().messages)).includes('failure'), false);
  h.close();
});

test('沒有起點：第一站是 1，要提示', () => {
  const day = { entries: [{ kind: 'visit', placeId: 'a' }, { kind: 'visit', placeId: 'b' }] } as never;
  assert.deepEqual([...stopMarks(day).byPlace.keys()], ['a', 'b']);
  assert.deepEqual(stopMarks(day).byPlace.get('a'), ['1']);
  assert.equal(needsStart(day), true);
  assert.equal(needsStart({ entries: [{ kind: 'start', placeId: 'h' }] } as never), false);
  assert.equal(needsStart({ entries: [{ kind: 'flight', placeId: 'k' }] } as never), false);
  assert.equal(needsStart({ entries: [] } as never), false);
  assert.equal(needsStart({ entries: [{ kind: 'lodging', placeId: 'h' }] } as never), false);
});

test('連住第幾晚：同一間連在一起算（從 nights 算）', () => {
  const it = {
    days: ['2027-02-02', '2027-02-03', '2027-02-04', '2027-02-05', '2027-02-06', '2027-02-07'].map((date) => ({ date, items: [] })),
    nights: {
      '2027-02-02': { area: 'toba', lodging: 'a' },
      '2027-02-03': { lodging: 'a' },
      '2027-02-04': { area: 'toba', lodging: 'a' },
      '2027-02-05': { area: 'ise', lodging: 'b' },
      '2027-02-06': { area: 'ise' },
    },
  } as never;
  assert.deepEqual(stayNight(it, '2027-02-03'), { n: 2, total: 3 });
  assert.deepEqual(stayNight(it, '2027-02-05'), { n: 1, total: 1 });
  assert.equal(stayNight(it, '2027-02-06'), null);
  assert.equal(stayNight(null, '2027-02-03'), null);
});

test('時刻表延後讀，但 AI 要用時馬上讀，等到算好才回', async () => {
  const data = createStore<any>()(() => ({ status: 'ready', itinerary: null, places: [] }));
  const plan = createStore<PlanState>()(() => ({ status: 'loading', error: null, plan: null }));
  let loads = 0;
  let deferred: (() => void) | null = null;
  let finish: (tt: never) => void = () => {};
  const source = { loadEngineTimetables: () => { loads += 1; return new Promise<never>((r) => { finish = r; }); } } as never;
  const off = startPlanner(data, source, undefined, plan, { defer: (fn) => { deferred = fn; } });
  assert.equal(loads, 0, '延後：還沒開始讀');

  let ready = false;
  const waiting = ensurePlan(plan).then(() => { ready = true; });
  assert.equal(loads, 1, 'AI 要用：馬上讀');
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(ready, false, '還沒讀好不能回');

  finish({} as never);
  await waiting;
  assert.equal(plan.getState().status, 'ready');
  // 行程是空的不排延後讀（T47）；排了東西之後延後讀、不重複讀，見 t47.test.ts
  assert.equal(deferred, null);
  assert.equal(loads, 1);
  off();
});
