#!/usr/bin/env node
// T7b：鳥羽資料的欄位搬移（新 schema）與候選清單轉換。
//
// 用法：node scripts/migrate-toba-t7b.mjs [--dry-run] [--report]
//   --dry-run  只檢查、不寫檔
//   --report   印出「轉不了、留原樣」的清單（Markdown，貼進 data/raw/toba/log/T7b.md）
//
// 可以重跑：輸入一律從 BASE commit（T7b 開工時的 master）讀，不讀工作目錄裡已經搬過的檔案，
// 所以重跑的結果相同。舊筆記 restaurants.md 刪掉之後也一樣從 BASE 讀。
// 寫出的檔案：
//   data/areas/toba/{spots,lodging,restaurants}.json
//   data/raw/toba/candidates/{spots,lodging,restaurants}.json
//
// ─── 轉換規則 ────────────────────────────────────────────────────────────────
// 原則：只轉來源寫明的資訊；文字太模糊、轉不了的留原樣（欄位填 null 或維持舊值），記進 unconverted，
// 由 --report 列出。
//
// 共同
//   region：子地區 ID（data/areas.json 的 toba.regions）。
//     餐廳：extra.region 的地區名（T4a 候選表的地區）照 REGION_BY_LABEL 對到 ID。
//     景點、住宿：舊資料沒有地區欄位，照地址的町名判斷（regionByAddress，規則同 T4a「地區：依地址判斷」
//     和 areas.json 各 region 的 note）；地址判斷不了或 areas.json 有明寫的（パールロード沿線的展望台）
//     用 REGION_OVERRIDE。
//   closures：只轉來源寫明月日的休業。每年固定的休業（例如 12/30～1/5）只轉旅程前後那一次
//     （2026-12～2027-01），年份是依「每年」推得的，note 寫明；只有部分設施停用（露天風呂、海豚島）
//     的不轉（程式會誤判整個地點休業）。沒有可轉的填 []。
//   hours.always：hours.note、closedNote 寫「全天開放」「隨時可參拜」「24 小時」「自由參觀」
//     「無開放時間限制」的戶外景點（ALWAYS_SPOTS）。這時刪掉各天的 00:00～24:00。
//   hours.lastEntry：hours.note 裡只有一個「最後入館／L.O.」時間、而且適用於 2 月的才轉。
//     午餐、晚餐各有 L.O. 的店（schema 只能放一個）不轉，留在 note。
//   tags：景點、住宿改成 CONVENTIONS §5.3 的固定清單（TAG_MAP）。子地區、描述用的自由文字拿掉
//     （清單印在 --report）。不從其他欄位推導新標籤（例如 indoor → 室內），留給 T7c、T7d。
//   extra：搬到正式欄位的鍵刪掉，其他（conflicts、inclusion、parking…）照舊。
//
// 景點
//   extra.phone → phone。
//
// 住宿
//   extra.checkIn／checkOut → checkIn／checkOut：取開頭的 HH:MM；括號裡的補充（最晚入住、延後退房）
//     留在 extra.checkInNote／checkOutNote。兩個來源不同、開頭不是單一時間的不轉（留在 extra.checkIn）。
//   dinnerAccess：meals 是 none／breakfast 的，照 T4c 缺漏檢查（restaurant-gaps.mjs）的結論
//     DINNER_ACCESS：20 分內有晚上營業的店 → walk，沒有 → car。dinner+breakfast → null。
//     varies（有素泊方案）T4c 沒有檢查，填 null 並列進 report。
//
// 餐廳
//   extra.tabelogOwner → tabelogOwner；extra.googleName → googleName；
//   extra.barrierFree → accessibility.barrierFree。
//   group.maxReservation：group.source 裡寫「最大予約可能人数 … N 人」的才填 N，其他 null
//     （「貸切可（20人～50人）」不是最大予約人數，不轉）。
//   cuisine：CUISINE_MAP 把舊的自由文字對到 §5.3 的固定清單；「海鮮」「日本酒」這類籠統的詞
//     在有其他種類時省略（null）。一個都對不到的留原樣，列進 report。
//   price（每人，円）：從 priceRange 轉。
//     「晚 A～B；午 C～D」→ dinner、lunch 各自；「～¥999」→ [0, 999]；「¥X 起」→ [X, null]；
//     「吃到飽 大人 ¥X」→ [X, X]（大人價）。
//     只有一個區間時（食べログ的預算沒寫是晚上還是中午）：contexts 有 lunch／cafe／snack、沒有 dinner
//     → lunch；只有 dinner → dinner；兩個都有 → 判斷不了，不轉。
//   kids：舊的字串改成物件 { allowed, minAge, kidsMenu, note }，note 放原文。
//     「可帶小孩」或有寫小孩價 → allowed: yes；「有兒童餐／兒童套餐」→ kidsMenu: true，其他 null；
//     年齡限制、看不出來的用 KIDS_OVERRIDE。舊值 null 的維持 null。
//   seating：舊的 other 用來表示沙發座（T4b），extra.seatingNote 寫「沙發」的改成／加上 sofa。
//   notes 裡指到舊筆記「（見 restaurants.md）」的改成 log/T4b.md（舊筆記 T7b 刪掉了）。
//   access：照 T4c 的分類（restaurants.md「需搭車的店」）：浦村、國崎・パールロード、外圍 → car；
//     離島 → ferry；鳥羽站周邊、中之郷、相差 → walk（從 anchors 走得到）。
//
// 候選清單
//   candidates/restaurants.json：BASE 的 restaurants.md「候選表」205 列。
//     key：已納入的用 pointId（用食べログ網址對到 restaurants.json）；其他用 tabelog-<店家 ID>，
//     沒有食べログ頁面的用 NO_TABELOG_KEYS。
//     status：A～F → included、未納入 → not-included、排除 → excluded、同類型上限 → over-limit。
//     criteria：納入欄的字母；F 依備註分成 F1（浦村牡蠣聚落）、F2（體驗型）；D 依備註分成
//     D1（地區保底）、D2（晚餐缺口）。同類型上限的 5 家 T4a 寫明「都只靠 B」→ ["B"]。
//     mentions：已納入的店取 restaurants.json sources 裡的推薦文章（ARTICLES），
//     未納入的只有 T4a 寫明是哪一篇的才填（觀光協會只算浦村牡蠣特集；中文部落格、觀光三重報導有列店名的）；
//     只知道來源種類、不知道是哪一篇的寫在 note。
//   candidates/spots.json、lodging.json：已收錄的從資料檔產生（status: included）；
//     被排除、沒收錄的照 BASE 的 spots.md、lodging.md 抄進 SPOT_CANDIDATES、LODGING_CANDIDATES。

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'd7e6c6f'; // T7b 開工時的 master
const RETRIEVED = '2026-10-17'; // T2～T4 的取得日期
const args = process.argv.slice(2);
const DRY = args.includes('--dry-run');
const REPORT = args.includes('--report');

const gitShow = (p) => execFileSync('git', ['show', `${BASE}:${p}`], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 << 20 });
const readBase = (p) => JSON.parse(gitShow(p).replace(/^﻿/, ''));
const areas = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/areas.json'), 'utf8'));
const REGION_IDS = new Set(areas.find((a) => a.id === 'toba').regions.map((r) => r.id));

const unconverted = []; // { field, id, value, why }
const skip = (field, id, value, why) => unconverted.push({ field, id, value, why });
const removedTags = []; // { id, tags }

// 依序重建物件，把 key 插在 after 後面（after 不存在就放最後）
function withKey(obj, after, key, value) {
  const out = {};
  let placed = false;
  for (const [k, v] of Object.entries(obj)) {
    if (k === key) continue;
    out[k] = v;
    if (k === after) {
      out[key] = value;
      placed = true;
    }
  }
  if (!placed) out[key] = value;
  return out;
}

