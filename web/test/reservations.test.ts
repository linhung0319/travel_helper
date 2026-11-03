// T15m：預約筆記的列（住宿連住合成一列、狀態用 (日期, 點) 對應、連結的名稱）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Itinerary } from '@travel-helper/engine/types';
import { bookedConflicts, bookingByPlace, cardOpenByDefault, dateLine, dayOpenByDefault, firstLine, linkLabel, newPendingRows, noteDays, noteRows, reservationFor, reservationTags, statusCounts } from '../src/lib/reservations.ts';
import type { Reservation } from '../src/backend/types.ts';
import { normalizePlace } from '../src/data/normalize.ts';
import type { Place } from '../src/data/types.ts';
import { itin } from './helpers.ts';

const place = (id: string, type: string, over: Record<string, unknown> = {}): Place =>
  normalizePlace({ id, type, name: { ja: id }, area: 'toba', coords: [136.8, 34.5], sources: [], ...over })!;

const A = place('hotel-a', 'lodging');
const B = place('hotel-b', 'lodging');
const R = place('rest-r', 'restaurant', { reservation: { accepted: 'yes', methods: ['phone'], phone: '0599-00-0000' } });
const R2 = place('rest-s', 'restaurant', { reservation: { accepted: 'yes', methods: ['web'] } });
const byId = new Map([A, B, R, R2].map((p) => [p.id, p]));

const stays = (...ids: string[]): Itinerary => {
  const dates = ids.map((_, i) => `2027-02-${String(5 + i).padStart(2, '0')}`);
  return itin({}, Object.fromEntries(dates.map((d, i) => [d, ids[i]])));
};

const rec = (over: Partial<Reservation>): Reservation => ({
  date: '2027-02-05',
  placeId: 'hotel-a',
  status: 'booked',
  note: null,
  nights: null,
  updatedBy: 'm-a',
  updatedAt: '2026-10-24T00:00:00.000Z',
  ...over,
});

test('連住同一間合成一列', () => {
  const rows = noteRows(stays('hotel-a', 'hotel-a', 'hotel-a'), null, byId, []);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].date, '2027-02-05');
  assert.equal(rows[0].endDate, '2027-02-08');
  assert.equal(rows[0].nights, 3);
  assert.equal(rows[0].role, 'lodging');
  assert.deepEqual(rows[0].key, { date: '2027-02-05', placeId: 'hotel-a' });
});

test('中間換一晚就分開', () => {
  const rows = noteRows(stays('hotel-a', 'hotel-a', 'hotel-b', 'hotel-a'), null, byId, []);
  assert.deepEqual(
    rows.map((r) => [r.placeId, r.nights]),
    [['hotel-a', 2], ['hotel-b', 1], ['hotel-a', 1]],
  );
});

test('狀態用 (入住日, 點) 對應', () => {
  const saved = [rec({ nights: 3, note: '含早餐' })];
  const same = noteRows(stays('hotel-a', 'hotel-a', 'hotel-a'), null, byId, saved)[0];
  assert.equal(same.status, 'booked');
  assert.equal(same.nightsChanged, false);
  assert.equal(same.note, '含早餐');
  assert.equal(same.updatedBy, 'm-a');
  const shorter = noteRows(stays('hotel-a', 'hotel-a'), null, byId, saved)[0];
  assert.equal(shorter.status, 'booked');
  assert.equal(shorter.nightsChanged, true);
  const later = noteRows(itin({}, { '2027-02-06': 'hotel-a', '2027-02-07': 'hotel-a' }), null, byId, saved)[0];
  assert.equal(later.status, 'pending');
  assert.equal(later.updatedBy, null);
  assert.equal(later.nightsChanged, false);
});

test('項目移到別天變回未訂位', () => {
  const saved = [rec({ placeId: 'rest-r' })];
  const before = noteRows(itin({ '2027-02-05': ['rest-r'] }), null, byId, saved);
  assert.equal(before[0].status, 'booked');
  const after = noteRows(itin({ '2027-02-06': ['rest-r'] }), null, byId, saved);
  assert.equal(after.length, 1);
  assert.equal(after[0].date, '2027-02-06');
  assert.equal(after[0].status, 'pending');
});

test('多點卡片每個點一列，主要的在前', () => {
  const it = itin({ '2027-02-05': ['rest-s'] });
  const day = it.days[0];
  const v = day.items[0];
  if (v.type !== 'visit') throw new Error('visit');
  v.options = [{ place: 'rest-s', stayMinutes: null }, { place: 'rest-r', stayMinutes: null }];
  v.selected = 1;
  const rows = noteRows(it, null, byId, []);
  assert.deepEqual(rows.map((r) => [r.placeId, r.role]), [['rest-r', 'main'], ['rest-s', 'other']]);
});

test('reservationFor：住宿用那晚所在的那一列', () => {
  const rows = noteRows(stays('hotel-a', 'hotel-a', 'hotel-b'), null, byId, []);
  assert.equal(reservationFor(rows, '2027-02-06', 'hotel-a')?.date, '2027-02-05');
  assert.equal(reservationFor(rows, '2027-02-07', 'hotel-b')?.date, '2027-02-07');
  assert.equal(reservationFor(rows, '2027-02-07', 'hotel-a'), null);
});

test('linkLabel', () => {
  const p = place('x', 'restaurant', { links: { official: 'https://shop.example.jp/top' } });
  assert.equal(linkLabel('https://shop.example.jp/top', p), '官網');
  assert.equal(linkLabel('https://tabelog.com/mie/A2401/', p), '食べログ');
  assert.equal(linkLabel('https://www.jalan.net/yad123/', p), 'じゃらん');
  assert.equal(linkLabel('https://travel.rakuten.co.jp/HOTEL/1/', p), '楽天');
  assert.equal(linkLabel('https://www.example.com/a', p), 'example.com');
});

