// AI 脈絡盤點（2026-11-05，PLAN T70）：工具回傳補這團最在意的欄位、拿掉內部用語和 null 噪音；站名、路線名都查得到。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveConfig } from '@travel-helper/engine';
import { createReadTools } from '../src/ai/readTools.ts';
import { buildTurnContext } from '../src/ai/context.ts';
import { currentEngineData } from '../src/planStore.ts';
import { harness } from './aiHarness.ts';

type H = Awaited<ReturnType<typeof harness>>;
const run = (h: H) => async (name: string, input: Record<string, unknown>) => (await h.chat.tools.find((t) => t.name === name)!.run(input)).output as Record<string, unknown>;
type Row = Record<string, unknown>;

test('search_places：每筆帶我們打的分；餐廳帶料理、座位、收不收小孩；住宿帶房數、餐、價格帶；車站不帶', async () => {
  const h = await harness();
  const t = run(h);
  const spots = (await t('search_places', { areas: ['toba'], types: ['spot'], tiers: ['S'] })).places as Row[];
  const aquarium = spots.find((p) => p.id === 'toba-aquarium')!;
  assert.deepEqual(aquarium.scores, { elderly: 4, kids: 5, winter: 5, access: 5 });
  const eats = (await t('search_places', { text: '七越茶屋' })).places as Row[];
  const chaya = eats.find((p) => p.id === 'toba-nanakoshi-chaya')!;
  assert.deepEqual(chaya.scores, { elderly: 3, kids: 4 });
  assert.ok((chaya.cuisine as string[]).length > 0);
  assert.ok((chaya.seating as string[]).includes('table'));
  assert.equal(chaya.kids, 'yes');
  assert.equal(chaya.fit15, 'unknown');
  const stays = (await t('search_places', { areas: ['shima'], types: ['lodging'], stay: ['fits'] })).places as Row[];
  const classic = stays.find((p) => p.id === 'shima-kanko-classic')!;
  assert.equal(classic.rooms, 112);
  assert.equal(classic.meals, 'varies');
  assert.match(String(classic.priceRange), /円/);
  assert.ok('maxGuests' in classic && 'wholeRental' in classic, '沒查到也要帶 null，AI 才知道是沒查');
  const stations = (await t('search_places', { text: '鳥羽', types: ['station'] })).places as Row[];
  assert.ok(stations.length && stations.every((p) => !('scores' in p) && !('cuisine' in p)));
  h.close();
});

test('get_place：不帶 verified；scores 一定帶；hours 分區附旅程中哪幾天公休（已對好星期）；價格列不帶網址、來源、幣別', async () => {
  const h = await harness();
  const t = run(h);
  const r = (await t('get_place', { ids: ['toba-osakaya'] })).places as Row[];
  assert.ok(!('verified' in r[0]));
  assert.deepEqual(r[0].scores, { elderly: 2, kids: 4 });
  // 大阪屋週四公休：旅程裡的週四是 2/4、2/11
  assert.deepEqual(r[0].closedOnTripDays, ['2/4（四）', '2/11（四）']);
  const noHours = (await t('get_place', { ids: ['toba-osakaya'], sections: ['group'] })).places as Row[];
  assert.ok(!('closedOnTripDays' in noHours[0]), '沒要 hours 就不算');
  const hotel = (await t('get_place', { ids: ['toba-kokusai-hotel'], sections: ['price'] })).places as Row[];
  const prices = hotel[0].prices as Row[];
  assert.ok(prices.length > 0);
  for (const p of prices) {
    assert.ok(!('url' in p) && !('source' in p) && !('currency' in p), JSON.stringify(p));
    assert.ok('plan' in p && 'adult' in p);
  }
  h.close();
});

