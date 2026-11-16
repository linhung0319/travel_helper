#!/usr/bin/env node
// 京都市巴士的班距型路線（data/timetables/urban/citybus-*.json，T87）。格式見 CONVENTIONS §3「班距型路線」、data/raw/access/kyoto.md §9。
//
// 來源：京都市交通局官網「ハイパー市バスダイヤ」（www2.city.kyoto.lg.jp/kotsu/busdia/，robots.txt 無限制；ODPT 的 GTFS 要開發者帳號，申請沒過，不用）。
//   - 系統頁 keitou/kto/<系統 5 碼>.htm：停留所和每個方向的停留所時刻表連結（連結文字是行先）。
//   - 停留所時刻表 hyperdia/<8 碼>.htm：平日、土曜、休日每小時的發車分。
// 每條路線算出：
//   - 班距：往外在第一站、往回在有時刻表的最後一站數每小時的班數，取較少的一方，60／班數（取到 0.5 分），相鄰同值的小時併成一段。
//   - 首末班：同上兩張時刻表，首班取較晚的、末班取較早的。
//   - 站間分鐘：往外方向沿路每站接力（含只拿來接力的經由站）：相鄰兩站的時刻表試每個 d（0～40），數前一站白天（10～16 時）的發車
//     有幾班在 d 分後也出現在下一站，取對上最多班 9 成以上的最小 d。白天班距很規律，只比對頭尾兩站會錯開整班（例如 18、28、38 分都對得上），
//     所以要接力。往回方向也接力一次，只用來比對（差 3 分以上寫進 notes）。
//   - 平日、土曜、休日；土曜和休日相同時 saturday 填 null。
// 停留所的中文名、座標、旁邊的車站、票價、notes 寫在下面的 STOPS、ROUTES；改了要重跑，不要手改 JSON。
// 用法：node scripts/kyoto-citybus.mjs [--only <route-id>] [--retrieved YYYY-MM-DD] [--dry-run]

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'data/timetables/urban');
export const BASE = 'https://www2.city.kyoto.lg.jp/kotsu/busdia/';

const opts = { only: null, retrieved: new Date().toISOString().slice(0, 10), dryRun: false };
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a === '--only') opts.only = process.argv[++i];
  else if (a === '--retrieved') opts.retrieved = process.argv[++i];
  else if (a === '--dry-run') opts.dryRun = true;
  else {
    console.error(`未知的參數：${a}`);
    process.exit(2);
  }
}

