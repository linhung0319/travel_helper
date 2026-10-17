#!/usr/bin/env node
// 驗證 data/ 下所有 JSON：
//   1. 符合 schema/ 裡對應的 JSON Schema（每筆資料都要有 sources）
//   2. 資料點 ID 全專案唯一
//   3. 座標落在範圍內（伊勢志摩；機場交通檔案放寬到關西、中部）
//   4. 引用的 ID（最近車站、anchors、轉乘車站…）都存在
//   5. region 在 areas.json 該區域的 regions 裡
//
// 用法：node scripts/validate.mjs [--data <dir>] [--schema <dir>]
//       或 npm run validate、scripts/validate

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import localizeZhTW from 'ajv-i18n/localize/zh-TW/index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function parseArgs(argv) {
  const opts = { data: path.join(ROOT, 'data'), schema: path.join(ROOT, 'schema') };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--data') opts.data = path.resolve(argv[++i]);
    else if (argv[i] === '--schema') opts.schema = path.resolve(argv[++i]);
    else {
      console.error(`未知的參數：${argv[i]}`);
      process.exit(2);
    }
  }
  return opts;
}

// [西經度, 南緯度, 東經度, 北緯度]
const BBOX_ISESHIMA = [136.5, 34.2, 137.1, 34.65];
const BBOX_WIDE = [134.9, 33.8, 137.3, 35.4]; // 關西機場、大阪、名古屋都在內

// 依路徑決定用哪個 schema。cache/、derived/ 只檢查 JSON 格式。
const ROUTES = [
  { re: /^areas\.json$/, schema: 'area', kind: 'areas' },
  { re: /^stations\.json$/, schema: 'station', kind: 'points' },
  { re: /^areas\/(ise|futami|toba|shima|kix)\/spots\.json$/, schema: 'spot', kind: 'points' },
  { re: /^areas\/(ise|futami|toba|shima|kix)\/lodging\.json$/, schema: 'lodging', kind: 'points' },
  { re: /^areas\/(ise|futami|toba|shima|kix)\/restaurants\.json$/, schema: 'restaurant', kind: 'points' },
  { re: /^timetables\/kintetsu\/_travel-times\.json$/, schema: 'kintetsu-travel-times', kind: 'travel-times' },
  { re: /^timetables\/kintetsu\/_[a-z0-9-]+\.json$/, schema: 'sourced-document', kind: 'doc' },
  { re: /^timetables\/kintetsu\/[a-z0-9-]+\.json$/, schema: 'timetable-kintetsu', kind: 'timetable' },
  { re: /^timetables\/bus\/[a-z0-9-]+\.json$/, schema: 'sourced-document', kind: 'doc' },
  { re: /^passes\.json$/, schema: 'passes', kind: 'doc' },
  { re: /^access\/[a-z0-9-]+\.json$/, schema: 'access', kind: 'doc', bbox: BBOX_WIDE },
  { re: /^cache\//, schema: null, kind: 'cache' },
  { re: /^derived\//, schema: null, kind: 'cache' }, // 腳本產生（分數、分級），只檢查 JSON 格式
  { re: /^raw\/(ise|futami|toba|shima|kix)\/candidates\/(spots|lodging|restaurants)\.json$/, schema: 'candidate', kind: 'candidates' },
];

function walk(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...walk(p));
    else if (ent.name.endsWith('.json')) out.push(p);
  }
  return out;
}

function inBbox([lon, lat], [w, s, e, n]) {
  return lon >= w && lon <= e && lat >= s && lat <= n;
}

function loadSchemas(schemaDir) {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  const validators = {};
  for (const f of fs.readdirSync(schemaDir).filter((f) => f.endsWith('.schema.json'))) {
    ajv.addSchema(JSON.parse(fs.readFileSync(path.join(schemaDir, f), 'utf8')), f);
  }
  for (const f of fs.readdirSync(schemaDir).filter((f) => f.endsWith('.schema.json'))) {
    validators[f.replace('.schema.json', '')] = ajv.getSchema(f);
  }
  return validators;
}

