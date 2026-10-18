// scripts/lib/spot-build.mjs（build-spots.mjs）的測試。執行：npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanCid, googleUrl, pickCoords, pickPhotos, deriveTags, buildSpot, upsert, mergeSources } from '../lib/spot-build.mjs';

test('cid 去空格、組 Google 連結', () => {
  assert.equal(cleanCid('1564 6177 0605 8514 3822'), '15646177060585143822');
  assert.equal(googleUrl('1564 6177'), 'https://maps.google.com/?cid=15646177');
  assert.equal(googleUrl(null), null);
});

test('座標：300 m 以內保留原座標，以上改用 Google', () => {
  const orig = [136.818634, 34.307458];
  const near = pickCoords(orig, 'other', { lat: 34.3074649, lng: 136.8186549 });
  assert.equal(near.coordsSource, 'other');
  assert.deepEqual(near.coords, orig);
  assert.equal(near.conflict, null);
  const far = pickCoords(orig, 'other', { lat: 34.3118, lng: 136.8186 });
  assert.equal(far.coordsSource, 'google-maps-url');
  assert.deepEqual(far.coords, [136.8186, 34.3118]);
  assert.match(far.conflict, /差 \d+ m/);
  assert.equal(pickCoords(null, 'other', { lat: 1, lng: 2 }).coordsSource, 'google-maps-url');
  assert.equal(pickCoords(orig, 'osm', null).coordsSource, 'osm');
  assert.match(pickCoords(orig, 'other', { lat: 34.3118, lng: 136.8186 }, '觀光三重').conflict, /（觀光三重）/);
});

test('照片：官網在前、Google 補到 3 張、打不開的拿掉', () => {
  const given = [{ url: 'https://a/1.jpg', page: 'https://a/' }, { url: 'https://a/2.jpg', page: 'https://a/' }, { url: 'https://a/bad.jpg' }];
  const checked = { 'https://a/1.jpg': { ok: true }, 'https://a/2.jpg': { ok: true }, 'https://a/bad.jpg': { ok: false }, 'https://g/x=w800': { ok: true } };
  const r = pickPhotos(given, { img: 'https://g/x=w800' }, checked, 'https://maps.google.com/?cid=1');
  assert.deepEqual(r.photos.map((p) => p.url), ['https://a/1.jpg', 'https://a/2.jpg', 'https://g/x=w800']);
  assert.equal(r.photos[0].kind, 'official');
  assert.equal(r.photos[2].kind, 'google');
  assert.deepEqual(r.dropped, ['https://a/bad.jpg']);
});

test('tags 只加不刪', () => {
  assert.deepEqual(deriveTags({ tags: ['展望'], indoor: true, accessibility: { stairs: '多' }, kids: { friendly: 'high' } }), ['展望', '室內', '雨天備案', '長階梯', '親子']);
  assert.deepEqual(deriveTags({ tags: ['海邊'], indoor: false, accessibility: { stairs: null }, kids: null }), ['海邊']);
});

test('sources 依網址去重', () => {
  const s = mergeSources([{ type: 'official', url: 'u1', retrieved: 'd' }], [{ type: 'tourism', url: 'u1', retrieved: 'd' }, { type: 'tourism', url: 'u2', retrieved: 'd' }]);
  assert.deepEqual(s.map((x) => x.url), ['u1', 'u2']);
});

test('組一筆：Google 連結、星數、預設欄位、欄位順序', () => {
  const j = {
    id: 'x-spot', name: { ja: 'X', zh: 'X' }, region: 'x-r', origCoords: [136.8, 34.3], origCoordsSource: 'other', origCoordsLabel: '觀光三重詳細頁', candKey: 'x',
    indoor: true, photos: [{ url: 'https://a/1.jpg', page: 'https://a/' }], links: { official: 'https://a/' },
    ratingsNote: '另有 Y 3.9（10）', extra: { conflicts: ['舊的'] },
  };
  const g = { cid: '1234 5678', rating: 4.3, reviews: 311, lat: 34.3001, lng: 136.8001, img: 'https://g/1=w800', name: 'X 乗船場' };
  const facts = { sources: [{ type: 'official', url: 'https://a/', retrieved: '2026-10-18', note: '營業' }] };
  const { point } = buildSpot(j, { area: 'shima', g, facts, retrieved: '2026-10-18' });
  assert.equal(point.links.googleMaps, 'https://maps.google.com/?cid=12345678');
  assert.deepEqual(point.ratings, { google: 4.3, googleReviews: 311, note: '另有 Y 3.9（10）' });
  assert.equal(point.coordsSource, 'other');
  assert.equal(point.photos.length, 2);
  assert.ok(point.tags.includes('室內'));
  assert.equal(point.sources.length, 2);
  assert.equal(point.sources[1].type, 'google-maps');
  assert.equal(point.type, 'spot');
  assert.equal(point.verified, false);
  assert.deepEqual(point.extra.conflicts, ['舊的']);
  assert.equal('origCoords' in point, false);
  assert.equal('candKey' in point, false);
  assert.equal(point.extra.coordsNote, '座標：觀光三重詳細頁');
  const keys = Object.keys(point);
  assert.equal(keys[0], 'id');
  assert.deepEqual(keys.slice(-5), ['sources', 'verified', 'extra', 'summary', 'assessment']);
});

test('寫回：同 id 取代、新的接在後面', () => {
  const out = upsert([{ id: 'a', v: 1 }, { id: 'b', v: 1 }], [{ id: 'b', v: 2 }, { id: 'c', v: 1 }]);
  assert.deepEqual(out, [{ id: 'a', v: 1 }, { id: 'b', v: 2 }, { id: 'c', v: 1 }]);
});