// ─── 子地區 ──────────────────────────────────────────────────────────────────
const REGION_BY_LABEL = {
  鳥羽站周邊: 'toba-station',
  '鳥羽站周邊（外圍・需車）': 'toba-outskirts',
  中之郷: 'nakanogo',
  浦村: 'uramura',
  相差: 'osatsu',
  '國崎・パールロード': 'kuzaki',
  '離島（答志島）': 'toshijima',
  '離島（菅島）': 'sugashima',
  '離島（神島）': 'kamishima',
};
// areas.json：toba-station＝鳥羽 1～3 丁目、小浜；nakanogo＝鳥羽 4～5 丁目；
// toba-outskirts＝安楽島、大明、船津、河内、松尾、堅神；osatsu＝相差、畔蛸；kuzaki＝國崎、石鏡
function regionByAddress(addr) {
  if (!addr) return null;
  const a = addr.replace(/[一]丁目/, '1丁目');
  if (/鳥羽市鳥羽([123])(丁目|-|－)/.test(a) || /鳥羽市鳥羽一丁目/.test(addr)) return 'toba-station';
  if (/鳥羽市鳥羽[45](丁目|-|－)/.test(a)) return 'nakanogo';
  if (/小浜町/.test(a)) return 'toba-station';
  if (/(安楽島|大明|船津|河内|松尾|堅神)町/.test(a)) return 'toba-outskirts';
  if (/浦村町/.test(a)) return 'uramura';
  if (/(相差|畔蛸)町/.test(a)) return 'osatsu';
  if (/(国崎|石鏡)町/.test(a)) return 'kuzaki';
  if (/答志町/.test(a)) return 'toshijima';
  if (/菅島町/.test(a)) return 'sugashima';
  if (/神島町/.test(a)) return 'kamishima';
  return null;
}
const REGION_OVERRIDE = {
  // areas.json kuzaki 的 note：「パールロード沿線的展望台」（地址是畔蛸町或沒有番地）
  'toba-harusame-observatory': 'kuzaki',
  'toba-omoshiro-observatory': 'kuzaki',
};

// ─── 標籤（§5.3 固定清單）─────────────────────────────────────────────────────
const FIXED_TAGS = ['室內', '雨天備案', '親子', '長輩友善', '長階梯', '展望', '神社寺院', '海邊', '體驗', '溫泉', '包棟', '無障礙'];
const TAG_MAP = {
  室內: '室內',
  室內為主: '室內',
  雨天備案: '雨天備案',
  親子: '親子',
  長輩友善: '長輩友善',
  階梯多: '長階梯',
  展望台: '展望',
  展望: '展望',
  展望室: '展望',
  絕景: '展望',
  神社: '神社寺院',
  寺院: '神社寺院',
  海灘: '海邊',
  海岸: '海邊',
  海岬: '海邊',
  私人海灘: '海邊',
  體驗: '體驗',
  釣魚體驗: '體驗',
  溫泉: '溫泉',
  自家源泉: '溫泉',
  包棟: '包棟',
  無障礙: '無障礙',
  無障礙房: '無障礙',
  無障礙客室: '無障礙',
};
function mapTags(p) {
  const out = [];
  const dropped = [];
  for (const t of p.tags ?? []) {
    const m = TAG_MAP[t];
    if (m && !out.includes(m)) out.push(m);
    else if (!m) dropped.push(t);
  }
  if (dropped.length) removedTags.push({ id: p.id, tags: dropped });
  return FIXED_TAGS.filter((t) => out.includes(t));
}

// ─── 營業時間 ────────────────────────────────────────────────────────────────
const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun', 'holiday'];
// 戶外、全天開放的景點：依據的原文
const ALWAYS_SPOTS = {
  'toba-castle-ruins': 'hours.note「全天開放（終日開放）」',
  'toba-osatsu-ishigami': 'hours.note「參拜隨時都可以」（官方 FAQ）',
  'toba-yoroizaki-lighthouse': 'closedNote「戶外自由參觀」',
  'toba-harusame-observatory': 'closedNote「戶外展望台，自由參觀」',
  'toba-omoshiro-observatory': 'closedNote「OSM 標示 24 小時」',
  'toba-toshijima-wagu': 'closedNote「戶外史跡，無開放時間限制」',
  'toba-toshijima-toshi': 'closedNote「戶外自由參觀」',
};
// 只有一個最後入館／L.O.、而且適用於 2 月的
const LAST_ENTRY = {
  'toba-aquarium': '16:00', // 通常期最後入館 16:00；2 月為通常期
  'toba-edogawa-rampo-museum': '15:00', // 官網：最後入館 15:00
  'toba-kadoya': '15:45', // 最後入館 15:45
  'toba-sea-folk-museum': '16:00', // 2 月最後入館 16:00
  'toba-amagoya-chisato': '16:30',
  'toba-yakigai-iroha': '18:00',
  'toba-maruhachi-shokudo': '20:00',
  'toba-mondomisaki': '20:30',
  'toba-the-kaiya': '16:30',
  'toba-nagatokan': '20:00', // 食べログ L.O. 20:00（官網 17～21 時）
  'toba-kairakuen': '13:00',
  'toba-cafeterrace-orange': '21:00',
  'toba-amanoie-gozaya': '16:30',
  'toba-chiso': '21:30',
};
// hours.note 有寫 L.O.／最後入館、但不轉的原因
const LAST_ENTRY_SKIP = {
  'toba-observatory-pearl-road': '咖啡「打烊前 30 分」L.O.，週二可能提早到 15:30',
  'toba-sazanami': '午、晚各一個 L.O.（14:30、18:30）',
  'toba-seahorse': '早、午、晚各一個 L.O.',
  'toba-tenbinya-honten': '午、晚各一個 L.O.，週六不同',
  'toba-amiyaki-tenbinya': '午、晚各一個 L.O.（14:00、21:00）',
  'toba-niku-matsumura': '午、晚各一個 L.O.（14:00、20:00）',
  'toba-kikuya': '午、晚各一個最後入店（13:00、19:00）',
  'toba-dining-shiraishi': '早餐、晚餐各一個 L.O.',
  'toba-the-lobby-lounge': '午餐、酒吧各一個 L.O.',
  'toba-hakkai': '「10:00～16:00（L.O.）」：打烊時間就是 L.O.，和 hours 的關係不明',
  'toba-kagetsu': '「官網時間是 L.O.」：午、晚兩段都是 L.O.',
};
const CLOSURES = {
  'toba-marche': [{ from: '2026-12-31', to: '2027-01-03', note: '年末年始公休（每年 12/31～1/3）' }],
  'toba-kadoya': [{ from: '2026-12-29', to: '2027-01-03', note: '年末年始休館（每年 12/29～1/3）' }],
  'toba-sea-folk-museum': [{ from: '2026-12-26', to: '2026-12-30', note: '休館日（每年 12/26～12/30；另有 6/26～6/30）' }],
  'toba-hachiman-kamado': [{ from: '2026-12-30', to: '2027-01-05', note: '休業（每年 12/30～12/31、1/1～1/5；另有 8/13～8/15、不定休）' }],
};
const CLOSURE_SKIP = {
  'toba-bay-cruise-irukajima': '海豚島 2026-12-14～12-28 休園，但遊覽船照常（部分休業）；1～2 月的停航檢修只有第三方資料、沒有日期',
  'toba-mikimoto-pearl-island': '「每年 12 月第 2 個星期二起 3 天」：沒有寫日期',
  'toba-toshijima-nakamuraya': '露天風呂 1/10 或 1/11～3/17 或 3/18 停用（部分設施，來源有兩種寫法）',
  'toba-ocean-resort': '女湯露天 2026-12-09～11 整修（部分設施）',
  'toba-seaside-hotel': '露天「風見の湯」11～12 月整修（部分設施，沒有寫日）',
  'toba-osatsu-michishio': '休館日多在週三，2027 年 2 月的還沒公布',
  'toba-kamishima-sankaiso': '只接週五～週一晚上的住宿（2023 年採訪，不是日期）',
};

