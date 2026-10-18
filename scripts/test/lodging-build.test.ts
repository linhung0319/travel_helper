// scripts/lib/lodging-build.mjs（build-lodging.mjs）的測試。執行：npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normTime, rakutenScore, vacancyFor, partyPrices, kidsPrice, roomPrice, priceRangeText, pickLodgingPhotos,
  buildLodging, fillNearbyCombos, dayLabel, reserveUrl,
} from '../lib/lodging-build.mjs';

const party = (combo: string, date: string, perPerson: number, dinner = true, planId = 1) => ({
  date, combo, planCount: 2,
  cheapest: { planId: planId + 100, planName: '素泊', roomName: '和室', perPerson: perPerson - 5000, roomTotal: null, dinner: false, breakfast: false },
  cheapestWithDinner: dinner ? { planId, planName: '一泊二食', roomName: '和室', perPerson, roomTotal: null, dinner: true, breakfast: true } : null,
  reserveUrl: `https://x/${combo}/${date}`,
});

test('時間、楽天評分、日期標籤', () => {
  assert.equal(normTime('15:00'), '15:00');
  assert.equal(normTime('15：00'), '15:00');
  assert.equal(normTime('1500'), '15:00');
  assert.equal(normTime('9:30～'), '09:30');
  assert.equal(normTime(null), null);
  assert.equal(normTime('要相談'), null);
  assert.equal(rakutenScore(0), null);
  assert.equal(rakutenScore(4.2), 4.2);
  assert.equal(dayLabel('2027-02-02'), '2027-02-02（二）');
  assert.match(reserveUrl(1, '2027-02-28', 5, 3), /f_tuki2=3&f_hi2=1&f_heya_su=5&f_otona_su=3&f_s1=0/);
});

test('空房：多個中心合併、每天取最低價', () => {
  const a = { dates: ['2027-02-02', '2027-02-03'], combos: ['5x3', '4x4'], hotels: [{ hotelNo: 7, vacancies: [party('5x3', '2027-02-02', 20000), party('4x4', '2027-02-02', 18000)] }] };
  const b = { dates: ['2027-02-02', '2027-02-03'], combos: ['5x3', '4x4'], hotels: [{ hotelNo: 7, vacancies: [party('5x3', '2027-02-02', 19000), party('4x4', '2027-02-03', 21000, false)] }] };
  const v = vacancyFor([a, b], 7);
  assert.deepEqual(v.available, { '2027-02-02': ['5x3', '4x4'], '2027-02-03': ['4x4'] });
  assert.equal(v.best['2027-02-02'].dinner.perPerson, 18000);
  assert.equal(v.best['2027-02-02'].dinner.combo, '4x4');
  assert.equal(v.best['2027-02-03'].dinner, null);
  const prices = partyPrices(v, 7, { party: 15, queried: '2026-10-18' });
  // 2/2：含晚餐 18,000、素泊 13,000（不同方案）；2/3：只有素泊 16,000
  assert.deepEqual(prices.map((p) => p.adult), [18000, 13000, 16000]);
  assert.match(prices[0].plan, /^一泊二食 楽天 15 人組合最低價/);
  assert.match(prices[0].season, /2027-02-02（二）1 泊，4 間 × 4 人/);
  assert.match(prices[2].note, /組合：4x4/);
  assert.equal(vacancyFor([a], 99).available['2027-02-02'].length, 0);
});

test('兒童價：1～99% 才填，100%、0 只寫 note', () => {
  const ctx = { hotelNo: 7, date: '2027-02-02', queried: '2026-10-18' };
  const e = (per: number, total: number, dinner = true) => ({ plans: [{ planName: 'p', roomName: 'r', perPerson: per, roomTotal: total, dinner, breakfast: true }] });
  const k = kidsPrice(e(20000, 74000), ctx);
  assert.equal(k.child, 14000);
  assert.match(k.note, /70%/);
  assert.equal(kidsPrice(e(10000, 40000), ctx).child, null);
  assert.match(kidsPrice(e(10000, 40000), ctx).note, /和大人相同/);
  assert.equal(kidsPrice(e(10000, 30000), ctx).child, null);
  assert.match(kidsPrice(e(10000, 30000), ctx).note, /是 0/);
  assert.equal(kidsPrice({ plans: [] }, ctx), null);
  // preferDinner：含晚餐的優先，就算比較貴
  const mixed = { plans: [e(8000, 32000, false).plans[0], e(20000, 74000, true).plans[0]] };
  assert.equal(kidsPrice(mixed, { ...ctx, preferDinner: true }).adult, 20000);
  assert.equal(kidsPrice(mixed, ctx).adult, 8000);
});

test('一間 N 人、priceRange', () => {
  const p = roomPrice({ plans: [{ planName: '一棟', roomName: '一戸建て', perPerson: null, roomTotal: 60000, dinner: false, breakfast: false }] }, { hotelNo: 7, date: '2027-02-02', adults: 10, queried: '2026-10-18' });
  assert.equal(p.unit, 'per-room');
  assert.equal(p.price, 60000);
  assert.match(p.plan, /^素泊 1 間 大人 10/);
  assert.equal(priceRangeText([{ plan: '一泊二食 x', unit: 'per-person', adult: 18000 }, { plan: '素泊 y', unit: 'per-person', adult: 9000 }]), '每人約 9,000～18,000 円（一泊二食／素泊；詳見 prices）');
  assert.equal(priceRangeText([]), null);
});

