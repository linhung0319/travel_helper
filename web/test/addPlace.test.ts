import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractMapLink, isMapLink, isShortMapLink, parseMapLink } from '../src/lib/addPlace/mapLink.ts';
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

test('classifyInput：店名、地名不是地址', () => {
  for (const s of ['志摩スペイン村', 'おはらい町', '鳥羽市場', '魚市場', '大村屋', '古い町家カフェ', '道の駅 伊勢志摩村', '2027-02-02'])
    assert.equal(classifyInput(s), 'text', s);
  for (const s of ['三重県鳥羽市鳥羽1丁目2-3', '鳥羽市相差町1238', '鳥羽1-2-3', '大阪府大阪市中央区', '三重県鳥羽市鳥羽１－２－３'])
    assert.equal(classifyInput(s), 'address', s);
});

test('parseMapLink：沒有逗號的 q 不當地址', () => {
  const r = parseMapLink('https://www.google.com/maps?q=志摩スペイン村');
  assert.equal(r.name, '志摩スペイン村');
  assert.equal(r.addressText, null);
});

test('parseMapLink：兩組 !3d!4d 取最後一組', () => {
  const r = parseMapLink('https://www.google.com/maps/place/x/data=!3d1.5!4d2.5!8m2!3d34.4815!4d136.8431');
  assert.deepEqual(r.coords, [136.8431, 34.4815]);
  assert.equal(r.precise, true);
});

test('parseMapLink：全形頓號切名稱和地址', () => {
  const r = parseMapLink('https://www.google.com/maps?q=灯台舎、三重県鳥羽市鳥羽1丁目');
  assert.equal(r.name, '灯台舎');
  assert.equal(r.addressText, '三重県鳥羽市鳥羽1丁目');
});

test('parseMapLink：query 是座標', () => {
  assert.deepEqual(parseMapLink('https://www.google.com/maps/search/?api=1&query=34.5,136.7').coords, [136.7, 34.5]);
});

test('parseMapLink：!3d!4d 超出範圍時退回 @', () => {
  const r = parseMapLink('https://www.google.com/maps/place/x/@34.48,136.84,17z/data=!3d999!4d136.8');
  assert.deepEqual(r.coords, [136.84, 34.48]);
  assert.equal(r.precise, false);
});

test('extractMapLink：從分享文字抓連結', () => {
  assert.equal(extractMapLink('珈琲 灯台舎\nhttps://maps.app.goo.gl/x'), 'https://maps.app.goo.gl/x');
  assert.equal(extractMapLink('https://example.com https://maps.app.goo.gl/y'), 'https://maps.app.goo.gl/y');
  assert.equal(extractMapLink('灯台舎'), null);
  assert.equal(classifyInput('珈琲 灯台舎\nhttps://maps.app.goo.gl/x'), 'link');
});

test('findExisting：一個字的名稱不算同名', () => {
  const base: [number, number] = [136.8, 34.4];
  const p = mk('a', '店', [136.8, 34.4 + 10 / 111195]);
  const r = findExisting([p], base, '店');
  assert.equal(r.same, null);
  assert.equal(r.near, p);
});

import { userPlaceToPlace } from '../src/lib/addPlace/userPlace.ts';
import type { UserPlace } from '../src/backend/types.ts';
import type { Area } from '../src/data/types.ts';

const AREAS = [
  { id: 'shima', name: { ja: '志摩' }, center: [136.9, 34.3], bbox: [136.621, 33.86, 137.326, 34.424] },
  { id: 'toba', name: { ja: '鳥羽' }, center: [136.9, 34.5], bbox: [136.782, 34.307, 137.271, 34.63] },
] as unknown as Area[];

const up = (coords: [number, number]): UserPlace => ({
  id: 'user-0123456789ab',
  type: 'restaurant',
  data: { name: { zh: '珈琲 灯台舎' }, coords, note: '週三休', links: { googleMaps: 'https://maps.app.goo.gl/x' }, addedVia: 'google-link' },
  author: 'm-a',
  createdAt: '2026-10-30T00:00:00.000Z',
  updatedAt: '2026-10-30T00:00:00.000Z',
  updatedBy: 'm-a',
  deletedAt: null,
});