// anyOf 失敗時 ajv 會把每個分支的錯誤都列出來；留下最具體的那幾個
function pruneAjvErrors(errs) {
  return errs.filter((e) => {
    if (e.keyword === 'anyOf') return false;
    if (e.keyword === 'type' && e.params.type === 'null') {
      return !errs.some((o) => o !== e && o.keyword !== 'anyOf' && o.instancePath.startsWith(e.instancePath));
    }
    return true;
  });
}

function formatAjvError(e, data) {
  // 把 /3/name/ja 這種路徑補上那筆資料的 id，方便找
  const m = e.instancePath.match(/^\/(\d+)(\/.*)?$/);
  let where = e.instancePath || '(根)';
  if (m && Array.isArray(data) && data[+m[1]]?.id) where = `[${data[+m[1]].id}]${m[2] ?? ''}`;
  let msg = e.message;
  if (e.keyword === 'unevaluatedProperties' || e.keyword === 'additionalProperties') {
    const prop = e.params.unevaluatedProperty ?? e.params.additionalProperty;
    msg = `有 schema 沒定義的欄位「${prop}」（暫時放進 extra，或到 docs/requests.md 提出）`;
  } else if (e.keyword === 'enum') {
    msg = `必須是 ${JSON.stringify(e.params.allowedValues)} 其中之一`;
  } else if (e.keyword === 'required') {
    msg = `缺少必填欄位「${e.params.missingProperty}」`;
  }
  return `${where}：${msg}`;
}

// 找出物件裡所有 coords（給格式還沒定的檔案用）
function* findCoords(node, p = '') {
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) yield* findCoords(node[i], `${p}/${i}`);
  } else if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) {
      if (k === 'coords' && Array.isArray(v) && v.length === 2 && v.every((x) => typeof x === 'number')) {
        yield { path: `${p}/coords`, coords: v };
      } else {
        yield* findCoords(v, `${p}/${k}`);
      }
    }
  }
}