test('照片：官網 → 楽天 → Google，最多 3 張、打不開的拿掉', () => {
  const detail = { hotelNo: 7, images: { hotel: 'https://img/h.jpg', room: 'https://img/r.jpg' } };
  const g = { img: 'https://g/x' };
  const r = pickLodgingPhotos([{ url: 'https://o/1.jpg', page: 'https://o/' }, { url: 'https://o/2.jpg' }, { url: 'https://o/3.jpg' }], detail, g, null, 'https://maps.google.com/?cid=1');
  assert.deepEqual(r.photos.map((p) => p.kind), ['official', 'official', 'rakuten']);
  const checked = { 'https://img/h.jpg': { ok: false }, 'https://img/r.jpg': { ok: true }, 'https://g/x': { ok: true } };
  const r2 = pickLodgingPhotos([], detail, g, checked, 'https://maps.google.com/?cid=1');
  assert.deepEqual(r2.photos.map((p) => p.url), ['https://img/r.jpg', 'https://g/x']);
  assert.deepEqual(r2.dropped, ['https://img/h.jpg']);
  assert.equal(r2.photos[0].page, 'https://travel.rakuten.co.jp/HOTEL/7/7.html');
});

test('組一筆：楽天、Google、座標 300 m、評分 0 → null、15 人判斷', () => {
  const detail = {
    hotelNo: 7, name: 'x', reviewAverage: 0, reviewCount: 12, coords: [136.82, 34.31], address: '三重県志摩市阿児町神明1', telephone: '0599-00-0000',
    ratings: { service: 4.5, location: 0, room: 4, equipment: 4, bath: 4, meal: 4.8 }, roomNum: 9, checkin: '15:00', checkout: '10:00',
    images: { hotel: 'https://img/h.jpg', room: null },
  };
  const g = { key: 'shima-x', name: 'X 旅館', rating: 4.3, reviews: 120, cid: '1234 5678', lat: 34.3101, lng: 136.8201, img: 'https://g/x' };
  const vac = vacancyFor([{ dates: ['2027-02-02'], combos: ['5x3'], hotels: [{ hotelNo: 7, vacancies: [party('5x3', '2027-02-02', 20000)] }] }], 7);
  const j = { id: 'shima-x', name: { ja: 'X', zh: 'X' }, region: 'shima-kashikojima', kind: 'ryokan', rakutenHotelNo: 7, meals: 'dinner+breakfast', group: { wholeRental: false } };
  const { point, fits15 } = buildLodging(j, { area: 'shima', detail, vac, g, retrieved: '2026-10-18', queried: '2026-10-18' });
  assert.equal(fits15, true);
  assert.equal(point.coordsSource, 'other');
  assert.equal(point.ratings.rakuten, null);
  assert.equal(point.ratings.rakutenLocation, null);
  assert.equal(point.ratings.rakutenMeal, 4.8);
  assert.match(point.ratings.note, /不公開/);
  assert.equal(point.ratings.google, 4.3);
  assert.equal(point.links.googleMaps, 'https://maps.google.com/?cid=12345678');
  assert.equal(point.group.totalRooms, 9);
  assert.equal(point.checkIn, '15:00');
  assert.deepEqual(point.reservation.methods, ['rakuten']);
  assert.equal(point.reservation.phone, '0599-00-0000');
  assert.deepEqual(point.extra.rakutenVacancy.available, { '2027-02-02': ['5x3'] });
  assert.equal(point.sources[0].type, 'booking-site');
  assert.equal(point.sources[1].type, 'google-maps');
  assert.deepEqual(Object.keys(point).slice(0, 6), ['id', 'type', 'name', 'area', 'region', 'kind']);
  assert.equal(Object.keys(point).at(-1), 'assessment');
  // 沒上楽天、沒有 Google：座標搜尋連結
  const { point: p2, fits15: f2 } = buildLodging(
    { id: 'shima-y', name: { ja: 'Y' }, region: 'shima-ugata', kind: 'rental-house', origCoords: [136.83, 34.32], origCoordsSource: 'other', group: { maxGuests: 20, wholeRental: true } },
    { area: 'shima', retrieved: '2026-10-18', queried: '2026-10-18' },
  );
  assert.equal(f2, true);
  assert.equal(p2.rakutenHotelNo, null);
  assert.equal(p2.links.googleMaps, 'https://www.google.com/maps/search/?api=1&query=34.32,136.83');
  assert.match(p2.extra.googleMapsNote, /找不到/);
  assert.deepEqual(p2.tags, ['包棟']);
  assert.deepEqual(p2.reservation.methods, []);
  assert.equal('rakutenService' in p2.ratings, false);
});

test('nearbyCombos：住不下 15 人的，同區 1 km 內最近 4 間', () => {
  const mk = (id: string, region: string, lng: number) => ({ id, region, coords: [lng, 34.3], group: { nearbyCombos: [] } });
  const pts = [mk('a', 'r1', 136.8), mk('b', 'r1', 136.801), mk('c', 'r1', 136.803), mk('d', 'r2', 136.8005), mk('e', 'r1', 136.82)];
  fillNearbyCombos(pts, { a: false, b: true, c: false, d: false, e: false });
  assert.deepEqual(pts[0].group.nearbyCombos, ['b', 'c']);
  assert.deepEqual(pts[1].group.nearbyCombos, []);
  assert.deepEqual(pts[3].group.nearbyCombos, []);
  assert.deepEqual(pts[4].group.nearbyCombos, []);
});
