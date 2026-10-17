#!/usr/bin/env node
// 楽天トラベル API 查詢工具（T7d 建立；T8b、T9b、T19 沿用）。
// 用法見 CONVENTIONS.md §4「楽天トラベル API」。key 放在 .env（RAKUTEN_APPLICATION_ID、RAKUTEN_ACCESS_KEY），不要 commit。
//
// 指令：
//   node scripts/rakuten.mjs detail <hotelNo...>
//       施設情報（HotelDetailSearch）：總評分、評論數、細項評分、座標、房數、check-in/out、照片 URL。
//   node scripts/rakuten.mjs vacant (--hotel <no,no,...> | --region <子地區 ID> | --lat <緯度> --lng <經度>)
//                                   --in <YYYY-MM-DD> [--out <YYYY-MM-DD>] [--rooms N] [--adults N] [--up N] [--low N]
//                                   [--radius km] [--plans] [--max-pages N]
//       空室検索（VacantHotelSearch）。--rooms × --adults 是房型組合（例如 5 間 × 3 人）；--up／--low 是每間的小學生高／低學年人數。
//       --plans：列出每個方案（searchPattern=1），否則每間飯店只回最低價。--region 用 data/areas.json 的子地區中心，半徑預設 3 km（API 上限）。
//   node scripts/rakuten.mjs simple (--region <子地區 ID> | --lat <緯度> --lng <經度>) [--radius km] [--max-pages N]
//       施設検索（SimpleHotelSearch，T8b 加）：列出範圍內所有上楽天的住宿（不看空房），用來撈候選母體。
//   node scripts/rakuten.mjs party (--hotel ... | --region ... | --lat --lng) --dates <YYYY-MM-DD,...> [--party 15] [--combos 5x3,4x4,3x5,2x8]
//       每個日期、每個房型組合查一次空房，整理成「哪些飯店能讓全員同住、最低每人價格」。
//
// 共用選項：--json（輸出 JSON；預設是給人看的文字）。呼叫間隔 1.1 秒以上。
// 價格說明：dailyCharge.rakutenCharge 是 chargeFlag=0 時的每人價（含稅、不含入湯稅等），total 是一間房一晚的總價。

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'https://openapi.rakuten.co.jp/engine/api/Travel';
const VERSION = '20170426';
const INTERVAL_MS = 1100;

// ---------- 參數 ----------
const argv = process.argv.slice(2);
const cmd = argv.shift();
const opts = {};
const positional = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a.startsWith('--')) {
    const k = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) opts[k] = true;
    else { opts[k] = next; i++; }
  } else positional.push(a);
}

function usage(msg) {
  if (msg) console.error(`錯誤：${msg}\n`);
  const head = fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').filter((l) => l.startsWith('//')).map((l) => l.slice(3));
  console.error(head.join('\n'));
  process.exit(msg ? 1 : 0);
}

// ---------- API ----------
function loadKeys() {
  const envFile = path.join(ROOT, '.env');
  if (fs.existsSync(envFile) && typeof process.loadEnvFile === 'function') process.loadEnvFile(envFile);
  const applicationId = process.env.RAKUTEN_APPLICATION_ID;
  const accessKey = process.env.RAKUTEN_ACCESS_KEY;
  if (!applicationId || !accessKey) usage('.env 裡沒有 RAKUTEN_APPLICATION_ID 或 RAKUTEN_ACCESS_KEY');
  return { applicationId, accessKey };
}

let lastCall = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 呼叫 API；沒有結果（not_found）回傳 null；其他錯誤丟出 Error（訊息不含 key）。 */
async function call(api, params) {
  const { applicationId, accessKey } = loadKeys();
  const u = new URL(`${BASE}/${api}/${VERSION}`);
  u.searchParams.set('applicationId', applicationId);
  u.searchParams.set('accessKey', accessKey);
  u.searchParams.set('format', 'json');
  u.searchParams.set('formatVersion', '2');
  u.searchParams.set('datumType', '1'); // 世界測地系、度
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null) u.searchParams.set(k, String(v));

  for (let attempt = 0; attempt < 4; attempt++) {
    const wait = lastCall + INTERVAL_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastCall = Date.now();
    let res, body;
    try {
      res = await fetch(u);
      body = await res.json().catch(() => ({}));
    } catch (e) {
      if (attempt === 3) throw new Error(`${api}: 連線失敗（${e.message}）`);
      await sleep(2000 * (attempt + 1));
      continue;
    }
    if (res.ok) return body;
    if (body.error === 'not_found') return null;
    if (res.status === 429 || res.status >= 500) { await sleep(3000 * (attempt + 1)); continue; }
    throw new Error(`${api}: HTTP ${res.status} ${body.error ?? ''} ${body.error_description ?? ''}`.trim());
  }
  throw new Error(`${api}: 重試多次仍失敗`);
}

