// 住宿資料點的組裝（scripts/build-lodging.mjs 用；純函式，方便測試）。T9b 建立，T19 沿用。
// 規則來源：CONVENTIONS §4「判斷細則」住宿（reviewAverage 0＝不公開、兒童價 1～99% 才填、15 人住不下的 nearbyCombos）、
// 「照片」（官網 → 楽天 → Google，最多 3 張）、座標 300 m 規則（spot-build.mjs 共用）。
// T8b 的伊勢 lodging.json 是手寫的，這裡照它的欄位順序與寫法。

import { cleanCid, googleUrl, pickCoords, mergeSources, haversineMeters } from './spot-build.mjs';

export const MAX_PHOTOS = 3;
export const COMBO_RADIUS_METERS = 1000;
export const COMBO_COUNT = 4;

const ORDER = [
  'id', 'type', 'name', 'area', 'region', 'kind', 'coords', 'coordsSource', 'address', 'hours', 'closedNote', 'febNote',
  'closures', 'photos', 'links', 'tags', 'tier', 'nearestStation', 'pickup', 'meals', 'priceRange', 'prices', 'luggage',
  'checkIn', 'checkOut', 'rakutenHotelNo', 'dinnerAccess', 'group', 'ratings', 'accessibility', 'reservation',
  'bookingLinks', 'sources', 'verified', 'extra', 'summary', 'assessment',
];