function* findRetrieved(node, p = '') {
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) yield* findRetrieved(node[i], `${p}/${i}`);
  } else if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) {
      if (k === 'retrieved' && typeof v === 'string') yield { path: `${p}/retrieved`, value: v };
      else yield* findRetrieved(v, `${p}/${k}`);
    }
  }
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const validators = loadSchemas(opts.schema);
  const errors = [];
  const warnings = [];
  const err = (file, msg) => errors.push(`${file}：${msg}`);
  const warn = (file, msg) => warnings.push(`${file}：${msg}`);
  const today = new Date().toISOString().slice(0, 10);

  const files = walk(opts.data).sort();
  const points = new Map(); // id → { file, record }
  const areas = new Map();
  const loaded = [];

  for (const abs of files) {
    const rel = path.relative(opts.data, abs).split(path.sep).join('/');
    const shown = `data/${rel}`;
    let data;
    try {
      data = JSON.parse(fs.readFileSync(abs, 'utf8').replace(/^﻿/, ''));
    } catch (e) {
      err(shown, `不是合法的 JSON（${e.message}）`);
      continue;
    }
    const route = ROUTES.find((r) => r.re.test(rel));
    if (!route) {
      err(shown, '不在 CONVENTIONS.md 規定的位置，沒有對應的 schema');
      continue;
    }
    if (route.kind === 'cache') continue;

    const validate = validators[route.schema];
    if (!validate) {
      err(shown, `找不到 schema/${route.schema}.schema.json`);
      continue;
    }
    if (!validate(data)) {
      localizeZhTW(validate.errors);
      for (const e of pruneAjvErrors(validate.errors)) err(shown, formatAjvError(e, data));
    }

    for (const r of findRetrieved(data)) {
      if (!Number.isNaN(Date.parse(r.value)) && r.value > today) warn(shown, `${r.path} 的取得日期 ${r.value} 在未來`);
    }

    if (route.kind === 'points' && Array.isArray(data)) {
      const areaInPath = rel.match(/^areas\/([^/]+)\//)?.[1];
      for (const rec of data) {
        if (!rec || typeof rec !== 'object' || typeof rec.id !== 'string') continue;
        if (points.has(rec.id)) err(shown, `ID「${rec.id}」重複（也出現在 ${points.get(rec.id).file}）`);
        else points.set(rec.id, { file: shown, record: rec });
        if (areaInPath && rec.area && rec.area !== areaInPath) {
          err(shown, `[${rec.id}] 的 area 是「${rec.area}」，但檔案放在 areas/${areaInPath}/`);
        }
      }
    } else if (route.kind === 'areas' && Array.isArray(data)) {
      for (const a of data) {
        if (!a?.id) continue;
        if (areas.has(a.id)) err(shown, `區域 ID「${a.id}」重複`);
        else areas.set(a.id, a);
      }
    } else if (route.kind === 'timetable') {
      const expected = path.basename(rel, '.json');
      if (data?.station && data.station !== expected) {
        err(shown, `station 是「${data.station}」，但檔名是 ${expected}.json`);
      }
    }
    loaded.push({ shown, rel, route, data });
  }

  // 座標與引用檢查（要等所有檔案都讀完）
  const checkRef = (shown, owner, field, id) => {
    if (id && !points.has(id)) err(shown, `[${owner}] ${field} 引用的「${id}」不存在`);
  };

  for (const { shown, rel, route, data } of loaded) {
    if (route.kind === 'points' && Array.isArray(data)) {
      for (const rec of data) {
        if (!rec?.id) continue;
        if (Array.isArray(rec.coords) && rec.coords.length === 2) {
          // 關西機場周邊（kix）不在伊勢志摩，放寬到關西、中部
          const range = rec.area === 'kix' ? BBOX_WIDE : BBOX_ISESHIMA;
          if (!inBbox(rec.coords, range)) {
            const swapped = inBbox([rec.coords[1], rec.coords[0]], range);
            err(shown, `[${rec.id}] 座標 ${JSON.stringify(rec.coords)} 不在${rec.area === 'kix' ? '關西、中部' : '伊勢志摩'}範圍內${swapped ? '（經緯度可能寫反了，應該是 [經度, 緯度]）' : ''}`);
          } else if (areas.has(rec.area) && !inBbox(rec.coords, areas.get(rec.area).bbox)) {
            warn(shown, `[${rec.id}] 座標不在區域「${rec.area}」的大致範圍內，請確認 area 是否正確`);
          }
        }
        if (rec.area && areas.size && !areas.has(rec.area)) err(shown, `[${rec.id}] 區域「${rec.area}」不在 areas.json`);
        if (rec.region && areas.has(rec.area) && !(areas.get(rec.area).regions ?? []).some((g) => g.id === rec.region)) {
          err(shown, `[${rec.id}] region「${rec.region}」不在 areas.json 區域「${rec.area}」的 regions 裡`);
        }
        const rec5 = rec.assessment?.scores?.recommend;
        if (rec.assessment && rec5 != null) {
          const tier = rec5 === 5 ? 'S' : rec5 === 4 ? 'A' : 'B';
          if (rec.tier !== tier) err(shown, `[${rec.id}] tier 應該是「${tier}」（assessment.scores.recommend ${rec5}）`);
        }
        checkRef(shown, rec.id, 'nearestStation', rec.nearestStation?.id);
        for (const a of rec.access ?? []) checkRef(shown, rec.id, 'access.from', a?.from);
        for (const a of rec.anchors ?? []) checkRef(shown, rec.id, 'anchors', a?.id);
        for (const t of rec.transfers ?? []) checkRef(shown, rec.id, 'transfers', t);
        for (const c of rec.group?.nearbyCombos ?? []) checkRef(shown, rec.id, 'group.nearbyCombos', c);
        if (rec.nearestStation?.id && points.get(rec.nearestStation.id)?.record.type !== 'station' && points.has(rec.nearestStation.id)) {
          err(shown, `[${rec.id}] nearestStation「${rec.nearestStation.id}」不是車站`);
        }
      }
    } else if (route.kind === 'areas' && Array.isArray(data)) {
      for (const a of data) {
        if (!a?.id) continue;
        for (const s of a.stations ?? []) {
          checkRef(shown, a.id, 'stations', s);
          const st = points.get(s)?.record;
          if (st && st.area !== a.id) err(shown, `[${a.id}] 列出的車站「${s}」的 area 是「${st.area}」`);
        }
        if (Array.isArray(a.center) && Array.isArray(a.bbox) && !inBbox(a.center, a.bbox)) {
          err(shown, `[${a.id}] center 不在 bbox 內`);
        }
      }
    } else if (route.kind === 'timetable') {
      if (data?.station && points.size && points.get(data.station)?.record.type !== 'station') {
        err(shown, `station「${data.station}」不在 stations.json`);
      }
    } else if (route.kind === 'candidates' && Array.isArray(data)) {
      // 候選清單：key 唯一、納入的要有 pointId 而且存在、region 在該區域的 regions 裡
      const area = areas.get(rel.split('/')[1]);
      const keys = new Set();
      // 候選階段（例如 T8c）資料檔還沒建立：included 沒有 pointId 只警告；資料檔存在後才算錯誤
      const dataFile = path.join(opts.data, 'areas', rel.split('/')[1], path.basename(rel));
      const dataExists = fs.existsSync(dataFile);
      for (const c of data) {
        if (!c?.key) continue;
        if (keys.has(c.key)) err(shown, `候選 key「${c.key}」重複`);
        keys.add(c.key);
        if (c.status === 'included' && !c.pointId) {
          (dataExists ? err : warn)(shown, `[${c.key}] status 是 included，但沒有 pointId${dataExists ? '' : '（資料檔還沒建立）'}`);
        }
        checkRef(shown, c.key, 'pointId', c.pointId);
        if (c.region && area && !(area.regions ?? []).some((g) => g.id === c.region)) {
          err(shown, `[${c.key}] region「${c.region}」不在 areas.json 區域「${area.id}」的 regions 裡`);
        }
      }
    } else if (route.kind === 'doc') {
      const bbox = route.bbox ?? BBOX_ISESHIMA;
      for (const c of findCoords(data)) {
        if (!inBbox(c.coords, bbox)) err(shown, `${c.path} 座標 ${JSON.stringify(c.coords)} 超出範圍`);
      }
    }
  }

  // 近鐵：_travel-times.json 的停站都在 stations.json；各站時刻表的 trainNo 都在 trains 裡，而且發車時刻一致
  const tt = loaded.find((l) => l.route.kind === 'travel-times');
  if (tt?.data?.trains) {
    for (const day of ['weekday', 'holiday']) {
      for (const [no, t] of Object.entries(tt.data.trains[day] ?? {})) {
        for (const [st] of t?.stops ?? []) {
          if (points.size && points.get(st)?.record.type !== 'station') {
            err(tt.shown, `trains.${day}.${no} 的停站「${st}」不在 stations.json`);
          }
        }
      }
    }
    for (const { shown, route, data } of loaded) {
      if (route.kind !== 'timetable' || !data?.directions) continue;
      for (const [dir, days] of Object.entries(data.directions)) {
        for (const day of ['weekday', 'holiday']) {
          for (const d of days?.[day] ?? []) {
            if (!d?.trainNo) continue;
            const train = tt.data.trains[day]?.[d.trainNo];
            if (!train) {
              err(shown, `${dir}.${day} ${d.dep} 的 trainNo「${d.trainNo}」不在 _travel-times.json 的 trains.${day}`);
              continue;
            }
            const stop = train.stops?.find((s) => s[0] === data.station);
            if (stop && stop[2] !== d.dep) {
              err(shown, `${dir}.${day} trainNo「${d.trainNo}」發車 ${d.dep}，但 _travel-times.json 寫 ${stop[2]}`);
            }
          }
        }
      }
    }
  }

  // 每個車站都要被某個區域列出
  for (const [id, { file, record }] of points) {
    if (record.type !== 'station') continue;
    const listed = [...areas.values()].some((a) => a.stations?.includes(id));
    if (areas.size && !listed) warn(file, `[${id}] 沒有被 areas.json 的任何區域列出`);
  }

  const counts = {};
  for (const { record } of points.values()) counts[record.type] = (counts[record.type] ?? 0) + 1;
  const summary = Object.entries(counts).map(([t, n]) => `${t} ${n}`).join('、') || '無';

  for (const w of warnings) console.log(`⚠️  ${w}`);
  for (const e of errors) console.log(`❌ ${e}`);
  console.log(
    `\n檢查了 ${files.length} 個檔案；資料點：${summary}；區域 ${areas.size} 個。` +
      `錯誤 ${errors.length}、警告 ${warnings.length}。`,
  );
  if (errors.length) {
    console.log('驗證失敗。');
    process.exit(1);
  }
  console.log('驗證通過。');
}

main();
