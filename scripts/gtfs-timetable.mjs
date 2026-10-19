#!/usr/bin/env node
// 把 GTFS-JP 開放資料（gtfs-data.jp）轉成 data/timetables/bus|ferry/<route-id>.json（T10）。
//
//   - 下載 ROUTES 用到的 feed（快取在 --cache，重跑不再下載；加 --refresh 重新下載）
//   - 每條路線一個檔案：停留所（座標、附近的車站和景點）、旅程各日別（平日、土曜、日祝）的班次、主要停留所之間的票價
//   - feed 沒涵蓋到旅程日期時（三重交通的 feed 每天自動更新，只到約 3 個月後），用 feed 裡同星期幾的一般日推算，
//     檔案的 dayTypeBasis 寫明每一天是用哪一天推算的；2027 年 1 月要重跑一次
//
// 用法：node scripts/gtfs-timetable.mjs [--cache <dir>] [--refresh] [--retrieved YYYY-MM-DD] [--only <route-id>,...]

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadFeed, feedRange, hhmm, tripsByDayType } from './lib/gtfs.mjs';
import { tripDays } from './lib/trip-hours.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const API = 'https://api.gtfs-data.jp/v2/organizations';
const TRIP = { from: '2027-02-02', to: '2027-02-13', holidays: ['2027-02-11'] };
const NEAR_METERS = 500; // 停留所附近的車站、景點（直線距離）
const NEAR_MAX = 3;

const FEEDS = {
  'mie-kotsu/sancoise': { operator: '三重交通', page: 'https://www.sanco.co.jp/' },
  'mie-kotsu/sancoshima': { operator: '三重交通', page: 'https://www.sanco.co.jp/' },
  'tobacity/communitybus': { operator: '鳥羽市（かもめバス）', page: 'https://www.city.toba.mie.jp/kurashi/kotsu/kokyo_kotsu/1910.html' },
  'tobacity/teikisen': { operator: '鳥羽市営定期船', page: 'https://www.city.toba.mie.jp/kurashi/kotsu/kokyo_kotsu/5531.html' },
  'shimacity/agowanteikisen': { operator: '志摩マリンレジャー（あご湾定期船）', page: 'https://shima-marineleisure.com/ago' },
  'shimacity/anori': { operator: '志摩市', page: 'https://www.city.shima.mie.jp/kurashi_tetsuzuki/kokyokotu/index.html' },
};