function migrateHours(p) {
  let h = p.hours;
  if (ALWAYS_SPOTS[p.id]) {
    h = { always: true, note: h?.note ?? null };
  }
  if (LAST_ENTRY[p.id]) {
    if (!h) throw new Error(`${p.id}: lastEntry 但 hours 是 null`);
    h = withKey(h, 'note', 'lastEntry', LAST_ENTRY[p.id]);
  } else if (LAST_ENTRY_SKIP[p.id]) {
    skip('hours.lastEntry', p.id, p.hours?.note, LAST_ENTRY_SKIP[p.id]);
  }
  return h;
}
function migrateClosures(p) {
  if (CLOSURE_SKIP[p.id]) skip('closures', p.id, null, CLOSURE_SKIP[p.id]);
  return CLOSURES[p.id] ?? [];
}

// 共同欄位：region、hours、closures、tags
function migrateCommon(p, region) {
  let q = { ...p };
  q = withKey(q, 'area', 'region', region);
  q.hours = migrateHours(p);
  q = withKey(q, 'febNote', 'closures', migrateClosures(p));
  return q;
}

function pointRegion(p) {
  const r = REGION_OVERRIDE[p.id] ?? regionByAddress(p.address);
  if (!r) throw new Error(`${p.id}: 地址判斷不了子地區：${p.address}`);
  return r;
}

// ─── 景點 ────────────────────────────────────────────────────────────────────
function migrateSpot(p) {
  let q = migrateCommon(p, pointRegion(p));
  q.tags = mapTags(p);
  const { phone, ...extra } = p.extra ?? {};
  q = withKey(q, 'admission', 'phone', phone ?? null);
  q.extra = extra;
  return q;
}

// ─── 住宿 ────────────────────────────────────────────────────────────────────
// T4c 缺漏檢查「不含晚餐住宿的晚餐」的結論
const DINNER_ACCESS = {
  'toba-lido-porte': 'walk', // オレンジ 3 分、錦屋 4 分，20 分內 17 家
  'toba-mfr-iseshima': 'walk', // 海太郎 18 分（到 20:00），勉強
  'toba-ryokan-naomi': 'car', // 20 分內沒有（一栄 21 分）
  'toba-anchor-ajito': 'car', // 最近的晚餐店直線 2 km 以上
  'toba-higashinomado': 'car', // 只有國崎かどや（走 64 分）
};
const TIME_HEAD = /^(\d{1,2}:\d{2})(.*)$/;
function splitTime(s) {
  if (s == null) return { time: null, note: null };
  const m = String(s).match(TIME_HEAD);
  if (!m) return null;
  const rest = m[2].trim();
  // 「14:30（楽天，最晚 15:00）／15:00（じゃらん）」這種有兩個來源的不轉
  if (/／/.test(rest)) return null;
  return { time: m[1].padStart(5, '0'), note: rest ? `${m[1]}${m[2]}` : null };
}
function migrateLodging(p) {
  let q = migrateCommon(p, pointRegion(p));
  q.tags = mapTags(p);
  const { checkIn, checkOut, ...extra } = p.extra ?? {};
  const ci = splitTime(checkIn);
  const co = splitTime(checkOut);
  if (ci) {
    if (ci.note) extra.checkInNote = ci.note;
  } else {
    extra.checkIn = checkIn;
    skip('checkIn', p.id, checkIn, '兩個來源的時間不同');
  }
  if (co) {
    if (co.note) extra.checkOutNote = co.note;
  } else {
    extra.checkOut = checkOut;
    skip('checkOut', p.id, checkOut, '開頭不是單一時間');
  }
  q = withKey(q, 'luggage', 'checkIn', ci ? ci.time : null);
  q = withKey(q, 'checkIn', 'checkOut', co ? co.time : null);
  let da = null;
  if (p.meals === 'none' || p.meals === 'breakfast') {
    da = DINNER_ACCESS[p.id];
    if (!da) throw new Error(`${p.id}: 不含晚餐但 T4c 沒有結論`);
  } else if (p.meals === 'varies') {
    skip('dinnerAccess', p.id, 'meals: varies', 'T4c 只檢查 meals 是 none／breakfast 的住宿');
  }
  q = withKey(q, 'checkOut', 'dinnerAccess', da);
  q.extra = extra;
  return q;
}

// ─── 餐廳 ────────────────────────────────────────────────────────────────────
const CUISINE_FIXED = ['海鮮丼', '壽司', '浜焼き・貝', '牡蠣', '伊勢海老・高級海鮮', '定食・食堂', '和食・割烹', '烏龍麵・蕎麥', '燒肉・肉料理', '洋食・義式', '咖啡・甜點', '居酒屋', '其他'];
// null：籠統的詞，有其他種類時省略
const CUISINE_MAP = {
  海鮮: null,
  日本酒: null,
  海鮮丼: '海鮮丼',
  壽司: '壽司',
  浜焼: '浜焼き・貝',
  浜燒: '浜焼き・貝',
  烤貝: '浜焼き・貝',
  烤蠑螺: '浜焼き・貝',
  '烤蠑螺（さざえ）': '浜焼き・貝',
  網燒: '浜焼き・貝',
  爐端燒: '浜焼き・貝',
  BBQ: '浜焼き・貝',
  海女料理: '浜焼き・貝',
  牡蠣: '牡蠣',
  牡蠣吃到飽: '牡蠣',
  烤牡蠣: '牡蠣',
  炸牡蠣: '牡蠣',
  伊勢龍蝦: '伊勢海老・高級海鮮',
  '伊勢龍蝦（伊勢海老）': '伊勢海老・高級海鮮',
  鮑魚: '伊勢海老・高級海鮮',
  海鮮蒸料理: '伊勢海老・高級海鮮',
  食堂: '定食・食堂',
  丼飯: '定食・食堂',
  日本料理: '和食・割烹',
  料亭: '和食・割烹',
  季節料理: '和食・割烹',
  鄉土料理: '和食・割烹',
  天婦羅: '和食・割烹',
  '烏龍麵（伊勢うどん）': '烏龍麵・蕎麥',
  蕎麥麵: '烏龍麵・蕎麥',
  燒肉: '燒肉・肉料理',
  牛肉料理: '燒肉・肉料理',
  涮涮鍋: '燒肉・肉料理',
  法式料理: '洋食・義式',
  西餐: '洋食・義式',
  咖哩: '洋食・義式',
  義大利菜: '洋食・義式',
  義大利麵: '洋食・義式',
  披薩: '洋食・義式',
  洋食: '洋食・義式',
  漢堡: '洋食・義式',
  '漢堡（とばーがー）': '洋食・義式',
  咖啡: '咖啡・甜點',
  喫茶: '咖啡・甜點',
  蛋糕: '咖啡・甜點',
  起司蛋糕: '咖啡・甜點',
  麵包: '咖啡・甜點',
  '義式冰淇淋（ジェラート）': '咖啡・甜點',
  刨冰: '咖啡・甜點',
  霜淇淋: '咖啡・甜點',
  'Afternoon tea': '咖啡・甜點',
  居酒屋: '居酒屋',
  鰻魚: '其他',
  屋形船: '其他',
};
// 對不到固定清單、也不是籠統詞的（例如「炸物」「麵類」）：省略並列進 report
function mapCuisine(r) {
  const out = [];
  const unknown = [];
  for (const c of r.cuisine ?? []) {
    if (!(c in CUISINE_MAP)) unknown.push(c);
    else if (CUISINE_MAP[c] && !out.includes(CUISINE_MAP[c])) out.push(CUISINE_MAP[c]);
  }
  if (!out.length) {
    skip('cuisine', r.id, JSON.stringify(r.cuisine), '只有籠統的「海鮮」或對不到固定清單');
    return r.cuisine;
  }
  if (unknown.length) skip('cuisine', r.id, unknown.join('、'), '對不到固定清單，省略（其他詞已轉）');
  return CUISINE_FIXED.filter((c) => out.includes(c));
}

