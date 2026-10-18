#!/usr/bin/env node
// 住宿的新資料點組裝（T9b 建立，T19 沿用；CONVENTIONS §4 標準作業流程步驟 4～6）。
// Claude 只寫 judgement.json（讀文 facts 判斷後的欄位：kind、meals、nearestStation、group、accessibility、reservation…），
// 楽天（評分、細項、房數、check-in/out、照片、15 人組合的空房與價格、兒童價）、Google（連結、星數、座標 300 m 規則、主圖）、
// 照片取捨、sources 合併、nearbyCombos、寫回 lodging.json、候選的 pointId 由這支做。
//
// 用法：
//   node scripts/build-lodging.mjs <area> <工作目錄> [--candidates] [--dry-run] [--retrieved YYYY-MM-DD] [--queried YYYY-MM-DD]
//                                  [--kids-date YYYY-MM-DD] [--party 15]
// 工作目錄裡要有：
//   judgement.json   [{ id, name, region, kind, rakutenHotelNo?, meals, nearestStation, group, accessibility, reservation,
//                       photos（官網）, officialPrices?, origCoords?（沒上楽天的）, googleKey?, fits15?, candKey?, ... }]
//   rk/detail.json   rakuten.mjs detail --json 的輸出（陣列）
//   rk/party-*.json  rakuten.mjs party --json 的輸出（可以多個中心，合併看）
//   rk/kids.json     rakuten.mjs vacant --hotel … --rooms 1 --adults 3 --up 1 --plans --json（推兒童價；沒有就略過）
//   rk/rooms-<N>.json rakuten.mjs vacant --hotel … --rooms 1 --adults N --plans --json（一棟貸し容量、小宿的參考價；可多個）
//   google.jsonl     google-place.js 的結果，一行一筆、前面加 "key"（預設＝id）
//   photos.json      scripts/photo-check.mjs --out 的結果（沒有就不過濾）
//   facts/<id>.json  讀文 subagent 的 facts（只取 sources）
// --queried：楽天查詢日期（預設＝--retrieved）；--kids-date：kids.json、rooms-*.json 的入住日（預設＝party 的第一天）
// --candidates：同時把 data/raw/<area>/candidates/lodging.json 的 pointId 填上、status 改 included、拿掉 detailPending

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readJson, writeJson, readJsonl } from './lib/json-file.mjs';
import { upsert } from './lib/spot-build.mjs';
import { buildLodging, vacancyFor, kidsPrice, roomPrice, fillNearbyCombos } from './lib/lodging-build.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const VALUE_OPTS = ['retrieved', 'queried', 'kids-date', 'party'];
const opt = (k) => (args.includes(`--${k}`) ? args[args.indexOf(`--${k}`) + 1] : null);
const flag = (k) => args.includes(`--${k}`);
const [area, dirArg] = args.filter((a, i) => !a.startsWith('--') && !VALUE_OPTS.includes(args[i - 1]?.slice(2)));
if (!area || !dirArg) {
  console.error('用法：node scripts/build-lodging.mjs <area> <工作目錄> [--candidates] [--dry-run] [--retrieved YYYY-MM-DD] [--queried YYYY-MM-DD] [--kids-date YYYY-MM-DD]');
  process.exit(2);
}
const dir = path.resolve(dirArg);
const rk = path.join(dir, 'rk');
const retrieved = opt('retrieved') ?? new Date().toISOString().slice(0, 10);
const queried = opt('queried') ?? retrieved;
const party = Number(opt('party') ?? 15);
const load = (f, dflt) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : dflt);

const judgement = load(path.join(dir, 'judgement.json'), null);
if (!judgement) {
  console.error('工作目錄沒有 judgement.json');
  process.exit(2);
}
const details = new Map(load(path.join(rk, 'detail.json'), []).filter((d) => !d.error).map((d) => [Number(d.hotelNo), d]));
const parties = fs.existsSync(rk) ? fs.readdirSync(rk).filter((f) => /^party-.*\.json$/.test(f)).map((f) => load(path.join(rk, f))) : [];
const kidsDate = opt('kids-date') ?? parties[0]?.dates?.[0] ?? null;
const kidsList = load(path.join(rk, 'kids.json'), []);
const roomFiles = fs.existsSync(rk) ? fs.readdirSync(rk).filter((f) => /^rooms-\d+\.json$/.test(f)) : [];
const rooms = roomFiles.map((f) => ({ adults: Number(f.match(/\d+/)[0]), list: load(path.join(rk, f), []) })).sort((a, b) => b.adults - a.adults);
const google = new Map(readJsonl(path.join(dir, 'google.jsonl')).map((g) => [g.key, g]));
const checked = load(path.join(dir, 'photos.json'), null);