const dinner = (date: string, placeId: string): Itinerary => {
  const it = stays('hotel-a');
  const day = it.days.find((d) => d.date === date);
  if (day) day.items.push({ id: `v-${placeId}`, type: 'visit', options: [{ place: placeId }], selected: 0 } as never);
  return it;
};

test('newPendingRows：多出來、還沒訂的才算（§17.6）', () => {
  const before = stays('hotel-a');
  assert.deepEqual(newPendingRows(before, before, byId, []), []);
  assert.deepEqual(newPendingRows(before, dinner('2027-02-05', 'rest-r'), byId, []).map((r) => r.placeId), ['rest-r']);
  // 已經記成已訂：不用提醒
  assert.deepEqual(newPendingRows(before, dinner('2027-02-05', 'rest-r'), byId, [rec({ placeId: 'rest-r' })]), []);
});

test('bookingByPlace：還有沒訂的就是待訂；不用訂、不在筆記裡的沒有標籤（§17.7）', () => {
  const rows = noteRows(dinner('2027-02-05', 'rest-r'), null, byId, [rec({ placeId: 'hotel-a' })]);
  const map = bookingByPlace(rows);
  assert.equal(map.get('hotel-a'), 'booked');
  assert.equal(map.get('rest-r'), 'pending');
  assert.equal(map.has('rest-s'), false);
  const skip = noteRows(stays('hotel-a'), null, byId, [rec({ status: 'skip' })]);
  assert.equal(bookingByPlace(skip).has('hotel-a'), false);
});

test('bookedConflicts：換掉已訂的、晚數變了要標；沒動、沒訂的不標（§17.7）', () => {
  const booked = [rec({ nights: 2 })];
  const two = stays('hotel-a', 'hotel-a');
  assert.deepEqual(bookedConflicts(two, two, byId, booked), []);
  assert.deepEqual(bookedConflicts(two, stays('hotel-b', 'hotel-b'), byId, booked), ['hotel-a 這晚已訂，採用的話要記得自己去取消']);
  assert.deepEqual(bookedConflicts(two, stays('hotel-a', 'hotel-b'), byId, booked), ['hotel-a 這晚已訂，採用的話要記得自己去取消']);
  assert.deepEqual(bookedConflicts(two, stays('hotel-b', 'hotel-b'), byId, []), []);
  const withDinner = dinner('2027-02-05', 'rest-r');
  assert.deepEqual(bookedConflicts(withDinner, stays('hotel-a'), byId, [rec({ placeId: 'rest-r' })]), ['rest-r 這天已訂，採用的話要記得自己去取消']);
});

// ---------- T55 ----------

test('T55 dateLine：餐廳寫日期、時間、人數；住宿寫入住–退房、幾晚', () => {
  const [lodge] = noteRows(stays('hotel-a', 'hotel-a'), null, byId, []);
  assert.equal(dateLine(lodge), '2/5–2/7 · 2 晚 · 15 人');
  assert.equal(dateLine({ role: 'main', date: '2027-02-03', endDate: null, nights: null, time: '12:00', people: 6 }), '2/3 · 12:00 · 6 人');
  assert.equal(dateLine({ role: 'main', date: '2027-02-03', endDate: null, nights: null, time: null, people: 15 }), '2/3 · 15 人');
});

test('T55 reservationTags：只從訂位方式、幾天前、只接受團體拆', () => {
  const base = { phone: null, url: null };
  assert.deepEqual(reservationTags({ ...base, methods: ['phone', 'rakuten', 'xyz'], leadDays: 5, accepted: 'groups-only' }), ['電話', '楽天', 'xyz', '5 天前要訂', '只接受團體']);
  assert.deepEqual(reservationTags({ ...base, methods: [], leadDays: null, accepted: 'yes' }), []);
  // 卡片上已經有號碼、網址：不再寫「電話」「官網」
  assert.deepEqual(reservationTags({ phone: '0599', url: 'https://x.jp/', methods: ['phone', 'official', 'jalan'], leadDays: null, accepted: null }), ['じゃらん']);
});

test('T55 住宿的 groupNote 併進店家的說明', () => {
  const H = place('hotel-g', 'lodging', { reservation: { methods: ['phone'], groupNote: '15 人需電話洽詢' } });
  const [row] = noteRows(stays('hotel-g'), null, new Map([[H.id, H]]), []);
  assert.equal(row.placeNote, '15 人需電話洽詢');
});

test('T55 noteDays、statusCounts：照日期分組、算待訂', () => {
  const it = stays('hotel-a', 'hotel-b', 'hotel-b');
  const rows = noteRows(it, null, byId, [rec({ date: '2027-02-06', placeId: 'hotel-b', status: 'skip' })]);
  const days = noteDays(rows);
  assert.deepEqual(
    days.map((d) => [d.date, d.rows.length, d.pending]),
    [
      ['2027-02-05', 1, 1],
      ['2027-02-06', 1, 0],
    ],
  );
  assert.equal(dayOpenByDefault(days[0]), true);
  assert.equal(dayOpenByDefault(days[1]), false);
  assert.deepEqual(statusCounts(rows), { pending: 1, booked: 0, skip: 1, all: 2 });
});

test('T55 卡片：待訂展開，已訂、不用訂收成一列；備註取第一行', () => {
  assert.equal(cardOpenByDefault({ status: 'pending' }), true);
  assert.equal(cardOpenByDefault({ status: 'booked' }), false);
  assert.equal(cardOpenByDefault({ status: 'skip' }), false);
  assert.equal(firstLine('王小明 15 位\n18:00 到'), '王小明 15 位');
  assert.equal(firstLine(null), null);
  assert.equal(firstLine('  '), null);
});