// ---------- 停留所 ----------
// 同一個停留所在不同系統用同一個 ID（validate 檢查名稱相同、座標 100 m 內）。座標見 COORDS_SOURCE。
// near：官方寫的「下車步行幾分」（單人分鐘，引擎乘團體係數、不再用座標估算）；只寫景點 access 裡有寫分鐘的，「下車即到」的靠座標估算就夠。
const COORDS_SOURCE = {
  type: 'other',
  url: 'https://www.google.com/maps',
  note: '停留所座標：Google Maps 的停留所標記（Claude in Chrome 少量查看）；一個停留所有好幾根站牌時取該系統經過那條路的站牌平均，取到小數 4 位',
};
const STOPS = {
  'citybus-kyoto-ekimae': { ja: '京都駅前', zh: '京都站前', coords: [135.7587, 34.9868], station: 'jr-kyoto', note: '京都站烏丸口（北側）的巴士總站，各系統的乘車處不同' },
  'citybus-hakubutsukan-sanjusangendo-mae': { ja: '博物館三十三間堂前', zh: '博物館三十三間堂前', coords: [135.7719, 34.9891], station: null },
  'citybus-gojozaka': { ja: '五条坂', zh: '五條坂', coords: [135.7765, 34.9946], station: null, note: '清水寺 步行約 10 分（上坡）', near: [{ id: 'kyoto-kiyomizudera', minutes: 10, note: '清水寺官網：市バス「五条坂」下車 步行 10 分（kyoto-kiyomizudera 的 access）' }] },
  'citybus-kiyomizu-michi': { ja: '清水道', zh: '清水道', coords: [135.777, 34.9976], station: null, note: '清水寺 步行約 10 分（上坡）；產寧坂、二寧坂從這裡上去', near: [{ id: 'kyoto-kiyomizudera', minutes: 10, note: '清水寺官網：市バス「清水道」下車 步行 10 分（kyoto-kiyomizudera 的 access）' }] },
  'citybus-gion': { ja: '祇園', zh: '祇園', coords: [135.7774, 35.0039], station: 'keihan-gion-shijo', note: '八坂神社前' },
  'citybus-higashiyama-sanjo': { ja: '東山三条（地下鉄東山駅）', zh: '東山三條（地下鐵東山站）', coords: [135.7796, 35.0095], station: 'subway-higashiyama' },
  'citybus-shichijo-omiya': { ja: '七条大宮・京都水族館前', zh: '七條大宮・京都水族館前', coords: [135.749, 34.9892], station: null },
  'citybus-nishioji-shijo': { ja: '西大路四条（阪急・嵐電西院駅）', zh: '西大路四條（阪急、嵐電西院站）', coords: [135.732, 35.0039], station: null },
  'citybus-kitano-hakubaicho': { ja: '北野白梅町', zh: '北野白梅町', coords: [135.7319, 35.027], station: 'randen-kitano-hakubaicho' },
  'citybus-kinkakuji-michi': { ja: '金閣寺道', zh: '金閣寺道', coords: [135.7337, 35.0395], station: null, note: '金閣寺 步行約 5 分', near: [{ id: 'kyoto-kinkakuji', minutes: 5, note: '「金閣寺道」下車 步行約 5 分（二手，kyoto-kinkakuji 的 access）' }] },
  'citybus-shijo-kawaramachi': { ja: '四条河原町', zh: '四條河原町', coords: [135.769, 35.0038], station: 'hankyu-kyoto-kawaramachi' },
  'citybus-kawaramachi-sanjo': { ja: '河原町三条', zh: '河原町三條', coords: [135.7689, 35.009], station: null },
  'citybus-okazaki-koen-bijutsukan': { ja: '岡崎公園 美術館・平安神宮前', zh: '岡崎公園 美術館・平安神宮前', coords: [135.7827, 35.0123], station: null, note: '平安神宮' },
  'citybus-okazaki-koen-dobutsuen': { ja: '岡崎公園 動物園前', zh: '岡崎公園 動物園前', coords: [135.7839, 35.0136], station: null, note: '京都市動物園', near: [{ id: 'kyoto-city-zoo', minutes: 2, note: '京都市動物園官網（2023 年 PDF）：「岡崎公園 動物園前」下車 步行約 2 分（kyoto-city-zoo 的 access）' }] },
  'citybus-nanzenji-eikando-michi': { ja: '南禅寺・永観堂道', zh: '南禪寺・永觀堂道', coords: [135.7905, 35.0145], station: null, note: '南禪寺 步行約 10 分', near: [{ id: 'kyoto-nanzenji', minutes: 10, note: '南禅寺官網：「南禅寺・永観堂道」下車 步行 10 分（kyoto-nanzenji 的 access）' }] },
  'citybus-ginkakuji-michi': { ja: '銀閣寺道', zh: '銀閣寺道', coords: [135.7909, 35.0277], station: null, note: '銀閣寺 步行約 10 分', near: [{ id: 'kyoto-ginkakuji', minutes: 10, note: '「銀閣寺道」下車 步行約 10 分（京都観光Navi 搜尋摘要，二手；kyoto-ginkakuji 的 access）' }] },
};