// 要轉的路線：景點要搭巴士或船的（T10 從 spots.json 的 access、nearestStation 和停留所距離挑出來，理由寫在 data/timetables/README.md）
const ROUTES = [
  { id: 'sanco-gaiku-naiku-chokokan', feed: 'mie-kotsu/sancoise', route: '外宮内宮（徴古館）線', mode: 'bus', zh: '外宮內宮線（經徵古館，51 系統）' },
  { id: 'sanco-gaiku-naiku-chosha', feed: 'mie-kotsu/sancoise', route: '外宮内宮（庁舎前）線', mode: 'bus', zh: '外宮內宮線（經市廳舍前，55 系統）' },
  { id: 'sanco-canbus', feed: 'mie-kotsu/sancoise', route: 'ＣＡＮばす', mode: 'bus', zh: 'CAN 巴士（伊勢二見鳥羽周遊巴士）' },
  { id: 'sanco-ise-shinai-a', feed: 'mie-kotsu/sancoise', route: '伊勢市内Ａ線', mode: 'bus', zh: '伊勢市內 A 線' },
  { id: 'sanco-ise-shinai-b', feed: 'mie-kotsu/sancoise', route: '伊勢市内Ｂ線', mode: 'bus', zh: '伊勢市內 B 線（經松尾觀音）' },
  { id: 'sanco-ise-toba', feed: 'mie-kotsu/sancoise', route: '伊勢鳥羽線', mode: 'bus', zh: '伊勢鳥羽線（經二見）' },
  { id: 'sanco-sangu', feed: 'mie-kotsu/sancoise', route: '参宮バス', mode: 'bus', zh: '參宮巴士（朝熊山上）' },
  { id: 'sanco-goza', feed: 'mie-kotsu/sancoshima', route: '御座線', mode: 'bus', zh: '御座線（伊勢～鵜方～大王崎～御座）' },
  { id: 'sanco-shukuura', feed: 'mie-kotsu/sancoshima', route: '宿浦線', mode: 'bus', zh: '宿浦線（伊勢～鵜方～濱島）' },
  { id: 'sanco-anori', feed: 'mie-kotsu/sancoshima', route: '安乗線', mode: 'bus', zh: '安乘線（鵜方～渡鹿野～安乘）' },
  { id: 'shima-anori-daitai', feed: 'shimacity/anori', route: '安乗線代替交通', mode: 'bus', zh: '安乘線替代巴士（志摩市，日祝）' },
  { id: 'kamome-1-anrakujima', feed: 'tobacity/communitybus', route: 'かもめバス１鳥羽小学校～安楽島線', mode: 'bus', zh: '鷗巴士 1 號 鳥羽小學校～安樂島線' },
  { id: 'kamome-2-wistarian', feed: 'tobacity/communitybus', route: 'かもめバス２小浜～ウィスタリアン線', mode: 'bus', zh: '鷗巴士 2 號 小濱～Wistarian 線' },
  { id: 'kamome-4-ijika', feed: 'tobacity/communitybus', route: 'かもめバス４小浜～石鏡港線', mode: 'bus', zh: '鷗巴士 4 號 小濱～石鏡港線（經海の博物館）' },
  { id: 'kamome-5-kuzaki', feed: 'tobacity/communitybus', route: 'かもめバス５鳥羽～国崎線', mode: 'bus', zh: '鷗巴士 5 號 鳥羽～國崎線（經相差）' },
  { id: 'toba-teikisen-toshi', feed: 'tobacity/teikisen', route: '鳥羽～答志', mode: 'ferry', zh: '鳥羽市營定期船 答志航線（和具、答志）' },
  { id: 'toba-teikisen-momotori', feed: 'tobacity/teikisen', route: '鳥羽～桃取', mode: 'ferry', zh: '鳥羽市營定期船 桃取航線' },
  { id: 'toba-teikisen-sugashima', feed: 'tobacity/teikisen', route: '鳥羽～菅島', mode: 'ferry', zh: '鳥羽市營定期船 菅島航線' },
  { id: 'toba-teikisen-kamishima', feed: 'tobacity/teikisen', route: '鳥羽～神島', mode: 'ferry', zh: '鳥羽市營定期船 神島航線' },
  { id: 'toba-teikisen-sakate', feed: 'tobacity/teikisen', route: '鳥羽～坂手', mode: 'ferry', zh: '鳥羽市營定期船 坂手航線' },
  { id: 'ago-teikisen', feed: 'shimacity/agowanteikisen', route: '和具～賢島航路', mode: 'ferry', zh: '英虞灣定期船（賢島～間崎島～和具）' },
];

const opts = {
  cache: path.join(os.tmpdir(), 'travel_helper-gtfs-cache'),
  refresh: false,
  retrieved: new Date().toISOString().slice(0, 10),
  only: null,
};
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a === '--cache') opts.cache = path.resolve(process.argv[++i]);
  else if (a === '--refresh') opts.refresh = true;
  else if (a === '--retrieved') opts.retrieved = process.argv[++i];
  else if (a === '--only') opts.only = new Set(process.argv[++i].split(','));
  else {
    console.error(`未知的參數：${a}`);
    process.exit(2);
  }
}
fs.mkdirSync(opts.cache, { recursive: true });

// ---------- 下載 feed ----------
async function getFeed(key) {
  const [org, feed] = key.split('/');
  const zip = path.join(opts.cache, `${org}-${feed}.zip`);
  const metaFile = path.join(opts.cache, `${org}-${feed}.meta.json`);
  if (opts.refresh || !fs.existsSync(zip) || !fs.existsSync(metaFile)) {
    const meta = await (await fetch(`${API}/${org}/feeds/${feed}`)).json();
    const file = meta.body.gtfs_files.find((f) => f.rid === 'current');
    const res = await fetch(file.gtfs_url);
    if (!res.ok) throw new Error(`${key}：下載失敗 ${res.status}`);
    fs.writeFileSync(zip, Buffer.from(await res.arrayBuffer()));
    fs.writeFileSync(metaFile, JSON.stringify(meta));
    await new Promise((r) => setTimeout(r, 1000));
  }
  const meta = JSON.parse(fs.readFileSync(metaFile, 'utf8')).body;
  return { feed: loadFeed(zip), meta };
}