const points = [];
const fitsMap = {};
for (const j of judgement) {
  const no = j.rakutenHotelNo != null ? Number(j.rakutenHotelNo) : null;
  const detail = no ? details.get(no) ?? null : null;
  if (no && !detail) console.warn(`⚠️  ${j.id}：rk/detail.json 沒有 ${no}`);
  const g = google.get(j.googleKey ?? j.id) ?? null;
  if (!g) console.warn(`⚠️  ${j.id}：google.jsonl 沒有 ${j.googleKey ?? j.id}（用座標搜尋連結）`);
  const ff = path.join(dir, 'facts', `${j.id}.json`);
  const facts = load(ff, null);
  const vac = no && parties.length ? vacancyFor(parties, no) : null;
  const preferDinner = j.meals === 'dinner+breakfast';
  const kidsEntry = no ? kidsList.find((h) => Number(h.hotelNo) === no) : null;
  const kids = kidsEntry && kidsDate ? kidsPrice(kidsEntry, { hotelNo: no, date: kidsDate, preferDinner, queried }) : null;
  // 一間 N 人：15 人組合都沒空房、或是一棟貸し時，記可以住的最大 N（容量的參考）
  const roomPrices = [];
  if (no && kidsDate && (j.kind === 'rental-house' || (vac && !Object.values(vac.available).some((l) => l.length)))) {
    for (const r of rooms) {
      const e = r.list.find((h) => Number(h.hotelNo) === no);
      const p = e && roomPrice(e, { hotelNo: no, date: kidsDate, adults: r.adults, preferDinner, queried });
      if (p) {
        roomPrices.push(p);
        break;
      }
    }
  }
  const { point, dropped, fits15 } = buildLodging(j, { area, detail, vac, kids, roomPrices, g, facts, checked, retrieved, queried, party });
  if (dropped.length) console.warn(`⚠️  ${j.id}：照片打不開，拿掉 ${dropped.length} 張`);
  if (!point.photos.length) console.warn(`⚠️  ${j.id}：沒有照片`);
  fitsMap[j.id] = fits15;
  points.push(point);
  const av = vac ? Object.entries(vac.available).map(([d, l]) => `${d.slice(5)}:${l.join('/') || '-'}`).join(' ') : '-';
  console.log(`${j.id}  ${point.coordsSource}  楽天 ${point.ratings.rakuten ?? '-'}（${point.ratings.rakutenReviews ?? '-'}）★${point.ratings.google ?? '-'}（${point.ratings.googleReviews ?? '-'}）  空房 ${av}  prices ${point.prices.length}  照片 ${point.photos.length}  ${fits15 ? '15 人可' : '15 人不行'}`);
}
fillNearbyCombos(points, fitsMap);

const file = path.join(ROOT, `data/areas/${area}/lodging.json`);
const { data: list, eol } = fs.existsSync(file) ? readJson(file) : { data: [], eol: '\r\n' };
const out = upsert(list, points);
if (flag('dry-run')) {
  console.log(`（dry-run）會寫 ${points.length} 筆到 ${path.relative(ROOT, file)}（合計 ${out.length} 筆）`);
} else {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  writeJson(file, out, eol);
  console.log(`寫了 ${points.length} 筆到 ${path.relative(ROOT, file)}（合計 ${out.length} 筆）`);
}

if (flag('candidates')) {
  const patch = judgement.map((j) => ({ key: j.candKey ?? j.id, set: { pointId: j.id, status: 'included', reason: null }, unset: ['detailPending'] }));
  const pf = path.join(dir, 'cand-pointid.json');
  fs.writeFileSync(pf, JSON.stringify(patch, null, 1));
  const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts/candidates.mjs'), 'set', area, 'lodging', pf, ...(flag('dry-run') ? ['--dry-run'] : [])], { stdio: 'inherit' });
  if (r.status) process.exit(r.status);
}