const num = (s) => Number(s.replace(/,/g, ''));
const RANGE = /¥?([\d,]+)\s*～\s*¥?([\d,]+)/;
function parseRange(s) {
  let m = s.match(/^～\s*¥([\d,]+)/);
  if (m) return [0, num(m[1])];
  m = s.match(RANGE);
  if (m) return [num(m[1]), num(m[2])];
  return null;
}
const PRICE_OVERRIDE = {
  // 「午、晚餐都 ¥6,500 起（食べログ）」
  'toba-niku-matsumura': { lunch: [6500, null], dinner: [6500, null] },
};
function migratePrice(r) {
  if (PRICE_OVERRIDE[r.id]) return PRICE_OVERRIDE[r.id];
  const s = r.priceRange;
  if (s == null) return null;
  let m = s.match(/^晚(?:餐)?\s*(.+?)；午(?:餐)?\s*(.+)$/);
  if (m) {
    const dinner = parseRange(m[1]);
    const lunch = parseRange(m[2]);
    if (dinner && lunch) return { lunch, dinner };
  }
  m = s.match(/^吃到飽 大人 ¥([\d,]+)/);
  if (m && !r.contexts.includes('dinner')) return { lunch: [num(m[1]), num(m[1])], dinner: null };
  const range = /^(～\s*)?¥/.test(s) ? parseRange(s) : null;
  if (!range) {
    skip('price', r.id, s, '格式不是食べログ的預算區間');
    return null;
  }
  const ctx = r.contexts ?? [];
  const day = ctx.some((c) => ['lunch', 'cafe', 'snack'].includes(c));
  const night = ctx.includes('dinner');
  if (day && !night) return { lunch: range, dinner: null };
  if (night && !day) return { lunch: null, dinner: range };
  skip('price', r.id, s, '只有一個區間，contexts 午晚都有，看不出是哪一餐');
  return null;
}

const KIDS_OVERRIDE = {
  'toba-kikuya': { allowed: 'age-limit', minAge: 10, kidsMenu: true }, // 10 歲未滿原則上不能入店；有兒童餐
  'toba-yakatabune-okita': { allowed: 'age-limit', minAge: null, kidsMenu: null }, // 網路訂位限小學生以上；6 歲以下要先洽詢
  'toba-maruzen-suisan': { allowed: 'age-limit', minAge: null, kidsMenu: null }, // 帶學齡前兒童不能預約
  'toba-cuccagna': { allowed: 'unknown', minAge: null, kidsMenu: null }, // お子様連れ欄只寫「ランチ現金のみ」
};
function migrateKids(r) {
  if (r.kids == null || typeof r.kids === 'object') return r.kids ?? null;
  const s = r.kids;
  const o = KIDS_OVERRIDE[r.id];
  if (o) return { ...o, note: s };
  let allowed = 'unknown';
  if (/可帶小孩|小孩 ¥|小學生 ¥|小孩價|幼兒免費/.test(s)) allowed = 'yes';
  else skip('kids.allowed', r.id, s, '看不出能不能帶小孩');
  const kidsMenu = /有兒童(餐|套餐)/.test(s) ? true : null;
  return { allowed, minAge: null, kidsMenu, note: s };
}

const ACCESS_BY_REGION = {
  'toba-station': 'walk',
  nakanogo: 'walk',
  osatsu: 'walk',
  uramura: 'car',
  kuzaki: 'car',
  'toba-outskirts': 'car',
  toshijima: 'ferry',
  sugashima: 'ferry',
  kamishima: 'ferry',
};

function migrateRestaurant(p) {
  const region = REGION_BY_LABEL[p.extra?.region];
  if (!region) throw new Error(`${p.id}: 地區「${p.extra?.region}」對不到`);
  let q = migrateCommon(p, region);
  const { region: _r, tabelogOwner, googleName, barrierFree, ...extra } = p.extra ?? {};
  q.cuisine = mapCuisine(p);
  q = withKey(q, 'priceRange', 'price', migratePrice(p));
  q = withKey(q, 'contexts', 'access', ACCESS_BY_REGION[region]);
  q = withKey(q, 'ratings', 'tabelogOwner', tabelogOwner ?? null);
  q = withKey(q, 'tabelogOwner', 'googleName', googleName ?? null);
  if (q.group) {
    const m = (q.group.source ?? '').match(/最大予約可能人数\s*(?:着席\s*)?(\d+)\s*人/);
    q.group = withKey(q.group, 'seats', 'maxReservation', m ? Number(m[1]) : null);
  }
  if (q.notes) q.notes = q.notes.replace('（見 restaurants.md）', '（見 data/raw/toba/log/T4b.md）');
  q.kids = migrateKids(p);
  if (barrierFree) q = withKey(q, 'kids', 'accessibility', { barrierFree, note: null });
  if (/沙發/.test(extra.seatingNote ?? '')) {
    const s = q.seating.filter((x) => x !== 'other');
    if (!s.includes('sofa')) s.push('sofa');
    q.seating = s;
  }
  q.extra = extra;
  return q;
}

// ─── 候選清單：餐廳 ──────────────────────────────────────────────────────────
const ARTICLES = {
  'https://www.nap-camp.com/mag/50903': { type: 'media', title: 'なっぷ「鳥羽のおすすめ人気ランチ11選」（2026-10-01 更新）' },
  'https://www.nap-camp.com/mag/23934': { type: 'media', title: 'なっぷ「鳥羽のご当地グルメ15選」（2026-10-01 更新）' },
  'https://www.mapple.net/article/32188/': { type: 'media', title: 'まっぷる「鳥羽のかき小屋＆かき料理の人気店」（2025-03-21 更新）' },
  'https://www.mapple.net/article/31782/': { type: 'media', title: 'まっぷる「鳥羽1番街」' },
  'https://www.mapple.net/article/32428/': { type: 'media', title: 'まっぷる「相差」' },
  'https://tabiiro.jp/gourmet/article/iseshimatoba-kaisen/': { type: 'media', title: 'tabiiro「伊勢・志摩・鳥羽のおすすめ海鮮グルメ13選」（2026-08-04 更新）' },
  'https://chubu.letsgojp.com/archives/810883/': { type: 'blog-zh', title: '樂吃購！日本「日本鳥羽景點攻略」（2025-12-04）' },
  'https://chubu.letsgojp.com/archives/600899/': { type: 'blog-zh', title: '樂吃購！日本「三重縣美食餐廳推薦」（2025-04-08）' },
  'https://www.mirrormedia.mg/story/20260323tour001': { type: 'blog-zh', title: '鏡週刊 答志島（2026-03-23）' },
  'https://www.toba.gr.jp/feature/abc/': { type: 'tourism', title: '鳥羽市觀光協會 浦村牡蠣特集' },
  'https://www.kankomie.or.jp/season/article/110': { type: 'tourism', title: '觀光三重「鳥羽浦村牡蠣食べ放題 17 選」（2026-10-05）' },
  'https://www.kankomie.or.jp/event/39679': { type: 'tourism', title: '觀光三重「食べ放題以外的浦村牡蠣店」（2025 年版）' },
  'https://www.kankomie.or.jp/report/1636': { type: 'tourism', title: '觀光三重 答志島觀光指南' },
  'https://www.kankomie.or.jp/report/508': { type: 'tourism', title: '觀光三重 相差一日遊' },
};
const mention = (url) => ({ type: ARTICLES[url].type, url, title: ARTICLES[url].title, highlight: null, retrieved: RETRIEVED });
const ABC = 'https://www.toba.gr.jp/feature/abc/';
// 未納入的店：T4a 筆記寫明是哪一篇的
const KNOWN_MENTIONS = {
  阿波幸: ['https://chubu.letsgojp.com/archives/810883/'], // 「（阿波幸、すし梅、大阪屋）」
  ロンク食堂: ['https://www.kankomie.or.jp/report/1636'], // 「答志島觀光指南（ロンク食堂、マルト食堂）」
  マルト食堂: ['https://www.kankomie.or.jp/report/1636'],
  海女小屋はちまんかまど: ['https://www.kankomie.or.jp/report/508'], // 「相差一日遊（海女の家 五左屋、はちまんかまど、王将）」
  山安水産: ['https://www.kankomie.or.jp/season/article/110'], // 「觀光三重 17 選：休日「全平日」」
};
const NO_TABELOG_KEYS = {
  'JUBILEE TEA ＆ BAKES': 'jubilee-tea-and-bakes',
  大盛屋: 'oomoriya',
  '焼き鳥・居酒屋 入り江': 'irie',
  魚平: 'uohei',
  'ROUTE 750': 'route-750',
  '浦村Sea Farm': 'uramura-sea-farm',
  'きゅう＆しろ おやつとコーヒー': 'kyu-and-shiro',
  みのなる森とこよの郷: 'minonaru-mori-tokoyo-no-sato',
  'お弁当 おかげ屋': 'okageya',
};
const SECTION_REGION = {
  鳥羽站周邊: 'toba-station',
  '鳥羽站周邊（外圍・需車）': 'toba-outskirts',
  中之郷: 'nakanogo',
  浦村: 'uramura',
  相差: 'osatsu',
  '國崎・パールロード': 'kuzaki',
  '離島（答志島）': 'toshijima',
  '離島（菅島）': 'sugashima',
  '離島（神島）': 'kamishima',
};
const SOURCE_KIND = { 觀光協會: 'tourism', 觀光三重: 'tourism', 日文媒體: 'media', 中文部落格: 'blog-zh' };