const WEEKDAY = ['日', '一', '二', '三', '四', '五', '六'];
export const dayLabel = (d) => `${d}（${WEEKDAY[new Date(`${d}T00:00:00Z`).getUTCDay()]}）`;
const nextDay = (d) => {
  const t = new Date(`${d}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + 1);
  return t.toISOString().slice(0, 10);
};
const yen = (n) => n.toLocaleString('ja-JP');

/** 楽天網頁的方案列表（指定日期、房數、大人、小學生高學年），給人點過去看。 */
export function reserveUrl(no, date, rooms, adults, up = 0) {
  const [y1, m1, d1] = date.split('-').map(Number);
  const [y2, m2, d2] = nextDay(date).split('-').map(Number);
  return `https://hotel.travel.rakuten.co.jp/hotelinfo/plan/${no}?f_nen1=${y1}&f_tuki1=${m1}&f_hi1=${d1}&f_nen2=${y2}&f_tuki2=${m2}&f_hi2=${d2}&f_heya_su=${rooms}&f_otona_su=${adults}&f_s1=${up}&f_s2=0&f_y1=0&f_y2=0&f_y3=0&f_y4=0`;
}

export const rakutenPage = (no) => `https://travel.rakuten.co.jp/HOTEL/${no}/${no}.html`;

/** 楽天 checkin／checkout（"15:00"、"15：00"、"1500"、"15:00～"）→ "HH:MM"；看不懂回傳 null */
export function normTime(s) {
  if (s == null) return null;
  const m = String(s).replace(/：/g, ':').match(/(\d{1,2}):?(\d{2})/);
  if (!m) return null;
  const h = Number(m[1]);
  if (h > 29) return null;
  return `${String(h).padStart(2, '0')}:${m[2]}`;
}

/** 楽天評分：0 是不公開（判斷細則），null；其他照 API 值 */
export const rakutenScore = (v) => (v == null || v === 0 ? null : v);

/**
 * party 結果（rakuten.mjs party --json，可以多個中心）合併成一間的空房：
 * { dates, combos, available: {date: [combo...]}, best: {date: {any, dinner}} }
 * best.any／best.dinner 是那天所有有空房組合裡每人最低價的方案（附 combo、reserveUrl）。
 */
export function vacancyFor(partyResults, hotelNo) {
  const dates = [...new Set(partyResults.flatMap((r) => r.dates))].sort();
  const combos = [...new Set(partyResults.flatMap((r) => r.combos))];
  const available = Object.fromEntries(dates.map((d) => [d, []]));
  const best = Object.fromEntries(dates.map((d) => [d, { any: null, dinner: null }]));
  for (const r of partyResults) {
    const h = r.hotels.find((x) => Number(x.hotelNo) === Number(hotelNo));
    if (!h) continue;
    for (const v of h.vacancies) {
      if (!available[v.date].includes(v.combo)) available[v.date].push(v.combo);
      for (const [k, p] of [['any', v.cheapest], ['dinner', v.cheapestWithDinner]]) {
        if (!p || p.perPerson == null) continue;
        const cur = best[v.date][k];
        if (!cur || p.perPerson < cur.perPerson) best[v.date][k] = { ...p, combo: v.combo, reserveUrl: v.reserveUrl };
      }
    }
  }
  for (const d of dates) available[d].sort((a, b) => combos.indexOf(a) - combos.indexOf(b));
  return { dates, combos, available, best };
}

export const fitsByVacancy = (vac) => Object.values(vac.available).some((l) => l.length > 0);

const mealLabel = (p) => (p.dinner ? '一泊二食' : p.breakfast ? '附早餐' : '素泊');

/** 15 人組合的價格 → prices 項目（每天：含晚餐最低、和不同方案時的全部最低） */
export function partyPrices(vac, hotelNo, { party = 15, queried }) {
  const out = [];
  for (const d of vac.dates) {
    const { any, dinner } = vac.best[d];
    const list = [dinner, any && (!dinner || any.planId !== dinner.planId) ? any : null].filter(Boolean);
    for (const p of list) {
      const [rooms, adults] = p.combo.split('x').map(Number);
      out.push({
        plan: `${mealLabel(p)} 楽天 ${party} 人組合最低價（${p.planName ?? p.roomName ?? "方案名不明"}）`,
        unit: 'per-person',
        adult: p.perPerson,
        child: null,
        currency: 'JPY',
        season: `${dayLabel(d)}1 泊，${rooms} 間 × ${adults} 人（大人）有空房時的最低價`,
        note: `房型：${p.roomName ?? '—'}。楽天 API 空室検索（查詢 ${queried}），含稅、不含入湯稅等。這天有空房的組合：${vac.available[d].join('、')}。`,
        source: 'rakuten-api',
        url: p.reserveUrl ?? reserveUrl(hotelNo, d, rooms, adults),
        retrieved: queried,
      });
    }
  }
  return out;
}

/**
 * 小家庭的查詢（rakuten.mjs vacant --hotel N --rooms 1 --adults 3 --up 1 --plans --json 的一間）→ 兒童價。
 * 小學生價＝一間總價 − 3 × 大人每人價；比例 1～99% 才填 child（判斷細則），100%、0 只寫在 note。
 * preferDinner：含晚餐的住宿取含晚餐的最低價方案。
 */
export function kidsPrice(entry, { hotelNo, date, adults = 3, up = 1, preferDinner = false, queried }) {
  const plans = (entry?.plans ?? []).filter((p) => p.perPerson != null && p.roomTotal != null);
  if (!plans.length) return null;
  const pool = preferDinner && plans.some((p) => p.dinner) ? plans.filter((p) => p.dinner) : plans;
  const p = [...pool].sort((a, b) => a.roomTotal - b.roomTotal)[0];
  const child = p.roomTotal - adults * p.perPerson;
  const ratio = Math.round((child / p.perPerson) * 100);
  const ok = child > 0 && ratio >= 1 && ratio <= 99;
  const why = ok
    ? `小學生（高學年）${yen(child)} 円＝大人的 ${ratio}%`
    : child === 0 || ratio <= 0
      ? 'API 的小學生價是 0（可能不佔床或不另收），兒童價不推算'
      : ratio === 100
        ? 'API 的小學生價和大人相同（可能以房計價或兒童同價），兒童價不推算'
        : `API 算出的小學生價是大人的 ${ratio}%，不合理，兒童價不推算`;
  return {
    plan: `${mealLabel(p)} 大人 ${adults}＋小學生高年級 ${up}（1 室）最低價（${p.planName ?? p.roomName ?? "方案名不明"}）`,
    unit: 'per-person',
    adult: p.perPerson,
    child: ok ? child : null,
    currency: 'JPY',
    season: `${dayLabel(date)}1 泊，1 間 大人 ${adults}＋小學生高年級 ${up}`,
    note: `房型：${p.roomName ?? '—'}。一間總價 ${yen(p.roomTotal)} 円；${why}。楽天 API（查詢 ${queried}）。`,
    source: 'rakuten-api',
    url: reserveUrl(hotelNo, date, 1, adults, up),
    retrieved: queried,
  };
}

/** 一間 N 人（一棟貸し的容量、小宿的參考價）→ prices 項目 */
export function roomPrice(entry, { hotelNo, date, adults, preferDinner = false, queried, label }) {
  const plans = (entry?.plans ?? []).filter((p) => p.perPerson != null || p.roomTotal != null);
  if (!plans.length) return null;
  const pool = preferDinner && plans.some((p) => p.dinner) ? plans.filter((p) => p.dinner) : plans;
  const p = [...pool].sort((a, b) => (a.roomTotal ?? a.perPerson * adults) - (b.roomTotal ?? b.perPerson * adults))[0];
  return {
    plan: `${mealLabel(p)} ${label ?? `1 間 大人 ${adults}`} 最低價（${p.planName ?? p.roomName ?? "方案名不明"}）`,
    unit: p.perPerson != null ? 'per-person' : 'per-room',
    adult: p.perPerson ?? null,
    child: null,
    ...(p.perPerson == null ? { price: p.roomTotal } : {}),
    currency: 'JPY',
    season: `${dayLabel(date)}1 泊，1 間 大人 ${adults}`,
    note: `房型：${p.roomName ?? '—'}。一間總價 ${p.roomTotal != null ? `${yen(p.roomTotal)} 円` : '—'}。楽天 API 空室検索（查詢 ${queried}），含稅、不含入湯稅等。`,
    source: 'rakuten-api',
    url: reserveUrl(hotelNo, date, 1, adults),
    retrieved: queried,
  };
}

/** prices 的每人價範圍 → priceRange 文字 */
export function priceRangeText(prices) {
  const per = prices.filter((p) => p.unit === 'per-person' && typeof p.adult === 'number');
  if (per.length) {
    const v = per.map((p) => p.adult);
    const lo = Math.min(...v), hi = Math.max(...v);
    const meals = [...new Set(per.map((p) => p.plan.split(' ')[0]))];
    return `每人約 ${yen(lo)}${hi > lo ? `～${yen(hi)}` : ''} 円（${meals.join('／')}；詳見 prices）`;
  }
  // 一棟貸し、以房計價（沒有每人價）：每間（棟）的總價（T9b 加）
  const whole = prices.filter((p) => (p.unit === 'per-room' || p.unit === 'per-house') && typeof p.price === 'number');
  if (!whole.length) return null;
  const v = whole.map((p) => p.price);
  const lo = Math.min(...v), hi = Math.max(...v);
  return `每間（棟）約 ${yen(lo)}${hi > lo ? `～${yen(hi)}` : ''} 円（詳見 prices）`;
}

// 照片：judgement 給的（官網）→ 楽天施設照片 → Google 主圖；photos.json 檢查不 ok 的拿掉
export function pickLodgingPhotos(given = [], detail = null, g = null, checked = null, gPage = null) {
  const list = given.map((p) => ({ kind: 'official', ...p }));
  const no = detail?.hotelNo;
  for (const u of [detail?.images?.hotel, detail?.images?.room]) {
    if (u && !list.some((p) => p.url === u)) list.push({ url: u, page: rakutenPage(no), kind: 'rakuten', credit: '楽天トラベル（施設提供）' });
  }
  if (g?.img && !list.some((p) => p.url === g.img)) list.push({ url: g.img, page: gPage, kind: 'google', credit: 'Google マップ（施設或使用者上傳）' });
  const ok = (u) => !checked || checked[u]?.ok === true;
  const dropped = list.filter((p) => !ok(p.url)).map((p) => p.url);
  // 官網最多 2 張，留位置給楽天或 Google（照片種類分散，T8b 的做法）
  const kept = list.filter((p) => ok(p.url));
  const off = kept.filter((p) => p.kind === 'official');
  const rest = kept.filter((p) => p.kind !== 'official');
  const pick = [...off.slice(0, rest.length ? 2 : MAX_PHOTOS), ...rest, ...off.slice(2)].slice(0, MAX_PHOTOS);
  return {
    photos: pick.map((p) => ({ url: p.url, page: p.page ?? null, kind: p.kind, credit: p.credit ?? null, license: p.license ?? null })),
    dropped,
  };
}

export function ordered(p) {
  const o = {};
  for (const k of ORDER) if (k in p) o[k] = p[k];
  for (const k of Object.keys(p)) if (!ORDER.includes(k)) o[k] = p[k];
  return o;
}

/**
 * 組一筆住宿。
 * j＝judgement（Claude 寫的欄位；特殊鍵：googleKey、origCoords、origCoordsSource、ratingsNote、extraSources、
 *   officialPrices（官網、其他來源的 prices，原樣接在前面）、fits15（覆寫自動判斷）、candKey）
 * ctx：{ area, detail（rakuten detail 一筆）, vac（vacancyFor 的結果）, kids（kidsPrice 項目）, roomPrices（roomPrice 項目陣列）,
 *        g（google.jsonl 一行）, facts, checked, retrieved（Chrome 日期）, queried（楽天查詢日期）, party }
 * 回傳 { point, dropped, fits15 }
 */
export function buildLodging(j, ctx) {
  const { area, detail = null, vac = null, kids = null, roomPrices = [], g = null, facts = null, checked = null, retrieved, queried, party = 15 } = ctx;
  const {
    googleKey, origCoords, origCoordsSource, ratingsNote, extraSources = [], officialPrices = [], fits15: fitsOverride,
    candKey, ...rest
  } = j;
  const no = detail?.hotelNo ?? j.rakutenHotelNo ?? null;
  const cid = cleanCid(g?.cid);
  const gUrl = googleUrl(cid);

  const orig = origCoords ?? detail?.coords ?? null;
  const origSrc = origCoords ? (origCoordsSource ?? 'other') : 'other';
  const label = origCoords ? (origCoordsSource ?? 'other') : '楽天';
  const pos = pickCoords(orig, origSrc, g, label) ?? { coords: j.coords, coordsSource: j.coordsSource ?? 'other', conflict: null, distance: null };

  const { photos, dropped } = pickLodgingPhotos(j.photos ?? [], detail, g, checked, gUrl);
  const extra = { ...(j.extra ?? {}) };
  if (pos.conflict) extra.conflicts = [...(extra.conflicts ?? []), pos.conflict];
  if (!gUrl && !extra.googleMapsNote) extra.googleMapsNote = `Google 地圖找不到這間（${retrieved}），links.googleMaps 用座標搜尋連結`;

  const prices = [...officialPrices];
  if (vac && no) prices.push(...partyPrices(vac, no, { party, queried }));
  if (kids) prices.push(kids);
  prices.push(...roomPrices.filter(Boolean));

  if (vac && no) {
    extra.rakutenVacancy = {
      retrieved: queried,
      dates: vac.dates,
      combos: vac.combos,
      available: vac.available,
      note: `${party} 人（全部以大人計）分 N 間同住的組合，有空房的列出；只代表查詢當天楽天上的庫存`,
    };
  }

  const r = detail?.ratings ?? {};
  const rakNote = detail && detail.reviewAverage === 0 ? '楽天 API 的 reviewAverage 是 0（評分不公開），填 null。' : '';
  const ratings = {
    rakuten: rakutenScore(detail?.reviewAverage),
    rakutenReviews: detail?.reviewCount ?? null,
    jalan: j.ratings?.jalan ?? null,
    jalanReviews: j.ratings?.jalanReviews ?? null,
    booking: j.ratings?.booking ?? null,
    google: g?.rating ?? null,
    googleReviews: g?.reviews ?? null,
    ...(detail
      ? {
          rakutenService: rakutenScore(r.service), rakutenLocation: rakutenScore(r.location), rakutenRoom: rakutenScore(r.room),
          rakutenEquipment: rakutenScore(r.equipment), rakutenBath: rakutenScore(r.bath), rakutenMeal: rakutenScore(r.meal),
        }
      : {}),
    note: [ratingsNote, rakNote].filter(Boolean).join(' ') || null,
  };

  const group = {
    totalRooms: null, roomTypes: [], maxGuests: null, wholeRental: null, pickupCapacity: null, nearbyCombos: [], note: null,
    ...(j.group ?? {}),
  };
  if (group.totalRooms == null && detail?.roomNum) group.totalRooms = detail.roomNum;
  const fits15 = fitsOverride ?? ((vac && fitsByVacancy(vac)) || (group.maxGuests ?? 0) >= party);

  const sources = mergeSources(
    no
      ? [{ type: 'booking-site', url: rakutenPage(no), retrieved: queried, note: `楽天トラベル API（SimpleHotelSearch、HotelDetailSearch、VacantHotelSearch，scripts/rakuten.mjs）：評分、細項評分、房數、check-in/out、照片${vac ? `、${vac.dates.join('／')} 的空房與價格` : ''}` }]
      : [],
    gUrl ? [{ type: 'google-maps', url: gUrl, retrieved, note: `Google 地圖「${g.name ?? '—'}」：星數、評論數、座標、照片` }] : [],
    facts?.sources ?? [],
    extraSources,
    j.sources ?? [],
  );

  const tags = [...(j.tags ?? [])];
  if (group.wholeRental === true && !tags.includes('包棟')) tags.push('包棟');

  const p = {
    type: 'lodging',
    area,
    hours: null,
    closedNote: null,
    febNote: null,
    closures: [],
    tier: null,
    nearestStation: null,
    pickup: null,
    meals: null,
    luggage: null,
    dinnerAccess: null,
    accessibility: { elevator: null, beds: null, stairs: null, kids: null, note: null },
    verified: false,
    summary: null,
    assessment: null,
    ...rest,
    address: j.address ?? detail?.address ?? null,
    coords: pos.coords,
    coordsSource: pos.coordsSource,
    photos,
    links: {
      official: null,
      ...(j.links ?? {}),
      googleMaps: gUrl ?? j.links?.googleMaps ?? (pos.coords ? `https://www.google.com/maps/search/?api=1&query=${pos.coords[1]},${pos.coords[0]}` : null),
    },
    tags,
    prices,
    priceRange: j.priceRange ?? priceRangeText(prices),
    checkIn: j.checkIn ?? normTime(detail?.checkin),
    checkOut: j.checkOut ?? normTime(detail?.checkout),
    rakutenHotelNo: no,
    group,
    ratings,
    reservation: {
      methods: no ? ['rakuten'] : [],
      phone: detail?.telephone ?? null,
      url: null,
      groupNote: null,
      ...(j.reservation ?? {}),
    },
    bookingLinks: { ...(no ? { rakuten: rakutenPage(no) } : {}), ...(j.bookingLinks ?? {}) },
    sources,
    extra,
  };
  if (!p.reservation.methods.includes('rakuten') && no) p.reservation.methods.unshift('rakuten');
  return { point: ordered(p), dropped, fits15 };
}

/**
 * 15 人住不下的：同區（region）直線 1 km 內最近的 4 間（判斷細則）。points 是同一批組好的資料點，
 * fitsMap：id → fits15。已有 nearbyCombos 的（judgement 指定）不動。
 */
export function fillNearbyCombos(points, fitsMap, { radius = COMBO_RADIUS_METERS, count = COMBO_COUNT } = {}) {
  for (const p of points) {
    if (fitsMap[p.id] || p.group?.nearbyCombos?.length) continue;
    const near = points
      .filter((q) => q.id !== p.id && q.region === p.region && q.coords && p.coords)
      .map((q) => [q.id, haversineMeters(p.coords, q.coords)])
      .filter(([, d]) => d <= radius)
      .sort((a, b) => a[1] - b[1])
      .slice(0, count)
      .map(([id]) => id);
    p.group.nearbyCombos = near;
  }
  return points;
}