// ---------- 附近的資料點 ----------
const hav = ([a, b], [c, d]) => {
  const r = Math.PI / 180;
  const x = Math.sin(((d - b) * r) / 2) ** 2 + Math.cos(b * r) * Math.cos(d * r) * Math.sin(((c - a) * r) / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(x));
};
const points = [];
for (const p of JSON.parse(fs.readFileSync(path.join(ROOT, 'data/stations.json'), 'utf8'))) points.push(p);
for (const area of ['ise', 'futami', 'toba', 'shima']) {
  const f = path.join(ROOT, `data/areas/${area}/spots.json`);
  if (fs.existsSync(f)) points.push(...JSON.parse(fs.readFileSync(f, 'utf8')));
}
const nearOf = (coords) =>
  points
    .map((p) => ({ id: p.id, meters: Math.round(hav(coords, p.coords)) }))
    .filter((x) => x.meters <= NEAR_METERS)
    .sort((a, b) => a.meters - b.meters)
    .slice(0, NEAR_MAX);

// ---------- 轉換一條路線 ----------
function convert(spec, { feed, meta }) {
  const route = feed.routes.find((r) => r.route_long_name === spec.route || r.route_short_name === spec.route);
  if (!route) throw new Error(`${spec.id}：feed ${spec.feed} 裡找不到路線「${spec.route}」`);
  const trips = feed.trips.filter((t) => t.route_id === route.route_id);
  const tripIds = new Set(trips.map((t) => t.trip_id));
  const times = new Map();
  for (const st of feed.stopTimes) {
    if (!tripIds.has(st.trip_id)) continue;
    if (!times.has(st.trip_id)) times.set(st.trip_id, []);
    times.get(st.trip_id).push(st);
  }
  for (const list of times.values()) list.sort((a, b) => Number(a.stop_sequence) - Number(b.stop_sequence));

  const days = tripDays(TRIP.from, TRIP.to, TRIP.holidays).map((d) => d.iso);
  const byType = tripsByDayType(feed, [...tripIds], days, new Set(TRIP.holidays));

  // 停留所：只收旅程中有班次停靠的
  const usedTrips = new Set(['weekday', 'saturday', 'holiday'].flatMap((k) => [...byType[k].trips.keys()]));
  const usedStops = new Set();
  for (const id of usedTrips) for (const st of times.get(id) ?? []) usedStops.add(st.stop_id);
  const stopInfo = new Map(feed.stops.map((s) => [s.stop_id, s]));
  const stops = [];
  const order = [];
  for (const id of usedTrips) for (const st of times.get(id) ?? []) if (!order.includes(st.stop_id)) order.push(st.stop_id);
  for (const id of order) {
    const s = stopInfo.get(id);
    const coords = [Number(s.stop_lon), Number(s.stop_lat)];
    const stop = { id, name: s.stop_name, coords };
    if (s.platform_code) stop.platform = s.platform_code;
    const near = nearOf(coords);
    if (near.length) stop.near = near;
    stops.push(stop);
  }

  const tripOut = (id) => {
    const t = trips.find((x) => x.trip_id === id);
    const list = times.get(id) ?? [];
    return {
      id,
      headsign: t.trip_headsign.replace(/^\d+\s+/, '') || list.at(-1)?.stop_headsign || null,
      dir: t.direction_id === '' ? null : Number(t.direction_id),
      stops: list.map((st, i) => [st.stop_id, i === 0 ? null : hhmm(st.arrival_time), i === list.length - 1 ? null : hhmm(st.departure_time)]),
    };
  };
  const firstDep = (t) => t.stops[0]?.[2] ?? '99:99';
  const out = {};
  for (const type of ['weekday', 'saturday', 'holiday']) {
    const { trips: m, dates } = byType[type];
    out[type] = [...m.entries()]
      .map(([id, ds]) => {
        const t = tripOut(id);
        if (ds.length !== dates.length) t.dates = ds; // 這個日別只有部分日子行駛
        return t;
      })
      .sort((a, b) => firstDep(a).localeCompare(firstDep(b)));
  }

  // 票價：附近有資料點的停留所（和起點、終點）之間；其他組合看官網或 GTFS
  const fareOf = new Map(feed.fareAttributes.map((f) => [f.fare_id, Number(f.price)]));
  const keyStops = stops.filter((s, i) => s.near || i === 0 || i === stops.length - 1);
  const zoneOf = (id) => stopInfo.get(id)?.zone_id || id;
  const rules = feed.fareRules.filter((r) => !r.route_id || r.route_id === route.route_id);
  const adult = {};
  for (const a of keyStops) {
    for (const b of keyStops) {
      if (a.id === b.id) continue;
      const r = rules.find((x) => x.origin_id === zoneOf(a.id) && x.destination_id === zoneOf(b.id));
      if (!r) continue;
      (adult[a.id] ??= {})[b.id] = fareOf.get(r.fare_id);
    }
  }

  const range = feedRange(feed);
  const file = meta.gtfs_files.find((f) => f.rid === 'current');
  const feedPage = `${API}/${meta.organization_id}/feeds/${meta.feed_id}`;
  return {
    id: spec.id,
    mode: spec.mode,
    operator: FEEDS[spec.feed].operator,
    name: { ja: route.route_long_name || route.route_short_name, zh: spec.zh },
    validFrom: range.from,
    validTo: range.to,
    retrieved: opts.retrieved,
    feed: {
      id: spec.feed,
      version: feed.feedInfo[0]?.feed_version ?? null,
      published: file?.published_at?.slice(0, 10) ?? null,
      license: meta.feed_license,
      credit: `${meta.organization_name}（GTFS-JP、${meta.feed_license}）`,
    },
    dayTypeBasis: byType.basis.map((b) => [b.date, b.type, b.ref]),
    stops,
    trips: out,
    fares: { currency: 'JPY', adult, child: null, note: '只列附近有車站、景點的停留所（和起訖站）之間的大人票價；兒童票見 notes' },
    notes: null,
    sources: [
      { type: 'official', url: feedPage, retrieved: opts.retrieved, note: `GTFS-JP「${meta.feed_name}」（${meta.feed_license}），feed 期間 ${range.from}～${range.to}` },
      { type: 'official', url: FEEDS[spec.feed].page, retrieved: opts.retrieved, note: `${FEEDS[spec.feed].operator} 官網` },
    ],
  };
}