function restaurantCandidates(restaurants) {
  const md = gitShow('data/raw/toba/restaurants.md');
  const lines = md.split(/\r?\n/);
  const start = lines.indexOf('## 候選表');
  const end = lines.findIndex((l, i) => i > start && /^## /.test(l));
  const byTabelog = new Map(restaurants.map((r) => [r.links?.tabelog?.match(/\/(\d+)\/?$/)?.[1], r]));
  const out = [];
  const usedPoints = new Set();
  let region = null;
  for (const line of lines.slice(start, end)) {
    const sec = line.match(/^### (.+?)（候選 \d+、納入 \d+）$/);
    if (sec) {
      region = SECTION_REGION[sec[1]];
      if (!region) throw new Error(`候選表地區對不到：${sec[1]}`);
      continue;
    }
    if (!line.startsWith('| ') || line.startsWith('| 店名') || line.startsWith('|---')) continue;
    const cells = line.split('|').slice(1, -1).map((c) => c.trim());
    if (cells.length !== 8) throw new Error(`候選表欄數不對：${line}`);
    const [name, category, tabelogCell, googleCell, srcCell, incl, ctxCell, remark] = cells;
    const ratings = {};
    let tabelogUrl = null;
    let tabelogId = null;
    const t = tabelogCell.match(/^\[([\d.-]+)／([\d-]+)\]\((https:\/\/tabelog\.com\/[^)]+\/(\d+)\/)\)$/);
    if (t) {
      ratings.tabelog = t[1] === '-' ? null : Number(t[1]);
      ratings.tabelogReviews = t[2] === '-' ? null : Number(t[2]);
      tabelogUrl = t[3];
      tabelogId = t[4];
    } else if (tabelogCell !== '無頁面') throw new Error(`食べログ欄看不懂：${tabelogCell}`);
    const g = googleCell.match(/^([\d.]+)\/(\d+)$/);
    if (g) {
      ratings.google = Number(g[1]);
      ratings.googleReviews = Number(g[2]);
    } else if (googleCell !== '—') throw new Error(`Google 欄看不懂：${googleCell}`);

    let status;
    let criteria = [];
    if (/^[A-F]+$/.test(incl)) {
      status = 'included';
      criteria = [...incl].map((c) => {
        if (c === 'F') return /體驗型/.test(remark) ? 'F2' : 'F1';
        if (c === 'D') return /晚餐缺口/.test(remark) ? 'D2' : 'D1';
        return c;
      });
    } else if (incl === '未納入') status = 'not-included';
    else if (incl === '排除') status = 'excluded';
    else if (incl === '同類型上限') {
      status = 'over-limit';
      criteria = ['B']; // T4a：上限外的 5 家「都只靠 B」
    } else if (incl === '待確認') status = 'pending';
    else throw new Error(`納入欄看不懂：${incl}`);

    const point = status === 'included' ? byTabelog.get(tabelogId) : null;
    if (status === 'included' && !point) throw new Error(`納入的店對不到 restaurants.json：${name}`);
    if (point) usedPoints.add(point.id);
    const key = point?.id ?? (tabelogId ? `tabelog-${tabelogId}` : NO_TABELOG_KEYS[name]);
    if (!key) throw new Error(`沒有 key：${name}`);

    // mentions
    const kinds = srcCell.replace(/（\d+）$/, '').split('、').filter((k) => k !== '—');
    let urls = [];
    if (point) urls = point.sources.map((s) => s.url).filter((u) => ARTICLES[u]);
    else {
      if (kinds.includes('觀光協會')) urls.push(ABC); // 觀光協會只算浦村牡蠣特集
      urls.push(...(KNOWN_MENTIONS[name] ?? []));
    }
    urls = [...new Set(urls)];
    const mentions = urls.map(mention);
    const covered = new Set(urls.map((u) => (u === ABC ? '觀光協會' : ARTICLES[u].type === 'tourism' ? '觀光三重' : ARTICLES[u].type === 'media' ? '日文媒體' : '中文部落格')));
    const missing = kinds.filter((k) => !covered.has(k));
    const notes = [];
    if (missing.length) notes.push(`T4a 記的來源種類「${missing.join('、')}」沒有記是哪一篇`);

    const c = { key, name: { ja: name }, region, category: category === '—' ? null : category, status };
    if (criteria.length) c.criteria = criteria;
    c.reason = status === 'included' ? null : remark || null;
    c.pointId = point?.id ?? null;
    c.ratings = ratings;
    if (tabelogUrl) c.links = { tabelog: tabelogUrl };
    const ctx = ctxCell === '—' ? [] : ctxCell.split('、');
    if (ctx.length) c.contexts = ctx;
    if (mentions.length) c.mentions = mentions;
    if (status === 'included' && remark) notes.unshift(remark);
    c.note = notes.length ? notes.join('；') : null;
    out.push(c);
    if (!KIND_CHECK(kinds)) throw new Error(`來源種類看不懂：${srcCell}`);
  }
  const missingPoints = restaurants.filter((r) => !usedPoints.has(r.id));
  if (missingPoints.length) throw new Error(`restaurants.json 有店不在候選表：${missingPoints.map((r) => r.id)}`);
  return out;
}
const KIND_CHECK = (kinds) => kinds.every((k) => SOURCE_KIND[k]);

// ─── 候選清單：景點（BASE 的 spots.md「被排除的候選」「其他候選」）────────────
// status：被排除（不算景點、不在鳥羽、2 月沒意義、座標不可靠）→ excluded；小型、未深入 → not-included
// region 不在鳥羽的子地區裡（鳥羽以外、位置不明）時省略
const sx = (key, ja, region, category, status, reason, extra = {}) => ({ key, name: { ja }, ...(region ? { region } : {}), category, status, reason, ...extra });
const SPOT_CANDIDATES = [
  // T2-a 市區
  sx('ousho-souvenir-center', '伊勢志摩みやげセンター王将 鳥羽本店', 'toba-outskirts', '伴手禮店', 'excluded', '在鳥羽市松尾町（加茂站附近），主要是團體巴士的大型伴手禮店，不算景點。用餐見 restaurant toba-ousho-honten', { note: 'じゃらん 鳥羽市観光ランキング第 7 名' }),
  sx('isewan-ferry-toba', '伊勢湾フェリー 鳥羽のりば', 'toba-station', '交通設施', 'excluded', '交通設施，不算景點（OSM node 6215361885，在水族館南側）'),
  sx('toba-tourist-info', '鳥羽市観光案内所（鳥羽站內）', 'toba-station', '服務設施', 'excluded', '服務設施，不算景點；可以借輪椅（三重縣資料），電話 0599-25-2844（9:00～17:30）'),
  sx('kata-jinja', '賀多神社', 'toba-station', '神社', 'not-included', '小型景點，重要性低；在去日和山的路上（OSM node 4595793079）'),
  sx('joanji', '常安寺', 'toba-station', '寺院', 'not-included', '小型景點，重要性低；九鬼家菩提寺'),
  sx('irako-seihaku-house', '伊良子清白の家', 'toba-station', '歷史建築', 'not-included', '小型景點，重要性低', { links: { official: 'https://www.toba.gr.jp/course/1501/' }, note: '鳥羽市觀光協會「ぶらっとまちなか散策コース」' }),
  sx('kamome-sanpomichi', 'カモメの散歩道', 'toba-station', '散步道', 'not-included', '小型景點，重要性低', { links: { official: 'https://www.toba.gr.jp/course/1501/' } }),
  sx('kaito-yumin-club', '海島遊民くらぶ', null, '導覽業者', 'excluded', '導覽業者，不屬於景點'),
  sx('kowagama', '光和窯', null, '體驗工房', 'excluded', '體驗工房，不屬於景點'),
  sx('yakatabune-okita', '屋形船おきた', 'toba-station', '餐廳', 'excluded', '餐廳，不屬於景點；見 restaurant toba-yakatabune-okita'),
  // T2-B 南部
  sx('amakazukime-jinja', '海士潜女神社', 'kuzaki', '神社', 'excluded', 'OSM 沒有名稱節點，kankomie 座標（34.41465,136.924431）附近的 OSM 無名神社節點差約 250 m，座標不可靠', { links: { official: 'https://amakadukime-jinja.com/' }, note: '供奉傳說海女「お弁」；国崎巴士站步行約 5 分、無停車場、鳥羽市観光商工課 0599-25-1157' }),
  sx('ijika-observatory-1', '石鏡第一展望台', 'kuzaki', '展望台', 'excluded', '搜不到可靠的官方、觀光資料（停車、廁所、位置），OSM 也沒有'),
  sx('ounoura-bridge', '麻生の浦大橋', 'uramura', '橋', 'not-included', 'パールロード入口的白色拱橋，風景點但不是可停留的景點；16t 以上大型車限制通行'),
  sx('chidorigahama-beach', '千鳥ヶ浜海水浴場', 'osatsu', '海水浴場', 'excluded', '夏季海水浴場，2 月沒有意義'),
  sx('fishing-park-triton', 'フィッシングパークトリトン', null, '釣魚池', 'not-included', '千賀町；釣魚池＋海上 BBQ，8:00～14:00、不定休；冬季營業與團體未查，和主題（海女、展望）關聯低，可留作備案'),
  sx('shima-spain-village', '志摩スペイン村', null, '主題樂園', 'excluded', '在志摩市，不屬鳥羽'),
  sx('yokoyama-observatory', '横山展望台', null, '展望台', 'excluded', '在志摩市，不屬鳥羽'),
  sx('asamayama-observatory', '朝熊山頂展望台', null, '展望台', 'excluded', '在伊勢市，不屬鳥羽'),
  sx('uramura-kaki', '浦村牡蠣小屋・牡蠣體驗', 'uramura', '餐廳／體驗', 'excluded', '牡蠣小屋屬餐廳（見 candidates/restaurants.json）；沒找到獨立的牡蠣「體驗」設施（剝殼體驗等）', { note: '浦村牡蠣季約 11 月初～4 月下旬（2 月在季中），食べ放題需預約、很快額滿；例：山安水產パールロード店 2025 季大人 3,000／小學生 1,700；かき丸 大 3,500／小 1,750；かきいち 大人 3,300／小學生 1,650／幼兒 550（2023 報導）' }),
  sx('anori-lighthouse', '安乗埼灯台', null, '燈塔', 'excluded', '在志摩市阿児町，不屬鳥羽'),
  // T2-C 離島
  sx('sakatejima', '坂手島', null, '離島', 'not-included', '主要景點是アヤメ池的カキツバタ（5 月中旬～初夏），2 月不是花期；其他是海水浴場、展望台，冬季吸引力低', { links: { official: 'https://www.kankomie.or.jp/report/1423' }, note: '定期船 220 円、約 10 分、一周步道約 1 小時，公廁只在碼頭' }),
  sx('toshijima-momotori', '答志島 桃取', 'toshijima', '聚落', 'not-included', '沒有特定景點資料（主要是聚落與牡蠣養殖）'),
  sx('kuki-yoshitaka-kubizuka', '九鬼嘉隆首塚・胴塚', 'toshijima', '史跡', 'not-included', '查不到可靠座標，併入 spot toba-toshijima-wagu 的說明'),
  sx('mitarashi-jinja', '美多羅志神社', 'toshijima', '神社', 'not-included', '查不到可靠座標，併入 spot toba-toshijima-toshi 的說明'),
  sx('chouonji', '潮音寺', 'toshijima', '寺院', 'not-included', '查不到可靠座標，併入 spot toba-toshijima-toshi 的說明'),
  sx('sugashima-kantekisho', '菅島監的哨', 'sugashima', '戰爭遺跡', 'not-included', '查座標未果／2 月價值低，記在 spot toba-sugashima-lighthouse 的 extra.fullCourse'),
  sx('sugashima-onmahama', 'おんま浜', 'sugashima', '海灘', 'not-included', '查座標未果／2 月價值低，記在 spot toba-sugashima-lighthouse 的 extra.fullCourse'),
  sx('sugashima-okinoshima-beach', '沖ノ島海水浴場', 'sugashima', '海水浴場', 'not-included', '查座標未果／2 月價值低，記在 spot toba-sugashima-lighthouse 的 extra.fullCourse'),
  sx('sugashima-oyama-observatory', '大山展望台', 'sugashima', '展望台', 'not-included', '查座標未果／2 月價值低，記在 spot toba-sugashima-lighthouse 的 extra.fullCourse'),
  sx('kamishima-niwanohama', 'ニワの浜', 'kamishima', '海岸', 'not-included', '次要景點，併入說明（OSM way/679250385）'),
  sx('kamishima-furusatonohama', '古里の浜', 'kamishima', '海岸', 'not-included', '次要景點，併入說明'),
  sx('kamishima-shiosai-park', '潮騒公園', 'kamishima', '公園', 'not-included', '次要景點，併入說明（OSM way/677653235）'),
  sx('shimanoryosha-amagoya', '島の旅社 海女小屋體驗（BBQ）', 'toshijima', '體驗', 'excluded', '2026-01-27 公告結束', { links: { official: 'https://www.shima-tabi.net/' } }),
  // T2-C「其他候選」：總覽搜尋看到的鳥羽市觀光協會體驗，沒有深入研究
  sx('toba-daidokoro-walking', '鳥羽の台所 つまみ食いウォーキング', 'toba-station', '體驗', 'not-included', '總覽搜尋看到，沒有深入研究', { links: { official: 'https://www.toba.gr.jp/play/2570/' } }),
  sx('ama-lecture', '海女講座', null, '體驗', 'not-included', '總覽搜尋看到，沒有深入研究', { links: { official: 'https://www.toba.gr.jp/play/2835/' } }),
  sx('wakame-harvest-tour', 'ワカメ刈りツアー', null, '體驗', 'not-included', '總覽搜尋看到，沒有深入研究；裙帶菜季節可能和 2 月重疊', { links: { official: 'https://www.toba.gr.jp/play/2574/' } }),
  sx('fossil-replica', '化石レプリカづくり', null, '體驗', 'not-included', '總覽搜尋看到，沒有深入研究', { links: { official: 'https://www.toba.gr.jp/play/2628/' } }),
  sx('shell-art', '貝殻アート', null, '體驗', 'not-included', '總覽搜尋看到，沒有深入研究', { links: { official: 'https://www.toba.gr.jp/play/2630/' } }),
];

// ─── 候選清單：住宿（BASE 的 lodging.md 各組的「被排除」「沒有收錄」）────────
const lx = sx;
const rk = (rakuten, rakutenReviews = null) => ({ ratings: { rakuten, rakutenReviews } });
const OSATSU_SMALL = '相差的中小型民宿、旅館（評價多在 4.3～4.75）；房數小，又不是石神さん或千鳥ヶ浜的核心位置，這次優先收錄資料較完整的。之後找分住組合可以從這裡補';
const LODGING_CANDIDATES = [
  // 市區組：被排除
  lx('wanwan-paradise-toba', 'わんわんパラダイス 鳥羽', null, '寵物同住旅館', 'excluded', '以帶狗同住為主的旅館，不適合沒帶狗的 15 人團（有長輩、小孩，也有過敏疑慮）', { ...rk(4.0), note: '楽天 4821' }),
  lx('kintetsu-aquavilla', 'ホテル近鉄アクアヴィラ伊勢志摩', null, '飯店', 'excluded', '不在鳥羽：現為「都リゾート 奥志摩 アクアフォレスト」，志摩市大王町船越（觀光三重 kankomie.or.jp/spot/19634）。交給志摩'),
  lx('toba-hotel-international', '鳥羽ホテルインターナショナル', null, '飯店', 'excluded', '查無此飯店，推測是「鳥羽国際ホテル」（英文名 Toba Hotel International）的誤記；見 lodging toba-kokusai-hotel'),
  lx('dormy-inn-toba', 'ドーミーイン鳥羽', null, '商務飯店', 'excluded', '楽天、じゃらん鳥羽列表都沒有，查無'),
  lx('toba-station-hotel', '鳥羽ステーションホテル', null, '商務飯店', 'excluded', '楽天、じゃらん鳥羽列表都沒有，查無'),
  lx('road-inn-toba', 'ロードイン鳥羽', 'toba-station', '商務飯店', 'not-included', '站前商務飯店只找到這間（小浜方向，OSM way/567997520），沒有深入查'),
  lx('isabatei', '海のホテル いさば亭', null, '飯店', 'not-included', '楽天、じゃらん鳥羽列表都沒出現，沒有確認是否在鳥羽市區'),
  lx('taoya-shima', 'TAOYA志摩', null, '飯店', 'not-included', 'OSM 座標 136.9077, 34.4506（鳥羽市南部、石鏡～浦村之間？），名稱有「志摩」但可能在鳥羽市，沒有查證', rk(4.26, 1565)),
  // 市區組：範圍內但沒有收錄
  lx('kisara', '季さら', 'toba-outskirts', '旅館', 'not-included', '範圍內但沒有收錄（10 室，太小或未深入）', rk(4.4)),
  lx('kisara-bettei-toki', '季さら別邸 刻', 'toba-outskirts', '旅館', 'not-included', '範圍內但沒有收錄（10 室）', rk(4.59)),
  lx('bali-resort-sayanokaze', 'Bali＆Resort SAYAの風', 'toba-outskirts', '飯店', 'not-included', '範圍內但沒有收錄（29 室）；じゃらん yad326675', rk(4.54)),
  lx('kameya-anrakujima', '浜辺の宿かめや', 'toba-outskirts', '旅館', 'not-included', '範圍內但沒有收錄（13 室）', rk(4.44)),
  lx('kairakuen-lodging', '海上料亭 海楽園', 'toba-station', '旅館', 'not-included', '範圍內但沒有收錄（小浜，13 室）；午餐見 restaurant toba-kairakuen', rk(4.17)),
  lx('andon-toba', 'お宿行灯鳥羽', 'toba-station', '旅館', 'not-included', '範圍內但沒有收錄（小浜，27 室）', rk(3.98)),
  lx('hamarikyu', 'ホテル浜離宮', 'toba-station', '飯店', 'not-included', '範圍內但沒有收錄（小浜）；じゃらん yad353538'),
  lx('obamaso', 'あじ彩の宿 小浜荘', 'toba-station', '旅館', 'not-included', '範圍內但沒有收錄；じゃらん yad316766'),
  lx('saikatei', 'ホテルリゾート彩花亭', 'toba-outskirts', '飯店', 'not-included', '範圍內但沒有收錄（安楽島）；じゃらん yad324798'),
  lx('wistarian-life-club-toba', 'ウィスタリアンライフクラブ鳥羽', 'toba-outskirts', '會員制飯店', 'not-included', '可能是會員制（未確認）；じゃらん yad399576'),
  lx('kinposo', '寿々波別館 錦浦館', 'toba-station', '旅館', 'not-included', '鳥羽站 4 號出口步行 2 分的小旅館，分組住或預算型可以補查；じゃらん yad319711'),
  lx('yoshidaya-wako', '吉田屋 和光', 'toba-station', '旅館', 'not-included', '鳥羽站步行 5 分的小旅館，分組住或預算型可以補查；じゃらん yad337583'),
  lx('umitsuki', '海の幸とやすらぎの宿 海月', 'toba-station', '旅館', 'not-included', '鳥羽 1 丁目的小旅館，分組住或預算型可以補查；じゃらん yad390521'),
  // 南部組：被排除／沒有收錄
  lx('noichi', 'あそび心の宿 のいち', 'osatsu', '民宿', 'not-included', '2023-12 改裝後客室從 6 間減為 4 間（じゃらん），規定大人 1 室 2 人起，15 人住不下；可作為石神さん組的補充', rk(4.67)),
  lx('jubei', '花の小宿 重兵衛', 'osatsu', '旅館', 'not-included', '13 室（或 10 室）高級小宿；鳥羽站接送只有 16:00 一班；沒有無障礙；2 月價格沒查（時間有限），可之後補', rk(4.62)),
  lx('osatsu-pacific-hotel', '浜辺のお宿 相差パシフィックホテル', 'osatsu', '飯店', 'not-included', '評價偏低（楽天 3.88）', rk(3.88)),
  lx('kazumi', '和造りの料理と湯の宿 かず美', 'osatsu', '旅館', 'not-included', '評價相對偏低（楽天 4.05～4.08）'),
  lx('shima-beach-hotel', '志摩ビーチホテル', 'osatsu', '飯店', 'not-included', '沒有深入查', rk(4.24)),
  ...['味の宿 花椿', '情景の宿あづま', '料理旅館まつや', 'かんえい', '幸洋荘', '丸善', '別館すずき', '山川', 'おくのせこ', '魚勘', '長岡', 'かしま', 'さわ栄', '浜栄', '望洋', '磯島', 'まさみや', 'うえじ', '冨久家'].map((ja, i) =>
    lx(`osatsu-small-${String(i + 1).padStart(2, '0')}`, ja, 'osatsu', '民宿・旅館', 'not-included', OSATSU_SMALL, ja === 'まさみや' ? { note: '10 室、送迎 5 人以上' } : ja === '味の宿 花椿' ? { note: '料理旅館；T7 的 F③ 可以當餐廳（非住客用餐）重查' } : {}),
  ),
  lx('marusen-kuzaki', '魚の栖 丸仙', 'kuzaki', '旅館', 'not-included', '評價相對偏低', rk(4.13)),
  lx('marubun', '浜辺の宿 丸文', 'kuzaki', '民宿', 'not-included', '12 室、女將是海女；沒有查評分與價格，可之後補'),
  lx('amanosato', '観光旅館 海女の郷', 'kuzaki', '旅館', 'not-included', '接送要 4 人以上；沒有查評分與價格，可之後補'),
  lx('iheiyaso', '料理自慢の民宿 伊平屋荘', 'osatsu', '民宿', 'not-included', '畔蛸只找到這間，沒有深入查', rk(4.33, 100)),
  lx('ijikaso', 'ホテルいじか荘', 'kuzaki', '飯店', 'not-included', '評分各網站差很多（icotto 3.38、mapple 4.32）'),
  lx('shinpachiya', '絶景海風癒し庵 新八屋', 'kuzaki', '旅館', 'not-included', '沒有深入查', rk(4.38)),
  lx('hidemaru-hanagokoro', '秀丸花ごころ', 'kuzaki', '寵物同住旅館', 'excluded', '寵物同住旅館'),
  lx('hanashinsui', 'はなしんすい（芭新萃）', null, '旅館', 'not-included', '大型旅館；地址楽天寫浦村町1850-33、KNT 寫石鏡町187，不一致，這次沒有收錄，可之後補', rk(4.38, 1740)),
  // 離島組：被排除
  lx('sankoen', '山幸園', 'toshijima', '民宿', 'not-included', '7 室、最晚 check-in 17:00；楽天頁沒顯示評分，rwiths 查不到方案，資料太少', { note: '楽天 67216；電話 0599-37-2216、答志町1025-3、座標 136.8902417,34.52216581；有需要可以補成第 9 筆' }),
  lx('tomie', '民宿旅館 富栄', 'toshijima', '民宿', 'not-included', '沒有訂房網站、評分、價格（觀光三重 spot/24321、OSM 136.9020977,34.5293563）'),
  lx('amanoshimaso', '旅館 海女乃島荘', 'toshijima', '旅館', 'not-included', '只有 OSM 點位，沒有任何其他資料'),
  lx('shima-toshi', 'しま', 'toshijima', '旅館', 'not-included', '只有 OSM 點位，沒有任何其他資料'),
  lx('yamayo', '漁師の宿 やまよ', 'toshijima', '民宿', 'not-included', '只在 4travel 看到地址（和貝浦806），楽天、じゃらん都找不到，營業狀態不明'),
  lx('shimanoryosha', '島の旅社', 'toshijima', '其他', 'not-included', '觀光三重有列出（spot/24548），是不是住宿沒確認'),
  lx('kuroshio-sugashima', 'くろしお', 'sugashima', '民宿', 'not-included', '觀光三重只有地址、電話（0599-34-2027），沒有房數、價格、評分'),
  lx('nagisa-kamishima', '民宿なぎさ', 'kamishima', '民宿', 'not-included', '只有 OSM 點位'),
  lx('misaki-kamishima', '岬', 'kamishima', '民宿', 'not-included', '只有 OSM 點位'),
  lx('kotobukiya-bekkan', '寿や別館', null, null, 'excluded', '委派時提到的名字，答志島、菅島、神島都沒有找到，可能不在離島'),
  lx('hamasharaku', '旅館 浜写楽', null, null, 'excluded', '委派時提到的名字，答志島、菅島、神島都沒有找到，可能不在離島'),
  // 包棟組：被排除
  lx('tobashare', 'toBAshare（トバシェア）HOSTEL', 'toba-station', '包棟', 'excluded', '最多 12 人；2027-01-04 前後到 2 月左右因外牆塗裝暫停營業（ACO 頁面），旅程期間可能不能住', { note: '鳥羽 1-2-12（鳥羽站步行 5～7 分）；届出番號 志2194-0020，平日 12 人 90,000 円；和 Anchor. 同一集團。如果 2 月有開，可以和 Lido Porte 等搭配' }),
  lx('grand-garden-nagi', 'ザ・グランガーデン南木（nagi）', 'osatsu', '包棟', 'not-included', '定員 10、是 glamping（2 月冷），Booking 6.2（12）評價偏低'),
  lx('kisara-oneness', '季さら Oneness', 'toba-outskirts', '包棟', 'not-included', '3 棟 villa，每棟 2～4 人，最多約 12 人，而且很貴（2 人 66,300 円起）'),
  lx('dog-good-loghouse', 'ドッグにグッドなログハウス鳥羽', 'kuzaki', '包棟', 'not-included', '最多 8 人、只能用 LINE／IG DM 預約、狗主題'),
  lx('togenkyo-2', '旧館民泊桃源郷2', 'toba-station', '民泊', 'excluded', '只出租 1 樓和室 1 間、沒有浴室，不是整棟'),
  lx('sea-side-terrace', 'Sea SIDE TERRACE', 'toba-outskirts', '包棟', 'not-included', 'Booking 7.2（5 則），定員等資料都查不到'),
  lx('tokiwa-kamakura', '古民家ゲストハウス TOKIWA', null, '包棟', 'excluded', '搜尋結果誤中，在神奈川縣鎌倉市（Airbnb 32412352，16 人）'),
  lx('mori-to-umi', '森と海', null, '包棟', 'excluded', '在志摩市阿児町（16 人），不在鳥羽市（給志摩參考）'),
  lx('shima-boat-house', 'SHIMA BOAT HOUSE', null, '包棟', 'excluded', '在志摩市阿児町（25 人），不在鳥羽市（給志摩參考）'),
  lx('villa-forest', 'Villa Forest', null, '包棟', 'excluded', '在志摩市阿児町（20 人），不在鳥羽市（給志摩參考）'),
];

function includedCandidates(points, category) {
  return points.map((p) => {
    const c = { key: p.id, name: { ja: p.name.ja }, region: p.region, category: category(p), status: 'included', reason: null, pointId: p.id };
    const r = p.ratings ?? {};
    const ratings = Object.fromEntries(['rakuten', 'rakutenReviews', 'google', 'googleReviews'].filter((k) => r[k] != null).map((k) => [k, r[k]]));
    if (Object.keys(ratings).length) c.ratings = ratings;
    return c;
  });
}

// ─── 執行 ────────────────────────────────────────────────────────────────────
const spots = readBase('data/areas/toba/spots.json').map(migrateSpot);
const lodging = readBase('data/areas/toba/lodging.json').map(migrateLodging);
const restaurants = readBase('data/areas/toba/restaurants.json').map(migrateRestaurant);

for (const p of [...spots, ...lodging, ...restaurants]) {
  if (!REGION_IDS.has(p.region)) throw new Error(`${p.id}: region ${p.region} 不在 areas.json`);
}

const candRestaurants = restaurantCandidates(readBase('data/areas/toba/restaurants.json'));
const candSpots = [...includedCandidates(spots, () => null), ...SPOT_CANDIDATES];
const candLodging = [...includedCandidates(lodging, (p) => p.kind), ...LODGING_CANDIDATES];

const write = (rel, data) => {
  const file = path.join(ROOT, rel);
  if (DRY) return;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
};
write('data/areas/toba/spots.json', spots);
write('data/areas/toba/lodging.json', lodging);
write('data/areas/toba/restaurants.json', restaurants);
write('data/raw/toba/candidates/restaurants.json', candRestaurants);
write('data/raw/toba/candidates/spots.json', candSpots);
write('data/raw/toba/candidates/lodging.json', candLodging);

const count = (a, f) => a.reduce((m, x) => ((m[f(x)] = (m[f(x)] ?? 0) + 1), m), {});
console.error(`景點 ${spots.length}、住宿 ${lodging.length}、餐廳 ${restaurants.length}`);
console.error(`候選：餐廳 ${candRestaurants.length} ${JSON.stringify(count(candRestaurants, (c) => c.status))}`);
console.error(`候選：景點 ${candSpots.length} ${JSON.stringify(count(candSpots, (c) => c.status))}；住宿 ${candLodging.length} ${JSON.stringify(count(candLodging, (c) => c.status))}`);
console.error(`轉不了：${unconverted.length} 筆 ${JSON.stringify(count(unconverted, (u) => u.field))}`);
if (DRY) console.error('（--dry-run，沒有寫檔）');

if (REPORT) {
  const out = [];
  const byField = Object.groupBy(unconverted, (u) => u.field);
  out.push('| 欄位 | 筆數 |', '|---|---|');
  for (const [f, list] of Object.entries(byField)) out.push(`| \`${f}\` | ${list.length} |`);
  for (const [f, list] of Object.entries(byField)) {
    out.push('', `#### \`${f}\`（${list.length}）`, '', '| ID | 原文 | 原因 |', '|---|---|---|');
    for (const u of list) out.push(`| ${u.id} | ${String(u.value ?? '').replace(/\|/g, '｜')} | ${u.why} |`);
  }
  const noArticle = candRestaurants.filter((c) => /沒有記是哪一篇/.test(c.note ?? ''));
  out.push('', `#### 候選清單：只知道來源種類、不知道是哪一篇（${noArticle.length} 家，寫在 note，mentions 沒有填）`, '', noArticle.map((c) => `${c.name.ja}（${c.status}）`).join('、'));
  out.push('', `#### 拿掉的自由標籤（${removedTags.length} 筆，不是錯誤：描述性的文字和子地區不放 tags）`, '', '| ID | 拿掉的 |', '|---|---|');
  for (const r of removedTags) out.push(`| ${r.id} | ${r.tags.join('、')} |`);
  console.log(out.join('\n'));
}