// formatVersion=2 的 hotels 是 [[{hotelBasicInfo}, {hotelRatingInfo}, ...], ...]
const part = (hotel, key) => hotel.find((p) => p[key])?.[key];
const canonicalUrl = (no) => `https://travel.rakuten.co.jp/HOTEL/${no}/${no}.html`;

// ---------- detail ----------
async function detail(nos) {
  const out = [];
  for (let i = 0; i < nos.length; i += 15) {
    const chunk = nos.slice(i, i + 15);
    // HotelDetailSearch 一次只收 1 個 hotelNo（多個會被忽略），所以逐一查
    for (const no of chunk) {
      try {
        const body = await call('HotelDetailSearch', { hotelNo: no, responseType: 'large' });
        if (!body?.hotels?.length) { out.push({ hotelNo: Number(no), error: 'not_found' }); continue; }
        out.push(summarizeDetail(body.hotels[0]));
      } catch (e) {
        out.push({ hotelNo: Number(no), error: e.message });
      }
    }
  }
  return out;
}

function summarizeDetail(h) {
  const b = part(h, 'hotelBasicInfo') ?? {};
  const r = part(h, 'hotelRatingInfo') ?? {};
  const d = part(h, 'hotelDetailInfo') ?? {};
  const f = part(h, 'hotelFacilitiesInfo') ?? {};
  return {
    hotelNo: b.hotelNo,
    name: b.hotelName,
    url: canonicalUrl(b.hotelNo),
    reviewAverage: b.reviewAverage ?? null,
    reviewCount: b.reviewCount ?? null,
    ratings: {
      service: r.serviceAverage ?? null, location: r.locationAverage ?? null, room: r.roomAverage ?? null,
      equipment: r.equipmentAverage ?? null, bath: r.bathAverage ?? null, meal: r.mealAverage ?? null,
    },
    coords: b.longitude != null ? [round(b.longitude, 7), round(b.latitude, 7)] : null,
    address: `${b.address1 ?? ''}${b.address2 ?? ''}` || null,
    telephone: b.telephoneNo ?? null,
    access: b.access ?? null,
    parking: b.parkingInformation ?? null,
    hotelClass: d.hotelClassCode ?? null,
    roomNum: f.hotelRoomNum ?? null,
    checkin: d.checkinTime ?? null,
    checkout: d.checkoutTime ?? null,
    lastCheckin: d.lastCheckinTime ?? null,
    minCharge: b.hotelMinCharge ?? null,
    images: { hotel: b.hotelImageUrl ?? null, room: b.roomImageUrl ?? null },
  };
}

const round = (x, n) => Math.round(x * 10 ** n) / 10 ** n;

// ---------- vacant ----------
function locationParams() {
  if (opts.hotel) return { hotelNo: String(opts.hotel) };
  let lat = opts.lat, lng = opts.lng;
  if (opts.region) {
    const areas = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/areas.json'), 'utf8'));
    const reg = areas.flatMap((a) => a.regions ?? []).find((r) => r.id === opts.region);
    if (!reg?.center) usage(`areas.json 裡找不到子地區 ${opts.region}（或沒有 center）`);
    [lng, lat] = reg.center;
  }
  if (lat == null || lng == null) usage('要指定 --hotel、--region 或 --lat/--lng');
  return { latitude: lat, longitude: lng, searchRadius: Math.min(Number(opts.radius ?? 3), 3) };
}