test('get_day、get_trip_overview：帶日期加星期；交通不帶 basis、等車 0 分、沒查的車資；沒有的欄位不寫 null', async () => {
  const h = await harness();
  const t = run(h);
  const day = await t('get_day', { date: '2027-02-04' });
  assert.equal(day.label, '2/4（四）');
  const entries = day.entries as Row[];
  assert.ok(!('itemId' in entries[0]) && !('travel' in entries[0]), '起點沒有 itemId、travel');
  for (const e of entries) {
    assert.ok(!('meal' in e) || e.meal != null);
    assert.ok(!('note' in e) || e.note != null);
    const travel = e.travel as Row | undefined;
    if (!travel) continue;
    assert.ok(!('basis' in travel));
    assert.ok(!('waitMinutes' in travel) || travel.waitMinutes !== 0);
    const taxi = travel.taxi as Row | undefined;
    if (taxi) assert.ok(!('fareEstimateYen' in taxi) || taxi.fareEstimateYen != null);
  }
  const text = JSON.stringify(await t('get_day', { date: '2027-02-05' }));
  assert.ok(!/kamome-|sanco-|§|fit15:|nights 的/.test(text), text);
  const overview = await t('get_trip_overview', {});
  assert.equal((overview.days as Row[])[0].label, '2/2（二）');
  h.close();
});

test('引擎的警告沒有內部用語（§、fit15:、nights 的 meals）', async () => {
  const h = await harness();
  const plan = h.plan.getState().plan!;
  const all = [...plan.warnings, ...plan.days.flatMap((d) => d.warnings)].map((w) => w.message);
  assert.ok(all.length > 0);
  for (const m of all) assert.doesNotMatch(m, /§|fit15|nights 的|meals/, m);
  assert.ok(all.some((m) => m.includes('還沒選要不要含晚餐')));
  h.close();
});

test('check_changes：一樣的警告只留一則；get_route：alternatives 不重複列選的那條', async () => {
  const h = await harness();
  const t = run(h);
  const c = await t('check_changes', { ops: [{ op: 'add', date: '2027-02-04', place: 'shima-yokoyama-observatory', index: 0 }, { op: 'add', date: '2027-02-04', place: 'shima-la-mer', index: 2, tags: ['lunch'] }] });
  const warns = c.newWarnings as string[];
  assert.equal(new Set(warns).size, warns.length, JSON.stringify(warns));
  const r = await t('get_route', { from: 'ise-naiku', to: 'toba-aquarium', date: '2027-02-05', time: '14:00' });
  assert.equal(r.ok, true);
  const alts = r.alternatives as Row[];
  assert.ok(!alts.some((a) => a.arrive === r.arrive && a.minutes === r.minutes && a.walkMinutes === r.walkMinutes), JSON.stringify(alts));
  assert.ok(!('basis' in r));
  h.close();
});

test('get_timetable 車站：ID 或站名都行（JR 站沒有近鐵時刻表會跳過）；終點寫站名、不帶車次；猜錯 ID 的錯誤說怎麼查', async () => {
  const h = await harness();
  const t = run(h);
  const byName = await t('get_timetable', { station: '鳥羽', date: '2027-02-05' });
  assert.equal(byName.ok, true);
  assert.equal(byName.station, '鳥羽（近鐵）');
  assert.equal(byName.date, '2/5（五）');
  const dirs = byName.directions as { label: string; after: Row[] }[];
  assert.ok(dirs.length === 2 && dirs.every((d) => d.label));
  for (const d of dirs) for (const x of d.after) {
    assert.ok(!('trainNo' in x) && !('direction' in x));
    assert.doesNotMatch(String(x.to), /^[a-z-]+$/, `終點要是站名：${x.to}`);
  }
  const ise = await t('get_timetable', { station: '伊勢市', date: '2027-02-05', after: '14:00' });
  assert.equal(ise.station, '伊勢市（近鐵）');
  const jr = await t('get_timetable', { station: 'jr-toba', date: '2027-02-05' });
  assert.equal(jr.ok, false);
  assert.match(String(jr.error), /近鐵/);
  const guessed = await t('get_timetable', { station: 'kintetsu-toba', date: '2027-02-05' });
  // 「kintetsu-toba」比得到鳥羽，照樣回
  assert.equal(guessed.ok, true);
  const none = await t('get_timetable', { station: '不存在的站', date: '2027-02-05' });
  assert.equal(none.ok, false);
  assert.match(String(none.error), /search_places/);
  h.close();
});