test('userPlaceToPlace：鳥羽的座標 → area 是 toba，origin user，沒有 tier', () => {
  const p = userPlaceToPlace(up([136.84, 34.48]), AREAS);
  assert.equal(p.area, 'toba');
  assert.equal(p.origin, 'user');
  assert.equal(p.tier, null);
  assert.equal(p.links.googleMaps, 'https://maps.app.goo.gl/x');
  assert.deepEqual(p.user, { author: 'm-a', createdAt: '2026-10-30T00:00:00.000Z', updatedBy: 'm-a', note: '週三休', addedVia: 'google-link', deletedAt: null });
  assert.deepEqual(p.raw, { id: 'user-0123456789ab', type: 'restaurant', name: { ja: '', zh: '珈琲 灯台舎' }, coords: [136.84, 34.48], area: 'toba' });
});

test('userPlaceToPlace：海上的座標 → area null', () => {
  assert.equal(userPlaceToPlace(up([140, 30]), AREAS).area, null);
});

// ---- Task 5：草稿 store 和搜尋框提示 ----
import { createAddPlaceStore } from '../src/lib/addPlace/draft.ts';
import { resolveSuggestion, ADDRESS_NOT_FOUND, type SuggestDeps } from '../src/lib/addPlace/suggest.ts';
import type { Place } from '../src/data/types.ts';
import { RESOLVE_OFFLINE_MESSAGE, BackendError, type UserPlaceData, type UserPlaceType } from '../src/backend/types.ts';

function storeSetup(userPlaces: UserPlace[] = []) {
  const calls: { fn: string; args: unknown[] }[] = [];
  const mk = (id: string, type: UserPlaceType, data: UserPlaceData): UserPlace => ({ id, type, data, author: 'm', createdAt: '', updatedAt: '', updatedBy: null, deletedAt: null });
  const store = createAddPlaceStore({
    place: (id) => (userPlaces.some((u) => u.id === id) ? ({ id } as never) : undefined),
    userPlace: (id) => userPlaces.find((u) => u.id === id),
    createUserPlace: async (t, d) => {
      calls.push({ fn: 'create', args: [t, d] });
      return { ok: true, place: mk('user-new', t, d) };
    },
    updateUserPlace: async (id, d, t) => {
      calls.push({ fn: 'update', args: [id, d, t] });
      return { ok: true, place: mk(id, t!, d) };
    },
  });
  return { store, calls };
}

test('store：名稱空白或沒選類型 → ok:false、不呼叫後端', async () => {
  const { store, calls } = storeSetup();
  store.getState().start({ via: 'search', coords: [136, 34], name: '  ' });
  assert.equal((await store.getState().save()).ok, false);
  store.getState().patch({ name: 'X' });
  assert.equal((await store.getState().save()).ok, false);
  assert.equal(calls.length, 0);
  assert.ok(store.getState().draft, '草稿還在');
});

test('store：新增，jaName 和 zh 一樣就不帶 ja', async () => {
  const { store, calls } = storeSetup();
  store.getState().start({ via: 'google-link', coords: [136, 34], name: 'X', jaName: 'X', link: 'https://maps.app.goo.gl/a' });
  store.getState().patch({ type: 'restaurant' });
  const r = await store.getState().save();
  assert.deepEqual(r, { ok: true, id: 'user-new' });
  assert.deepEqual(calls[0], {
    fn: 'create',
    args: ['restaurant', { name: { zh: 'X' }, coords: [136, 34], note: null, links: { googleMaps: 'https://maps.app.goo.gl/a' }, addedVia: 'google-link' }],
  });
  assert.equal(store.getState().draft, null);
});

test('store：jaName 不同時存 ja', async () => {
  const { store, calls } = storeSetup();
  store.getState().start({ via: 'google-link', coords: [136, 34], name: '燈台', jaName: '灯台舎' });
  store.getState().patch({ type: 'spot' });
  await store.getState().save();
  assert.deepEqual((calls[0].args[1] as UserPlaceData).name, { zh: '燈台', ja: '灯台舎' });
});

