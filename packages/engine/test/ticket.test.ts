// 買票站（T29c spec §8.6）：isTicketRide 的表格測試
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isTicketRide, type TicketRideInfo, type TransitRide } from '../src/index.ts';
import { KINTETSU, type Network, type TimedRoute, type TimedTrip } from '../src/raptor/network.ts';
import { indexOf, laterDeparture, type Journey, type JourneyRide } from '../src/raptor/search.ts';

const kin = (line: string): TicketRideInfo => ({ kind: 'timetable', mode: 'train', line, operator: 'kintetsu' });
const jr: TicketRideInfo = { kind: 'timetable', mode: 'train', line: '快速みえ', operator: 'JR東海' };
const loop: TicketRideInfo = { kind: 'headway', mode: 'train', line: 'JR大阪環状線', operator: 'JR西日本' };
const bus: TicketRideInfo = { kind: 'timetable', mode: 'bus', line: 'かもめバス', operator: '三重交通' };
const ferry: TicketRideInfo = { kind: 'timetable', mode: 'ferry', line: '鳥羽市営定期船', operator: '鳥羽市' };

test('isTicketRide：買票站的判斷', () => {
  const cases: [string, TicketRideInfo[], number, boolean][] = [
    ['近鐵特急 第一程', [kin('特急（往賢島）')], 0, true],
    ['近鐵特急 前一程近鐵普通', [kin('普通（往鳥羽）'), kin('特急（往賢島）')], 1, true],
    ['近鐵普通 第一程', [kin('普通（往賢島）')], 0, false],
    ['近鐵急行 第一程', [kin('急行（往鳥羽）')], 0, false],
    ['しまかぜ', [kin('しまかぜ（往賢島）')], 0, true],
    ['班距型 JR 環狀線', [loop], 0, false],
    ['巴士', [bus], 0, false],
    ['JR 第一程', [jr], 0, true],
    ['JR 前一程同業者', [jr, jr], 1, false],
    ['JR 前一程近鐵', [kin('普通（往鳥羽）'), jr], 1, true],
    ['船 第一程', [ferry], 0, true],
    ['船 前一程巴士', [bus, ferry], 1, true],
  ];
  for (const [name, rides, i, want] of cases) assert.equal(isTicketRide(rides, i), want, name);
});

test('isTicketRide：直接吃 TransitRide（沒有 kind、operator 的舊資料）', () => {
  const base = { from: 'a', to: 'b', depart: '10:00', arrive: '10:30' } as const;
  // kind 沒寫當 timetable、operator 沒寫當 null（不是近鐵）：第一程的電車要買票
  const train: TransitRide = { ...base, mode: 'train', line: '特急（往賢島）' };
  const bus: TransitRide = { ...base, mode: 'bus', line: 'かもめバス' };
  assert.equal(isTicketRide([train], 0), true);
  assert.equal(isTicketRide([bus], 0), false);
  // 前一程也是 operator null：同業者，不用買
  assert.equal(isTicketRide([train, train], 1), false);
  const kinExpress: TransitRide = { ...base, mode: 'train', line: '特急（往賢島）', kind: 'timetable', operator: 'kintetsu' };
  assert.equal(isTicketRide([kinExpress, kinExpress], 1), true);
});

// --- 挑班次留 ticketMargin（search.ts 的 laterDeparture），手做的小網路 ----------------
// A →（巴士或近鐵普通）→ B →（近鐵）→ C，B 同站換車步行 0、minTransfer 3

const trip = (tripId: string, line: string, dep: number, arr: number): TimedTrip => ({ tripId, line, dep: [dep, arr], arr: [dep, arr], fareAdult: null });
const route = (key: string, group: string, mode: TimedRoute['mode'], stops: string[], trips: TimedTrip[]): TimedRoute => ({
  kind: 'timetable', key, group, mode, routeId: group === KINTETSU ? null : group, stops, trips,
});
function net(routes: TimedRoute[]): Network {
  const ids = ['A', 'B', 'C'];
  return {
    stops: new Map(ids.map((id) => [id, { id, name: id, coords: null, stationId: null }])),
    routes,
    routesAt: new Map(),
    footpaths: new Map(),
    sameStopChange: () => ({ walk: 0, transfer: null }),
  } as Network;
}
const ride = (r: TimedRoute, t: TimedTrip): JourneyRide => ({ route: r, trip: t, from: r.stops[0], to: r.stops[1], dep: t.dep[0], arr: t.arr[1], headway: null });
const journey = (a: JourneyRide, b: JourneyRide): Journey => ({
  origin: { stop: 'A', walk: 0 }, target: { stop: 'C', walk: 0 }, rides: [a, b], transfers: [{ walk: 0, transfer: null }], dep: a.dep, arr: b.arr,
});
const rules = (ticketMargin: number) => ({ minTransfer: 3, ticketMargin });

test('laterDeparture：第一程晚一班會讓買票站留不出空檔的，不換', () => {
  // 巴士 10:00→10:10（B 留 17 分）或 10:15→10:25（留 2 分），都接 10:30 的特急、同時到
  const bus = route('bus', 'bus', 'bus', ['A', 'B'], [trip('b1', 'バス', 600, 610), trip('b2', 'バス', 615, 625)]);
  const kin = route('k', KINTETSU, 'train', ['B', 'C'], [trip('k1', '特急（往賢島）', 630, 700)]);
  const n = net([bus, kin]);
  const j = journey(ride(bus, bus.trips[0]), ride(kin, kin.trips[0]));
  assert.equal(laterDeparture(n, indexOf(n), j, rules(10), true).rides[0].trip?.tripId, 'b1');
  // 不留空檔時照舊取晚出發的
  assert.equal(laterDeparture(n, indexOf(n), j, rules(0), true).rides[0].trip?.tripId, 'b2');
});

test('laterDeparture：同時到的晚一班是要買票的特急、留不出空檔的，不換', () => {
  // B 10:13 可以上車：急行 10:14 不用買票；特急 10:20 同時到但只留 7 分
  // （earliestRide 在不同 route 之間才比同時到取晚出發，所以特急放另一條 route，像停站不同的車）
  const local = route('k1', KINTETSU, 'train', ['A', 'B'], [trip('l1', '普通（往鳥羽）', 600, 610)]);
  const kin = route('k2', KINTETSU, 'train', ['B', 'C'], [trip('e1', '急行（往鳥羽）', 614, 700)]);
  const express = route('k3', KINTETSU, 'train', ['B', 'C'], [trip('x1', '特急（往鳥羽）', 620, 700)]);
  const n = net([local, kin, express]);
  const j = journey(ride(local, local.trips[0]), ride(kin, kin.trips[0]));
  assert.equal(laterDeparture(n, indexOf(n), j, rules(10), true).rides[1].trip?.tripId, 'e1');
  assert.equal(laterDeparture(n, indexOf(n), j, rules(0), true).rides[1].trip?.tripId, 'x1');
});