test('get_timetable 路線：名字對到好幾條時，給上下車站就全部一起查（每班標路線）；沒給站就列出路線讓 AI 選', async () => {
  const h = await harness();
  const t = run(h);
  const merged = await t('get_timetable', { route: 'かもめバス', from: '鳥羽駅', to: '水族館', date: '2027-02-05' });
  assert.equal(merged.ok, true);
  const trips = merged.trips as Row[];
  assert.ok(trips.length >= 4, JSON.stringify(trips));
  assert.ok(new Set(trips.map((x) => x.route)).size >= 2, '不只一條路線');
  for (let i = 1; i < trips.length; i++) assert.ok(String(trips[i - 1].depart) <= String(trips[i].depart), '照出發時間排');
  const list = await t('get_timetable', { route: 'かもめバス', date: '2027-02-05' });
  assert.equal(list.ok, true);
  assert.equal((list.routes as Row[]).length, 4);
  assert.ok(!('trips' in list));
  const one = await t('get_timetable', { route: 'kamome-1-anrakujima', date: '2027-02-05' });
  assert.ok(Array.isArray(one.stops) && Array.isArray(one.trips));
  assert.equal(one.date, '2/5（五）');
  // 外宮 → 內宮兩條系統一起列，最早的是 55 系統 10:10
  const gn = await t('get_timetable', { route: '外宮内宮', from: '外宮前', to: '内宮前', date: '2027-02-05', after: '10:00' });
  assert.equal((gn.trips as Row[])[0].depart, '10:10');
  h.close();
});

test('get_reservations：沒有的欄位不帶；只有晚數改過才標', async () => {
  const h = await harness();
  const rows = (await run(h)('get_reservations', {})).rows as Row[];
  assert.ok(rows.length > 0);
  for (const r of rows) {
    assert.ok(!('nightsChanged' in r) || r.nightsChanged === true);
    for (const [k, v] of Object.entries(r)) assert.ok(v != null, `${k} 是 null 就不要帶`);
  }
  h.close();
});

test('畫面的脈絡：沒有篩選就不帶 filterCount；沒點開的、沒有的不寫 null；行程的點只帶名字', async () => {
  const h = await harness();
  const deps = { app: h.app, data: h.data, plan: h.plan, shared: h.shared, commands: h.commands, engine: currentEngineData, config: resolveConfig(), source: {} } as never;
  const read = createReadTools(deps);
  const stage = { screenFilter: () => null, screenName: () => 'trip' as const } as never;
  h.app.getState().selectDay('2027-02-05');
  const ctx = buildTurnContext({ d: deps, read, stage, chips: [], screenOff: false, decisions: [], draft: null, cards: [] });
  const screen = ctx.screen as Row;
  assert.ok(!('filterCount' in screen) && !('filterLabels' in screen));
  for (const [k, v] of Object.entries(screen)) assert.ok(v != null, `${k} 是 null 就不要帶`);
  assert.equal(screen.day, '2027-02-05');
  assert.ok((screen.dayStops as Row[]).every((x) => !('time' in x) || x.time != null));
  h.app.getState().setFilter({ types: ['spot'] });
  const withFilter = buildTurnContext({ d: deps, read, stage, chips: [], screenOff: false, decisions: [], draft: null, cards: [] }).screen as Row;
  assert.ok((withFilter.filterLabels as string[]).length === 1 && typeof withFilter.filterCount === 'number');
  h.close();
});
