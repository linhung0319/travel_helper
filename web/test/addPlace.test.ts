import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isMapLink, isShortMapLink, parseMapLink } from '../src/lib/addPlace/mapLink.ts';
import { classifyInput } from '../src/lib/addPlace/classify.ts';
import { geocodeAddress } from '../src/lib/addPlace/gsi.ts';
import { findExisting } from '../src/lib/addPlace/dedupe.ts';
import { normalizePlace } from '../src/data/normalize.ts';

const FULL =
  'https://www.google.com/maps/place/%E7%8F%88%E7%90%B2+%E7%81%AF%E5%8F%B0%E8%88%8E/@34.48,136.84,17z/data=!3m1!4b1!4m6!3m5!1s0x0:0x1!8m2!3d34.4815!4d136.8431';

test('parseMapLink：!3d!4d 精準座標＋名稱', () => {
  assert.deepEqual(parseMapLink(FULL), { name: '珈琲 灯台舎', coords: [136.8431, 34.4815], precise: true, addressText: null });
});

test('parseMapLink：只有 @ 是不精準', () => {
  const r = parseMapLink('https://www.google.com/maps/@34.48,136.84,17z');
  assert.deepEqual(r.coords, [136.84, 34.48]);
  assert.equal(r.precise, false);
});

test('parseMapLink：q 是座標', () => {
  assert.deepEqual(parseMapLink('https://www.google.com/maps?q=34.5,136.7').coords, [136.7, 34.5]);
});

test('parseMapLink：q 是名稱加地址', () => {
  const r = parseMapLink('https://www.google.com/maps?q=珈琲 灯台舎, 〒517-0011 三重県鳥羽市鳥羽1丁目2-3&ftid=0x1:0x2');
  assert.equal(r.name, '珈琲 灯台舎');
  assert.equal(r.coords, null);
  assert.equal(r.addressText, '三重県鳥羽市鳥羽1丁目2-3');
});

test('parseMapLink：search api query 文字', () => {
  const r = parseMapLink('https://www.google.com/maps/search/?api=1&query=三重県鳥羽市鳥羽1丁目');
  assert.equal(r.name, '三重県鳥羽市鳥羽1丁目');
  assert.equal(r.addressText, '三重県鳥羽市鳥羽1丁目');
});

test('parseMapLink：consent 頁用 continue', () => {
  const r = parseMapLink('https://consent.google.com/m?continue=' + encodeURIComponent(FULL));
  assert.deepEqual(r, parseMapLink(FULL));
});

test('parseMapLink：什麼都沒有', () => {
  assert.deepEqual(parseMapLink('https://www.google.com/maps'), { name: null, coords: null, precise: false, addressText: null });
});

test('isMapLink／isShortMapLink', () => {
  for (const u of [
    'https://maps.app.goo.gl/abc',
    'https://goo.gl/maps/abc',
    'https://www.google.co.jp/maps/place/x',
    'https://www.google.com.tw/maps?q=1,2',
    'https://maps.google.com/?q=1,2',
    'https://consent.google.com/m?continue=x',
  ])
    assert.equal(isMapLink(u), true, u);
  for (const u of ['https://example.com', 'https://www.google.com/search?q=maps', 'https://goo.gl/other', 'https://evilgoogle.com/maps', 'not a url'])
    assert.equal(isMapLink(u), false, u);
  assert.equal(isShortMapLink('https://maps.app.goo.gl/x'), true);
  assert.equal(isShortMapLink('https://goo.gl/maps/x'), true);
  assert.equal(isShortMapLink(FULL), false);
});

test('classifyInput', () => {
  assert.equal(classifyInput(''), 'empty');
  assert.equal(classifyInput('  '), 'empty');
  assert.equal(classifyInput('https://maps.app.goo.gl/x'), 'link');
  assert.equal(classifyInput('三重県鳥羽市鳥羽1-2-3'), 'address');
  assert.equal(classifyInput('鳥羽市相差町1238'), 'address');
  assert.equal(classifyInput('灯台舎'), 'text');
  assert.equal(classifyInput('https://example.com'), 'text');
});

test('geocodeAddress', async () => {
  let seen = '';
  const ok = (async (u: string) => {
    seen = u;
    return { ok: true, json: async () => [{ geometry: { coordinates: [136.84, 34.48] } }] };
  }) as unknown as typeof fetch;
  assert.deepEqual(await geocodeAddress('〒517-0011 三重県鳥羽市鳥羽1丁目', ok), [136.84, 34.48]);
  assert.ok(!seen.includes('〒') && !decodeURIComponent(seen).includes('〒'));
  const empty = (async () => ({ ok: true, json: async () => [] })) as unknown as typeof fetch;
  assert.equal(await geocodeAddress('x', empty), null);
  const boom = (async () => {
    throw new Error('net');
  }) as unknown as typeof fetch;
  assert.equal(await geocodeAddress('x', boom), null);
});

const mk = (id: string, name: string, coords: [number, number], type = 'spot') =>
  normalizePlace({ id, type, name: { zh: name }, area: 'area-a', coords, sources: [] })!;

test('findExisting', () => {
  const base: [number, number] = [136.8, 34.4];
  const dLat = (m: number): [number, number] => [base[0], base[1] + m / 111195];
  const a = mk('a', '珈琲 灯台舎', dLat(50));
  assert.equal(findExisting([a], base, '灯台舎').same, a);
  const far = findExisting([mk('b', '珈琲灯台舎', dLat(120))], base, '灯台舎');
  assert.deepEqual(far, { same: null, near: null });
  const c = mk('c', '別の店', dLat(20));
  const r = findExisting([c], base, '灯台舎');
  assert.equal(r.same, null);
  assert.equal(r.near, c);
  assert.deepEqual(findExisting([mk('s', '灯台舎', dLat(5), 'station')], base, '灯台舎'), { same: null, near: null });
});