// ---------- 路線 ----------
// stops 依往外方向的停車順序：
//   { stop: 停留所 ID, out: 往外方向的時刻表（連結文字）, in: 往回方向的時刻表 } 寫進路線檔；
//   { via: 停留所名, out, in } 只用來接力算分鐘，不寫進路線檔。
//   連結文字比對時去掉空白，可以是陣列（幾張合起來，例如往回分兩種經路）；沒有時刻表的填 null。
// 只收沒有電車到的景點需要的系統（kyoto.md §9）；EX101（京都駅前 ↔ 五条坂）、105（京都駅前 ↔ 銀閣寺）只在土休日白天開，沒收。
const FARE = {
  currency: 'JPY',
  adult: {},
  child: '均一區間 120 円',
  note: '均一區間 大人 230 円（交通局 2026-11-10 更新）；觀光客較貴的「市民優先価格」官方寫令和 9 年度中（2027-04 以後）才實施',
};
const FARE_SOURCE = { type: 'official', url: 'https://www.city.kyoto.lg.jp/kotsu/page/0000240682.html', note: '市バスの運賃' };
const PASSES = { 'kintetsu-rail-pass-5day': false };
const PASS_NOTE = '地下鉄・バス 1 日券（1,100／550）可以搭（kyoto.md §10）。';

const N206 = '高野･北大路バスターミナル行き';
const N205 = '金閣寺・北大路バスターミナル行き';
const S205 = '西大路四条西大路七条京都駅行き';
const N5 = '岡崎公園平安神宮銀閣寺･岩倉行き';
const N5b = '国際会館駅･岩倉行き';
const S5 = '四条河原町四条烏丸京都駅行き';
const S5b = '三条京阪四条河原町京都駅行き';

