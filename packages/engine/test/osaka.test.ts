// 大阪的情境測試（T29 spec §6.7）：第一天南下、伊勢回大阪、大阪一天，都用真的 data/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addItem, createItinerary, planItinerary, planLeg, resolveConfig, setLodging, toMinutes, type Endpoint, type LegContext } from '../src/index.ts';
import { realData } from './fixtures.ts';

const cfg = resolveConfig();
const real = realData();
const WHOLE = { size: 15, elders: 5, kids: 4 };
const P = (id: string): Endpoint => {
  const r = real.getPlace(id)?.record ?? null;
  return { id, coords: r?.coords ?? null, record: r };
};
const ctx = (over: Partial<LegContext>): LegContext => ({ date: '2027-02-02', depart: 600, party: WHOLE, whole: true, data: real, cfg, ...over });

test('第一天南下：關西機場 14:35 → 鵜方，搭近鐵 1-382 16:10 → 18:35', () => {
  const { leg } = planLeg(P('kansai-airport'), P('ugata'), ctx({ date: '2027-02-02', depart: 14 * 60 + 35 }), { mode: 'transit' });
  const last = leg.rides[leg.rides.length - 1];
  // data/access/kix.json day1 的那班（定的，不能改）
  assert.equal(last.tripId, '1-382');
  assert.equal(last.depart, '16:10');
  assert.equal(last.arrive, '18:35');
  assert.ok(leg.rides.some((r) => r.routeId === 'nankai-rapit' || r.routeId === 'nankai-airport-express'));
  // 南海なんば → 近鐵大阪難波：11 × 1.4 → 16 分
  const i = leg.rides.findIndex((r) => r.to === 'nankai-namba');
  assert.ok(i >= 0 && leg.rides[i + 1]?.from === 'osaka-namba');
  assert.equal(leg.transfers?.[i].walkMinutes, 16);
});

test('第一天南下：難波留得出買票時間', () => {
  // T29c spec §8.6：到達一樣時優先挑買票站（近鐵特急）留得出 ticketMargin 的；只換前面的班次，到達不變
  const { leg } = planLeg(P('kansai-airport'), P('ugata'), ctx({ date: '2027-02-02', depart: 14 * 60 + 35 }), { mode: 'transit' });
  const i = leg.rides.length - 1;
  const last = leg.rides[i];
  assert.equal(last.tripId, '1-382');
  assert.equal(last.arrive, '18:35');
  const ready = leg.ready?.[i];
  assert.ok(ready, 'ready');
  assert.ok(toMinutes(last.depart) - toMinutes(ready) >= cfg.transit.ticketMargin, `${ready} → ${last.depart}`);
  assert.equal(leg.arrive, '18:35');
});

test('伊勢 → 大阪難波 → 住宿', () => {
  // 伊勢市 10:00 以後往大阪難波的特急是 10:49（一小時一班）：等 49 分超過 trainMaxWait，但太遠不能改搭計程車，照樣搭電車
  const { leg, warnings } = planLeg(P('iseshi'), P('osaka-hotel-nikko'), ctx({ date: '2027-02-12', depart: 10 * 60 }));
  assert.ok(leg.mode !== 'taxi' && leg.mode !== 'unknown', `mode ${leg.mode}`);
  assert.ok(!warnings.some((w) => w.code === 'travel-unknown'));
  const first = leg.rides[0];
  assert.equal(first.kind, 'timetable');
  assert.equal(first.routeId, null);
  assert.ok(first.tripId);
  assert.ok(leg.rides.some((r) => r.kind === 'headway') || (leg.walkAfter ?? 0) > 0);
  assert.ok(leg.minutes < 210, `${leg.minutes} 分`);
  assert.ok(warnings.some((w) => w.code === 'long-wait'));
});

test('大阪一天：難波 → 大阪城 → 天王寺 → 難波', () => {
  const date = '2027-02-12';
  let it = createItinerary();
  it = setLodging(it, '2027-02-11', 'osaka-grids-premium-namba');
  it = setLodging(it, date, 'osaka-grids-premium-namba');
  for (const place of ['osaka-castle-tenshukaku', 'osaka-harukas300', 'osaka-dotonbori']) it = addItem(it, date, { type: 'visit', options: [{ place }] }).itinerary;
  const day = planItinerary(it, real).days.find((d) => d.date === date);
  assert.ok(day);
  const codes = day.warnings.map((w) => w.code);
  assert.ok(!codes.includes('travel-unknown') && !codes.includes('taxi'), codes.join(','));
  assert.deepEqual(
    day.entries.map((e) => [e.kind, e.placeId]),
    [
      ['start', 'osaka-grids-premium-namba'],
      ['visit', 'osaka-castle-tenshukaku'],
      ['visit', 'osaka-harukas300'],
      ['visit', 'osaka-dotonbori'],
      ['lodging', 'osaka-grids-premium-namba'],
    ],
  );
  // 城 → 天王寺（あべのハルカス）：搭班距型的地鐵、環狀線
  assert.ok(day.entries[2].travel?.rides.some((r) => r.kind === 'headway'));
  const back = day.entries[day.entries.length - 1];
  assert.ok(back.start, '回住宿的時間');
  for (const e of day.entries.slice(1)) {
    assert.ok(e.travel && e.travel.mode !== 'taxi' && e.travel.mode !== 'unknown', `${e.placeId} ${e.travel?.mode}`);
    assert.ok(e.travel.minutes < 60, `${e.placeId} ${e.travel.minutes} 分`);
  }
});
