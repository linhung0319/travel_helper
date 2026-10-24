// T15m：預約筆記的列（住宿連住合成一列、狀態用 (日期, 點) 對應、連結的名稱）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Itinerary } from '@travel-helper/engine/types';
import { linkLabel, noteRows, reservationFor } from '../src/lib/reservations.ts';
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