const ROUTES = [
  {
    id: 'citybus-206',
    keito: '20600',
    name: { ja: '市バス 206 系統（京都駅前～東山三条）', zh: '市巴士 206 系統（京都站前～東山三條）' },
    stops: [
      { stop: 'citybus-kyoto-ekimae', out: '三十三間堂清水寺祇園・北大路バスターミナル行き', in: null },
      { via: '烏丸七条', out: '三十三間堂清水寺祇園・北大路バスターミナル行き', in: '京都駅･四条大宮行き' },
      { via: '七条河原町', out: '三十三間堂清水寺祇園・北大路バスターミナル行き', in: '京都駅･四条大宮行き' },
      { via: '七条京阪前', out: '三十三間堂清水寺祇園・北大路バスターミナル行き', in: '京都駅･四条大宮行き' },
      { stop: 'citybus-hakubutsukan-sanjusangendo-mae', out: '清水寺祇園・北大路バスターミナル行き', in: '京都駅･四条大宮行き' },
      { via: '東山七条', out: '清水寺祇園・北大路バスターミナル行き', in: '京都駅･四条大宮行き' },
      { via: '馬町', out: '清水寺祇園・北大路バスターミナル行き', in: '博物館三十三間堂京都駅行き' },
      { stop: 'citybus-gojozaka', out: '祇園・北大路バスターミナル行き', in: '博物館三十三間堂京都駅行き' },
      { stop: 'citybus-kiyomizu-michi', out: N206, in: '博物館三十三間堂京都駅行き' },
      { via: '東山安井', out: N206, in: '博物館三十三間堂京都駅行き' },
      { stop: 'citybus-gion', out: N206, in: '博物館三十三間堂清水寺･京都駅行き' },
      { via: '知恩院前', out: N206, in: '祇園清水寺･京都駅行き' },
      { stop: 'citybus-higashiyama-sanjo', out: N206, in: '祇園清水寺･京都駅行き' },
    ],
    notes:
      '206 系統是環狀（京都駅 → 東山通 → 北大路 → 千本通 → 京都駅，兩個方向都有），這裡只收京都駅前 ↔ 東山三条的東山通區段。' +
      '同區段還有 86、202、207 等系統，實際班次比這裡的班距多。五条坂、清水道到清水寺都是上坡。',
  },
  {
    id: 'citybus-205',
    keito: '20500',
    name: { ja: '市バス 205 系統（京都駅前～金閣寺道、西大路通経由）', zh: '市巴士 205 系統（京都站前～金閣寺道，經西大路通）' },
    stops: [
      { stop: 'citybus-kyoto-ekimae', out: N205, in: null },
      { via: '烏丸七条', out: N205, in: null },
      { via: '七条西洞院', out: N205, in: '京都駅行き' },
      { via: '七条堀川', out: N205, in: '京都駅行き' },
      { stop: 'citybus-shichijo-omiya', out: N205, in: '京都駅行き' },
      { via: '七条壬生川', out: N205, in: '京都駅行き' },
      { via: '梅小路公園・ＪＲ梅小路京都西駅前', out: N205, in: '京都駅行き' },
      { via: '七条千本', out: N205, in: '京都駅行き' },
      { via: '七条御前通', out: N205, in: '京都駅行き' },
      { via: '西大路七条', out: N205, in: '京都駅行き' },
      { via: '西大路花屋町', out: N205, in: '西大路七条京都駅行き' },
      { via: '西大路五条', out: N205, in: '西大路七条京都駅行き' },
      { via: '西大路松原', out: N205, in: '西大路七条京都駅行き' },
      { stop: 'citybus-nishioji-shijo', out: N205, in: '西大路七条京都駅行き' },
      { via: '西大路三条', out: N205, in: S205 },
      { via: '西大路御池', out: N205, in: S205 },
      { via: '太子道', out: N205, in: S205 },
      { via: '西ノ京円町（ＪＲ円町駅）', out: N205, in: S205 },
      { via: '北野中学前', out: N205, in: S205 },
      { via: '大将軍', out: N205, in: S205 },
      { stop: 'citybus-kitano-hakubaicho', out: N205, in: S205 },
      { via: '衣笠校前', out: N205, in: S205 },
      { via: 'わら天神前', out: N205, in: S205 },
      { stop: 'citybus-kinkakuji-michi', out: '北大路バスターミナル四条河原町行き', in: S205 },
    ],
    notes:
      '205 系統是環狀（京都駅 → 西大路通 → 金閣寺道 → 北大路 → 河原町通 → 京都駅，兩個方向都有），這裡只收京都駅前 ↔ 金閣寺道的西大路通區段（金閣寺比較近的那一邊）。',
  },
  {
    id: 'citybus-5',
    keito: '00500',
    name: { ja: '市バス 5 系統（京都駅前～銀閣寺道）', zh: '市巴士 5 系統（京都站前～銀閣寺道）' },
    stops: [
      { stop: 'citybus-kyoto-ekimae', out: N5, in: null },
      { via: '烏丸七条', out: N5, in: '京都駅行き' },
      { via: '烏丸五条（地下鉄五条駅）', out: N5, in: '京都駅行き' },
      { via: '烏丸松原', out: N5, in: '京都駅行き' },
      { via: '四条烏丸（地下鉄四条駅）', out: N5, in: '京都駅行き' },
      { via: '四条高倉', out: N5, in: '四条烏丸京都駅行き' },
      { stop: 'citybus-shijo-kawaramachi', out: N5, in: ['四条烏丸京都駅行き', '烏丸五条京都駅行き'] },
      { stop: 'citybus-kawaramachi-sanjo', out: N5, in: S5 },
      { via: '京都市役所前', out: N5, in: null },
      { via: '三条京阪前', out: N5, in: S5 },
      { via: '東山三条（地下鉄東山駅）', out: N5, in: S5 },
      { via: '神宮道', out: N5, in: S5 },
      { stop: 'citybus-okazaki-koen-bijutsukan', out: '銀閣寺･岩倉行き', in: S5 },
      { stop: 'citybus-okazaki-koen-dobutsuen', out: '銀閣寺･岩倉行き', in: S5 },
      { via: '岡崎法勝寺町', out: N5b, in: S5 },
      { stop: 'citybus-nanzenji-eikando-michi', out: N5b, in: S5b },
      { via: '東天王町', out: N5b, in: S5b },
      { via: '真如堂前', out: N5b, in: S5b },
      { via: '錦林車庫前', out: N5b, in: S5b },
      { via: '浄土寺', out: N5b, in: S5b },
      { stop: 'citybus-ginkakuji-michi', out: N5b, in: S5b },
    ],
    notes: '京都駅前 ↔ 四条河原町有兩種經路（四条烏丸經由、五条通經由），四条河原町以北相同。',
  },
];