function nextDay(d) {
  const t = new Date(`${d}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + 1);
  return t.toISOString().slice(0, 10);
}

/** 一次空室検索（含分頁），回傳每間飯店的方案列表。 */
async function vacant({ checkin, checkout, rooms, adults, up = 0, low = 0, plans = false, maxPages = 5, loc }) {
  if (hotelCount(loc) > 15) usage('--hotel 一次最多 15 個');
  const base = {
    ...loc, checkinDate: checkin, checkoutDate: checkout ?? nextDay(checkin),
    roomNum: rooms, adultNum: adults, upClassNum: up || undefined, lowClassNum: low || undefined,
    searchPattern: plans ? 1 : 0, hits: 30, responseType: 'middle',
  };
  const byHotel = new Map();
  for (let page = 1; page <= maxPages; page++) {
    const body = await call('VacantHotelSearch', { ...base, page });
    if (!body?.hotels?.length) break;
    for (const h of body.hotels) {
      const b = part(h, 'hotelBasicInfo');
      const entry = byHotel.get(b.hotelNo) ?? {
        hotelNo: b.hotelNo, name: b.hotelName, url: canonicalUrl(b.hotelNo),
        reviewAverage: b.reviewAverage ?? null, reviewCount: b.reviewCount ?? null,
        coords: b.longitude != null ? [round(b.longitude, 7), round(b.latitude, 7)] : null,
        images: { hotel: b.hotelImageUrl ?? null, room: b.roomImageUrl ?? null },
        plans: [],
      };
      const rooms = part(h, 'roomInfo') ?? [];
      for (let i = 0; i < rooms.length; i++) {
        const info = rooms[i].roomBasicInfo;
        if (!info) continue;
        const charge = rooms[i + 1]?.dailyCharge ?? {};
        entry.plans.push({
          planId: info.planId, planName: info.planName, roomName: info.roomName, roomClass: info.roomClass,
          dinner: info.withDinnerFlag === 1, breakfast: info.withBreakfastFlag === 1,
          perPerson: charge.chargeFlag === 0 ? charge.rakutenCharge ?? null : null,
          roomTotal: charge.total ?? null, chargeFlag: charge.chargeFlag ?? null,
        });
      }
      byHotel.set(b.hotelNo, entry);
    }
    if (page >= (body.pagingInfo?.pageCount ?? 1)) break;
  }
  return [...byHotel.values()];
}

const hotelCount = (loc) => (loc.hotelNo ? loc.hotelNo.split(',').length : 0);

// ---------- simple ----------
/** 範圍內所有住宿（不看日期、空房），含分頁。 */
async function simple({ loc, maxPages = 5 }) {
  const out = [];
  for (let page = 1; page <= maxPages; page++) {
    const body = await call('SimpleHotelSearch', { ...loc, hits: 30, page, responseType: 'middle' });
    if (!body?.hotels?.length) break;
    for (const h of body.hotels) {
      const b = part(h, 'hotelBasicInfo') ?? {};
      out.push({
        hotelNo: b.hotelNo, name: b.hotelName, url: canonicalUrl(b.hotelNo),
        reviewAverage: b.reviewAverage ?? null, reviewCount: b.reviewCount ?? null,
        coords: b.longitude != null ? [round(b.longitude, 7), round(b.latitude, 7)] : null,
        address: `${b.address1 ?? ''}${b.address2 ?? ''}` || null, minCharge: b.hotelMinCharge ?? null,
        images: { hotel: b.hotelImageUrl ?? null, room: b.roomImageUrl ?? null },
      });
    }
    if (page >= (body.pagingInfo?.pageCount ?? 1)) break;
  }
  return out;
}

function printSimple(list) {
  if (!list.length) console.log('範圍內沒有住宿');
  for (const h of list) console.log(`${h.hotelNo} ${h.name}（${h.reviewAverage ?? '—'}／${h.reviewCount ?? 0} 則）最低 ${yen(h.minCharge)}  ${h.address}`);
}

// ---------- party ----------
async function party() {
  const dates = String(opts.dates ?? '').split(',').filter(Boolean);
  if (!dates.length) usage('party 要 --dates');
  const size = Number(opts.party ?? 15);
  const combos = String(opts.combos ?? '5x3,4x4,3x5,2x8').split(',').map((c) => c.split('x').map(Number));
  for (const [r, a] of combos) if (r * a < size || r > 10 || a > 10) usage(`房型組合 ${r}x${a} 不合法（要能住下 ${size} 人，每項最多 10）`);
  const loc = locationParams();
  const result = { party: size, combos: combos.map(([r, a]) => `${r}x${a}`), dates, hotels: {} , errors: [] };
  for (const date of dates) {
    for (const [r, a] of combos) {
      let hotels;
      try {
        hotels = await vacant({ checkin: date, rooms: r, adults: a, plans: true, maxPages: Number(opts['max-pages'] ?? 5), loc });
      } catch (e) { result.errors.push({ date, combo: `${r}x${a}`, error: e.message }); continue; }
      for (const h of hotels) {
        const e = result.hotels[h.hotelNo] ??= { hotelNo: h.hotelNo, name: h.name, url: h.url, reviewAverage: h.reviewAverage, reviewCount: h.reviewCount, coords: h.coords, images: h.images, vacancies: [] };
        const priced = h.plans.filter((p) => p.perPerson != null);
        const cheapest = priced.sort((x, y) => x.perPerson - y.perPerson)[0] ?? null;
        const withDinner = priced.filter((p) => p.dinner).sort((x, y) => x.perPerson - y.perPerson)[0] ?? null;
        e.vacancies.push({
          date, combo: `${r}x${a}`, planCount: h.plans.length,
          cheapest: cheapest && pick(cheapest), cheapestWithDinner: withDinner && pick(withDinner),
          reserveUrl: reserveUrl(h.hotelNo, date, r, a),
        });
      }
    }
  }
  result.hotels = Object.values(result.hotels);
  return result;
}

const pick = (p) => ({ planId: p.planId, planName: p.planName, roomName: p.roomName, perPerson: p.perPerson, roomTotal: p.roomTotal, dinner: p.dinner, breakfast: p.breakfast });

/** 楽天網頁的方案列表（指定日期與人數），給人點過去看。 */
function reserveUrl(no, date, rooms, adults) {
  const [y1, m1, d1] = date.split('-').map(Number);
  const [y2, m2, d2] = nextDay(date).split('-').map(Number);
  return `https://hotel.travel.rakuten.co.jp/hotelinfo/plan/${no}?f_nen1=${y1}&f_tuki1=${m1}&f_hi1=${d1}&f_nen2=${y2}&f_tuki2=${m2}&f_hi2=${d2}&f_heya_su=${rooms}&f_otona_su=${adults}&f_s1=0&f_s2=0&f_y1=0&f_y2=0&f_y3=0&f_y4=0`;
}

// ---------- 輸出 ----------
const yen = (n) => (n == null ? '—' : `${n.toLocaleString('ja-JP')} 円`);

function printDetail(list) {
  for (const h of list) {
    if (h.error) { console.log(`${h.hotelNo}：${h.error}`); continue; }
    const r = h.ratings;
    console.log(`${h.hotelNo} ${h.name}\n  評分 ${h.reviewAverage}（${h.reviewCount} 則）服務 ${r.service} 地點 ${r.location} 房間 ${r.room} 設備 ${r.equipment} 浴場 ${r.bath} 餐 ${r.meal}`);
    console.log(`  ${h.address}  ${h.telephone}  房數 ${h.roomNum}  IN ${h.checkin} OUT ${h.checkout}  座標 ${h.coords}\n  ${h.url}`);
  }
}

function printVacant(list) {
  if (!list.length) console.log('沒有空房（或沒有符合的飯店）');
  for (const h of list) {
    console.log(`${h.hotelNo} ${h.name}（${h.reviewAverage ?? '—'}／${h.reviewCount ?? 0} 則）方案 ${h.plans.length}`);
    for (const p of h.plans.slice(0, opts.plans ? 50 : 1)) {
      console.log(`  ${yen(p.perPerson)}/人 ${yen(p.roomTotal)}/間 ${p.dinner ? '夕' : '－'}${p.breakfast ? '朝' : '－'} ${p.planName} ｜${p.roomName}`);
    }
  }
}

function printParty(res) {
  console.log(`${res.party} 人，組合 ${res.combos.join('、')}，日期 ${res.dates.join('、')}`);
  for (const h of res.hotels) {
    console.log(`${h.hotelNo} ${h.name}（${h.reviewAverage ?? '—'}／${h.reviewCount ?? 0} 則）`);
    for (const v of h.vacancies) console.log(`  ${v.date} ${v.combo}：方案 ${v.planCount}，最低 ${yen(v.cheapest?.perPerson)}/人，含晚餐最低 ${yen(v.cheapestWithDinner?.perPerson)}/人`);
  }
  for (const e of res.errors) console.log(`錯誤 ${e.date} ${e.combo}：${e.error}`);
}

// ---------- main ----------
const emit = (data, printer) => (opts.json ? console.log(JSON.stringify(data, null, 2)) : printer(data));

try {
  if (cmd === 'detail') {
    if (!positional.length) usage('detail 要給 hotelNo');
    emit(await detail(positional.flatMap((s) => s.split(','))), printDetail);
  } else if (cmd === 'vacant') {
    if (!opts.in) usage('vacant 要 --in');
    const list = await vacant({
      checkin: opts.in, checkout: opts.out, rooms: Number(opts.rooms ?? 1), adults: Number(opts.adults ?? 2),
      up: Number(opts.up ?? 0), low: Number(opts.low ?? 0), plans: !!opts.plans, maxPages: Number(opts['max-pages'] ?? 5), loc: locationParams(),
    });
    emit(list, printVacant);
  } else if (cmd === 'simple') {
    emit(await simple({ loc: locationParams(), maxPages: Number(opts['max-pages'] ?? 5) }), printSimple);
  } else if (cmd === 'party') {
    emit(await party(), printParty);
  } else usage(cmd ? `不認得的指令 ${cmd}` : null);
} catch (e) {
  console.error(`錯誤：${e.message}`);
  process.exit(1);
}