test('store：startEdit 預填，save 呼叫 update 並保留 links、addedVia', async () => {
  const up: UserPlace = {
    id: 'user-a1',
    type: 'lodging',
    data: { name: { zh: '宿', ja: '宿ja' }, coords: [136.1, 34.1], note: '備註', links: { googleMaps: 'https://g/x' }, addedVia: 'address' },
    author: 'm', createdAt: '', updatedAt: '', updatedBy: null, deletedAt: null,
  };
  const { store, calls } = storeSetup([up]);
  store.getState().startEdit('user-a1');
  assert.deepEqual(store.getState().draft, { mode: 'edit', editId: 'user-a1', via: 'address', coords: [136.1, 34.1], name: '宿', jaName: '宿ja', type: 'lodging', note: '備註', link: 'https://g/x' });
  store.getState().patch({ name: '新宿', type: 'spot' });
  await store.getState().save();
  assert.equal(calls[0].fn, 'update');
  assert.equal(calls[0].args[0], 'user-a1');
  assert.equal(calls[0].args[2], 'spot');
  const d = calls[0].args[1] as UserPlaceData;
  assert.equal(d.addedVia, 'address');
  assert.deepEqual(d.links, { googleMaps: 'https://g/x' });
  assert.equal(d.name.zh, '新宿');
});

test('store：cancel → draft null', () => {
  const { store } = storeSetup();
  store.getState().start({ via: 'map', coords: null });
  store.getState().cancel();
  assert.equal(store.getState().draft, null);
});

const P = (id: string, zh: string, coords: [number, number]): Place => normalizePlace({ id, type: 'restaurant', name: { zh }, area: 'toba', coords, sources: [] })!;
const deps = (over: Partial<SuggestDeps> = {}): SuggestDeps => ({
  resolveShort: async () => {
    throw new Error('不該呼叫');
  },
  geocode: async () => null,
  places: [P('a', '珈琲 灯台舎', [136.8431, 34.4815]), P('b', '鳥羽市場', [136.9, 34.5])],
  ...over,
});

test('suggest：完整網址 → 候選', async () => {
  const s = await resolveSuggestion('https://www.google.com/maps/place/Foo+Bar/@34.0,136.0,17z/data=!3d34.0!4d136.0', deps());
  assert.equal(s.kind, 'candidate');
  if (s.kind === 'candidate') {
    assert.equal(s.name, 'Foo Bar');
    assert.deepEqual(s.coords, [136, 34]);
    assert.equal(s.via, 'google-link');
  }
});

test('suggest：短網址 503 → 離線訊息', async () => {
  const s = await resolveSuggestion('https://maps.app.goo.gl/abc', deps({ resolveShort: async () => Promise.reject(new BackendError(503, 'offline', RESOLVE_OFFLINE_MESSAGE)) }));
  assert.deepEqual(s, { kind: 'error', message: RESOLVE_OFFLINE_MESSAGE });
});

test('suggest：短網址展開後 ?q=文字 地址 → 查國土地理院', async () => {
  const s = await resolveSuggestion('Foo https://maps.app.goo.gl/abc', deps({
    resolveShort: async () => 'https://www.google.com/maps?q=Foo, 〒517-0011 三重県鳥羽市鳥羽1丁目2-3',
    geocode: async () => [136.5, 34.5],
  }));
  assert.equal(s.kind, 'candidate');
  if (s.kind === 'candidate') {
    assert.deepEqual(s.coords, [136.5, 34.5]);
    assert.equal(s.name, 'Foo');
    assert.equal(s.link, 'https://maps.app.goo.gl/abc');
  }
});

test('suggest：地址 → 候選；查不到 → 錯誤', async () => {
  const ok = await resolveSuggestion('三重県鳥羽市鳥羽1丁目', deps({ geocode: async () => [136.5, 34.5] }));
  assert.deepEqual(ok, { kind: 'candidate', via: 'address', coords: [136.5, 34.5], name: '', link: null, near: null });
  const no = await resolveSuggestion('三重県鳥羽市鳥羽1丁目', deps());
  assert.deepEqual(no, { kind: 'error', message: ADDRESS_NOT_FOUND });
});

test('suggest：文字比得到點（不看篩選）→ none；比不到 → notFound', async () => {
  assert.deepEqual(await resolveSuggestion('鳥羽市場', deps()), { kind: 'none' });
  assert.deepEqual(await resolveSuggestion('不存在的店', deps()), { kind: 'notFound', text: '不存在的店' });
  assert.deepEqual(await resolveSuggestion('  ', deps()), { kind: 'none' });
});

test('suggest：連結指到已有的點 → same', async () => {
  const s = await resolveSuggestion('https://www.google.com/maps/place/%E7%81%AF%E5%8F%B0%E8%88%8E/@34.48,136.84,17z/data=!3d34.4815!4d136.8431', deps());
  assert.equal(s.kind, 'same');
});