// ---------- 抓網頁（快取在暫存目錄，每頁間隔 1.5 秒） ----------
const cacheDir = path.join(os.tmpdir(), 'travel_helper-kyoto-citybus-cache');
let last = 0;
async function get(rel) {
  const file = path.join(cacheDir, rel.replace(/\//g, '_'));
  if (fs.existsSync(file)) return fs.readFileSync(file, 'utf8');
  const wait = last + 1500 - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  last = Date.now();
  const res = await fetch(BASE + rel, { headers: { 'User-Agent': 'Mozilla/5.0 (travel_helper personal trip planning)' } });
  if (!res.ok) throw new Error(`${res.status} ${BASE + rel}`);
  const text = await res.text();
  fs.mkdirSync(cacheDir, { recursive: true });
  fs.writeFileSync(file, text);
  return text;
}

const squash = (s) => s.replace(/[\s　]+/g, '');
const decode = (s) => s.replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ');

/** 系統頁 → [{ name, links: [{ code, label }] }]（頁面的順序，不一定是停車順） */
export function parseKeito(html) {
  return html
    .split('keito-stop-name')
    .slice(1)
    .map((p) => ({
      name: decode(p.match(/^[^>]*>([^<]+)</)[1].trim()),
      links: [...p.matchAll(/hyperdia\/(\d+)\.htm" class="list-group-item">([^<]+)</g)].map((m) => ({ code: m[1], label: squash(decode(m[2])) })),
    }));
}

const DAY_CLASS = { wek: 'weekday', sat: 'saturday', hol: 'holiday' };
/** 停留所時刻表 → { days: { weekday: [{ t, mark }], saturday, holiday }, validFrom, footnotes } */
export function parseTimetable(html) {
  const days = { weekday: [], saturday: [], holiday: [] };
  for (const m of html.matchAll(/<td class="tt-time (wek|sat|hol)">\s*<h3[^>]*id="[hdk](\d+)"[^>]*>[^<]*<\/h3>([^<]*)<\/td>/g)) {
    const h = Number(m[2]);
    for (const tok of m[3].trim().split(/\s+/).filter(Boolean)) {
      // 記號（*、△、⚡ 等）寫在分鐘前面；括號（例如 (20)）是另一種行先或經路，記成 '()'
      const t = tok.match(/^(\D*?)(\()?(\d{1,2})\)?$/);
      if (!t) throw new Error(`讀不懂的時刻：${tok}`);
      days[DAY_CLASS[m[1]]].push({ t: h * 60 + Number(t[3]), mark: t[1] + (t[2] ? '()' : '') });
    }
  }
  for (const d of Object.values(days)) d.sort((a, b) => a.t - b.t);
  const v = html.match(/令和(\d+)年(\d+)月(\d+)日実施/);
  const validFrom = v ? `${2018 + Number(v[1])}-${v[2].padStart(2, '0')}-${v[3].padStart(2, '0')}` : null;
  const text = decode(html.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ');
  const footnotes = [...text.matchAll(/((?:\( \)|[^\s()]{1,2})印は[^。]+。)/g)].map((x) => x[1]);
  return { days, validFrom, footnotes };
}

const hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

function bands(outDeps, inDeps) {
  const perHour = (deps) => {
    const m = new Map();
    for (const d of deps) m.set(Math.floor(d.t / 60), (m.get(Math.floor(d.t / 60)) ?? 0) + 1);
    return m;
  };
  const a = perHour(outDeps);
  const b = perHour(inDeps);
  const hours = [...new Set([...a.keys(), ...b.keys()])].sort((x, y) => x - y);
  const out = [];
  for (const h of hours) {
    const n = Math.min(a.get(h) ?? 0, b.get(h) ?? 0);
    if (!n) continue;
    const min = Math.round((60 / n) * 2) / 2;
    const prev = out.at(-1);
    if (prev && prev.min === min && prev.toH === h) prev.toH = h + 1;
    else out.push({ fromH: h, toH: h + 1, min });
  }
  return out.map((x) => ({ from: hhmm(x.fromH * 60), to: hhmm(x.toH * 60), min: x.min }));
}

/** 前一站 a → 下一站 b 的車上分鐘：0～40 分之間，白天（10～16 時）對上最多班的 9 成以上、最小的 d；對不上回 null */
export function hop(a, b) {
  const setB = new Set(b.map((x) => x.t));
  const dayA = a.filter((x) => x.t >= 600 && x.t < 960);
  const scores = [];
  for (let d = 0; d <= 40; d++) scores.push({ d, score: dayA.filter((x) => setB.has(x.t + d)).length });
  const max = Math.max(...scores.map((s) => s.score));
  if (!dayA.length || max < dayA.length * 0.3) return null; // 分岔時只有一部分班次經過下一站，3 成以上才算
  const pick = scores.find((s) => s.score >= max * 0.9);
  return { ...pick, n: dayA.length };
}

/** 接力：dir 是 'out' 或 'in'，entries 照該方向的行車順序；每站寫入 e[dir + 'Min']（從第一張有時刻表的站起算） */
function chain(entries, dir, label) {
  const steps = [];
  let acc = 0;
  let prev = null;
  for (const e of entries) {
    const tt = e[dir + 'TT'];
    if (!tt) continue;
    if (prev) {
      const h = hop(prev.tt.days.weekday, tt.days.weekday);
      if (!h) throw new Error(`${label}：${prev.name} → ${e.name} 對不上（看一下停車順序和連結文字）`);
      acc += h.d;
      steps.push(`${prev.name}→${e.name} ${h.d}（${h.score}/${h.n}）`);
    }
    e[dir + 'Min'] = acc;
    prev = { tt, name: e.name };
  }
  return steps;
}

// ---------- 主程式 ----------
const report = [];
let missingCoords = false;
for (const route of ROUTES) {
  if (opts.only && route.id !== opts.only) continue;
  const keitoRel = `keitou/kto/${route.keito}.htm`;
  const keito = parseKeito(await get(keitoRel));
  const used = [];
  const load = async (name, labels) => {
    if (labels == null) return null;
    const entry = keito.find((k) => squash(k.name) === squash(name));
    if (!entry) throw new Error(`${route.id}：系統頁沒有停留所 ${name}`);
    const tts = [];
    for (const label of [labels].flat()) {
      const l = entry.links.find((x) => x.label === squash(label));
      if (!l) throw new Error(`${route.id}：${name} 沒有「${label}」的時刻表（有：${entry.links.map((x) => x.label).join('、')}）`);
      const rel = `hyperdia/${l.code}.htm`;
      tts.push(parseTimetable(await get(rel)));
      used.push({ rel, name, label });
    }
    const days = {};
    for (const k of ['weekday', 'saturday', 'holiday']) days[k] = tts.flatMap((t) => t.days[k]).sort((x, y) => x.t - y.t);
    return { days, validFrom: tts[0].validFrom, footnotes: tts.flatMap((t) => t.footnotes) };
  };
  const entries = [];
  for (const s of route.stops) {
    const name = s.stop ? STOPS[s.stop].ja : s.via;
    entries.push({ ...s, name, outTT: await load(name, s.out), inTT: await load(name, s.in) });
  }
  const tts = entries.flatMap((e) => [e.outTT, e.inTT]).filter(Boolean);
  const validFroms = new Set(tts.map((t) => t.validFrom));
  if (validFroms.size !== 1) throw new Error(`${route.id}：時刻表的実施日不一致：${[...validFroms].join('、')}`);

  // 站間分鐘：往外接力；往回反過來接力，只用來比對
  const outSteps = chain(entries, 'out', `${route.id} 往外`);
  const inSteps = chain([...entries].reverse(), 'in', `${route.id} 往回`);
  const main = entries.filter((e) => e.stop);
  for (const e of main) if (e.outMin == null) throw new Error(`${route.id}：${e.name} 要有往外的時刻表才能算分鐘`);
  const lastMain = main.at(-1);
  const backDiffs = [];
  for (const e of main) {
    if (e === lastMain || e.inMin == null || lastMain.inMin == null) continue;
    const back = e.inMin - lastMain.inMin;
    const fwd = lastMain.outMin - e.outMin;
    if (Math.abs(back - fwd) >= 3) backDiffs.push(`${lastMain.name} → ${e.name} 往回 ${back} 分（往外 ${fwd} 分）`);
  }

  // 班距、首末班：往外數第一站，往回數有時刻表的最後一站
  const outCount = main[0];
  const inCount = [...main].reverse().find((e) => e.inTT);
  const service = {};
  for (const key of ['weekday', 'saturday', 'holiday']) {
    const out = outCount.outTT.days[key];
    const inn = inCount.inTT.days[key];
    if (!out.length || !inn.length) throw new Error(`${route.id} ${key}：計數站沒有車（out ${out.length}、in ${inn.length}）`);
    service[key] = {
      first: [hhmm(out[0].t), hhmm(inn[0].t)].sort().at(-1),
      last: [hhmm(out.at(-1).t), hhmm(inn.at(-1).t)].sort()[0],
      headway: bands(out, inn),
      note:
        `數${outCount.name}（往外）、${inCount.name}（往回）兩張停留所時刻表：` +
        `往外 ${out.length} 班（首 ${hhmm(out[0].t)}、末 ${hhmm(out.at(-1).t)}）、往回 ${inn.length} 班（首 ${hhmm(inn[0].t)}、末 ${hhmm(inn.at(-1).t)}）`,
    };
  }
  const same = (a, b) => JSON.stringify({ ...a, note: null }) === JSON.stringify({ ...b, note: null });
  if (same(service.saturday, service.holiday)) service.saturday = null;

  const stops = main.map((e) => {
    const s = STOPS[e.stop];
    if (!s.coords) missingCoords = true;
    return { id: e.stop, name: { ja: s.ja, zh: s.zh }, coords: s.coords ?? [0, 0], station: s.station ?? null, ...(s.near ? { near: s.near } : {}), min: e.outMin, note: s.note ?? null };
  });
  const notes = [route.notes, PASS_NOTE, backDiffs.length ? `往回的車上分鐘和往外差 3 分以上：${backDiffs.join('；')}。` : null]
    .filter(Boolean)
    .join('');
  const keitoNo = String(Number(route.keito.slice(0, 3)));
  const sources = [
    { type: 'official', url: BASE + keitoRel, retrieved: opts.retrieved, note: `京都市交通局 ハイパー市バスダイヤ ${keitoNo} 系統的停車停留所（${[...validFroms][0]} 実施）` },
    ...used.map((u) => ({ type: 'official', url: BASE + u.rel, retrieved: opts.retrieved, note: `停留所時刻表：${u.name} 發 ${u.label}` })),
    { ...FARE_SOURCE, retrieved: opts.retrieved },
    { ...COORDS_SOURCE, retrieved: opts.retrieved },
  ];
  const doc = {
    id: route.id,
    mode: 'bus',
    operator: '京都市交通局',
    name: route.name,
    serviceType: null,
    stops,
    loop: false,
    loopMin: null,
    service,
    fares: FARE,
    passes: PASSES,
    notes,
    validFrom: [...validFroms][0],
    retrieved: opts.retrieved,
    sources,
  };
  const fn = [...new Set(tts.flatMap((t) => t.footnotes))];
  const fmt = (d) => `${d.first}～${d.last} ` + d.headway.map((h) => `${h.from}-${h.to}/${h.min}`).join(' ');
  report.push(
    `${route.id}：${stops.map((s) => `${s.name.ja} ${s.min}`).join('、')}\n` +
      `  往外：${outSteps.join('；')}\n` +
      `  往回：${inSteps.join('；')}\n` +
      (backDiffs.length ? `  ⚠ ${backDiffs.join('；')}\n` : '') +
      `  平日 ${fmt(service.weekday)}\n` +
      (service.saturday ? `  土曜 ${fmt(service.saturday)}\n` : '  土曜＝休日\n') +
      `  休日 ${fmt(service.holiday)}\n` +
      (fn.length ? `  註記：${fn.join(' ')}` : ''),
  );
  if (!opts.dryRun) fs.writeFileSync(path.join(OUT, `${route.id}.json`), JSON.stringify(doc, null, 2) + '\n');
}
console.log(report.join('\n'));
if (missingCoords) console.log('⚠ 有停留所還沒有座標（STOPS 的 coords），寫出的是 [0, 0]');
if (!opts.dryRun) console.log('寫入 data/timetables/urban/');
