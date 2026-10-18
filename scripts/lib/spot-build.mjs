// 景點資料點的組裝（scripts/build-spots.mjs 用；純函式，方便測試）。
// 規則來源：CONVENTIONS §4「判斷細則」（座標 300 m、Google 多筆、照片 1～3 張、tags 從結構化欄位補）。

export const COORD_SWITCH_METERS = 300;
export const MAX_PHOTOS = 3;

// 和 data/areas/ise/spots.json 相同的欄位順序（沒列到的欄位接在 extra 前面）
const ORDER = [
  'id', 'type', 'name', 'area', 'region', 'coords', 'coordsSource', 'address', 'hours', 'closedNote', 'febNote',
  'closures', 'events', 'photos', 'links', 'tags', 'tier', 'nearestStation', 'access', 'admission', 'phone',
  'stayMinutes', 'indoor', 'fares', 'group', 'accessibility', 'kids', 'ratings', 'sources', 'verified', 'extra',
  'summary', 'assessment',
];

export function haversineMeters([lng1, lat1], [lng2, lat2]) {
  const R = 6371008.8;
  const rad = (d) => (d * Math.PI) / 180;
  const a = Math.sin(rad(lat2 - lat1) / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lng2 - lng1) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// google-place.js 的 cid 每 4 位加空格（避免被當成 Base64 擋下），這裡去掉
export const cleanCid = (cid) => (cid == null ? null : String(cid).replace(/\s+/g, ''));
export const googleUrl = (cid) => (cid ? `https://maps.google.com/?cid=${cleanCid(cid)}` : null);

// 座標：原座標（觀光三重、OSM、官網）和 Google 差 300 m 以上改用 Google，原座標寫進 conflicts
export function pickCoords(orig, origSource, g, label = origSource) {
  const gc = g?.lat && g?.lng ? [g.lng, g.lat] : null;
  if (!orig) return gc ? { coords: gc, coordsSource: 'google-maps-url', conflict: null, distance: null } : null;
  if (!gc) return { coords: orig, coordsSource: origSource, conflict: null, distance: null };
  const d = Math.round(haversineMeters(orig, gc));
  if (d >= COORD_SWITCH_METERS) {
    return {
      coords: gc,
      coordsSource: 'google-maps-url',
      distance: d,
      conflict: `座標：原座標 [${orig.join(', ')}]（${label}）和 Google 差 ${d} m，改用 Google`,
    };
  }
  return { coords: orig, coordsSource: origSource, conflict: null, distance: d };
}

// 照片：judgement 給的（官網、觀光協會、觀光三重）在前，Google 主圖補到最多 3 張；photos.json 檢查不 ok 的拿掉
export function pickPhotos(given = [], g, checked = null, gPage = null) {
  const list = [...given];
  if (g?.img && !list.some((p) => p.url === g.img)) {
    list.push({ url: g.img, page: gPage, kind: 'google', credit: 'Google マップ（店家或使用者上傳）', license: null });
  }
  const ok = (u) => !checked || checked[u]?.ok === true;
  const dropped = list.filter((p) => !ok(p.url)).map((p) => p.url);
  return { photos: list.filter((p) => ok(p.url)).slice(0, MAX_PHOTOS).map(normPhoto), dropped };
}

const normPhoto = (p) => ({ url: p.url, page: p.page ?? null, kind: p.kind ?? 'official', credit: p.credit ?? null, license: p.license ?? null });

// tags 只加不刪（判斷細則）
export function deriveTags(p) {
  const tags = [...(p.tags ?? [])];
  const add = (t) => !tags.includes(t) && tags.push(t);
  if (p.indoor === true) {
    add('室內');
    add('雨天備案');
  }
  if (p.accessibility?.stairs === '多') add('長階梯');
  if (p.kids?.friendly === 'high') add('親子');
  return tags;
}

export function mergeSources(...lists) {
  const out = [];
  for (const s of lists.flat()) {
    if (!s?.url || out.some((x) => x.url === s.url)) continue;
    out.push({ type: s.type, url: s.url, retrieved: s.retrieved, note: s.note ?? null });
  }
  return out;
}

export function ordered(p) {
  const o = {};
  for (const k of ORDER) if (k in p && k !== 'extra' && k !== 'summary' && k !== 'assessment' && k !== 'sources' && k !== 'verified') o[k] = p[k];
  for (const k of Object.keys(p)) if (!ORDER.includes(k)) o[k] = p[k];
  for (const k of ['sources', 'verified', 'extra', 'summary', 'assessment']) if (k in p) o[k] = p[k];
  return o;
}

// 組一筆：j＝judgement（Claude 寫的欄位），g＝google.jsonl 那一行，facts＝讀文 facts（只取 sources），opts.retrieved＝Chrome 查的日期
export function buildSpot(j, { area, g = null, facts = null, checked = null, retrieved }) {
  const { googleKey, origCoords, origCoordsSource, origCoordsLabel, ratingsNote, extraSources = [], candKey, ...rest } = j;
  const cid = cleanCid(g?.cid);
  const gUrl = googleUrl(cid);
  const pos = pickCoords(origCoords ?? null, origCoordsSource ?? 'other', g, origCoordsLabel ?? origCoordsSource ?? 'other') ?? { coords: j.coords, coordsSource: j.coordsSource, conflict: null };
  const { photos, dropped } = pickPhotos(j.photos, g, checked, gUrl);
  const extra = { ...(j.extra ?? {}) };
  if (pos.conflict) extra.conflicts = [...(extra.conflicts ?? []), pos.conflict];
  if (pos.distance != null) extra.googleDistanceMeters = pos.distance;
  if (origCoordsLabel && pos.coordsSource === (origCoordsSource ?? 'other') && !extra.coordsNote) extra.coordsNote = `座標：${origCoordsLabel}`;
  const gSource = gUrl
    ? [{ type: 'google-maps', url: gUrl, retrieved, note: `星數、評論數、座標、照片（Google 名稱：${g.name ?? '—'}）` }]
    : [];
  const p = {
    type: 'spot',
    area,
    tier: null,
    closures: [],
    events: [],
    verified: false,
    summary: null,
    assessment: null,
    ...rest,
    coords: pos.coords,
    coordsSource: pos.coordsSource,
    photos,
    links: { official: null, instagram: null, ...(j.links ?? {}), googleMaps: gUrl ?? j.links?.googleMaps ?? null },
    ratings: g || ratingsNote
      ? { google: g?.rating ?? null, googleReviews: g?.reviews ?? null, note: ratingsNote ?? null }
      : (j.ratings ?? null),
    sources: mergeSources(facts?.sources ?? [], extraSources, gSource, j.sources ?? []),
    extra,
  };
  p.tags = deriveTags(p);
  return { point: ordered(p), dropped };
}

// 寫回資料檔：同 id 取代、新的接在後面
export function upsert(list, points) {
  const out = [...list];
  for (const p of points) {
    const i = out.findIndex((x) => x.id === p.id);
    if (i >= 0) out[i] = p;
    else out.push(p);
  }
  return out;
}