// 每班車、每個停留所、每列票價一行，檔案才不會太長
function format(doc) {
  const keep = [];
  const mark = (v) => {
    keep.push(JSON.stringify(v));
    return `@@${keep.length - 1}@@`;
  };
  const d = structuredClone(doc);
  d.dayTypeBasis = d.dayTypeBasis.map(mark);
  d.stops = d.stops.map(mark);
  for (const k of Object.keys(d.trips)) d.trips[k] = d.trips[k].map(mark);
  for (const k of Object.keys(d.fares.adult)) d.fares.adult[k] = mark(d.fares.adult[k]);
  return JSON.stringify(d, null, 2).replace(/"@@(\d+)@@"/g, (_, i) => keep[i]) + '\n';
}

// ---------- 主程式 ----------
const feeds = new Map();
const written = [];
for (const spec of ROUTES) {
  if (opts.only && !opts.only.has(spec.id)) continue;
  if (!feeds.has(spec.feed)) feeds.set(spec.feed, await getFeed(spec.feed));
  const doc = convert(spec, feeds.get(spec.feed));
  const outFile = path.join(ROOT, 'data/timetables', spec.mode, `${spec.id}.json`);
  // 人工補的欄位（票價的兒童票、notes、其他來源）保留
  if (fs.existsSync(outFile)) {
    const old = JSON.parse(fs.readFileSync(outFile, 'utf8'));
    doc.fares.child = old.fares?.child ?? null;
    doc.fares.note = old.fares?.note ?? doc.fares.note;
    doc.notes = old.notes ?? null;
    if (old.passes) doc.passes = old.passes;
    const extra = (old.sources ?? []).filter((s) => !doc.sources.some((n) => n.url === s.url));
    doc.sources.push(...extra);
  }
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, format(doc));
  const n = (k) => doc.trips[k].length;
  written.push(`${spec.mode}/${spec.id}：停留所 ${doc.stops.length}，班次 平日 ${n('weekday')}／土曜 ${n('saturday')}／日祝 ${n('holiday')}（feed 到 ${doc.validTo}）`);
}
console.log(written.join('\n'));
