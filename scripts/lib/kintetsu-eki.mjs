// 近鐵官網時刻表（eki.kintetsu.co.jp/norikae/）的抓取和解析（T87 從 kintetsu-osaka.mjs 抽出來共用）。
//   T5：某站某方向的發車時刻表（平日 dw=0、土休日 dw=1）
//   T7：某班列車從該站之後的停站與到發時刻；tx 是列車編號，各站共用
// 只抓一般看得到的網頁，請求之間有間隔；抓過的頁面快取在 cache 目錄（和 kintetsu-timetable.mjs、kintetsu-osaka.mjs 同一個預設目錄）。

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

export const EKI = 'https://eki.kintetsu.co.jp/norikae/';
export const DEFAULT_CACHE = path.join(os.tmpdir(), 'travel_helper-kintetsu-cache');

export function makeGet({ cache = DEFAULT_CACHE, delay = 1500 } = {}) {
  fs.mkdirSync(cache, { recursive: true });
  let lastFetch = 0;
  return async function get(url) {
    const file = path.join(cache, crypto.createHash('sha1').update(url).digest('hex') + '.html');
    if (fs.existsSync(file)) return fs.readFileSync(file, 'utf8');
    const wait = lastFetch + delay - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastFetch = Date.now();
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (travel_helper personal trip planning)' } });
    if (!res.ok) throw new Error(`${res.status} ${url}`);
    const html = new TextDecoder('shift_jis').decode(Buffer.from(await res.arrayBuffer()));
    fs.writeFileSync(file, html);
    return html;
  };
}

export const t5url = (slCode, d, dw) => `${EKI}T5?USR=PC&slCode=${slCode}&d=${d}&dw=${dw}`;
const decode = (s) => s.replace(/&nbsp;/g, ' ').replace(/<[^>]*>/g, '').trim();

/** T5：每班的列車編號、發車時刻、車種、終點（日文）、T7 連結 */
export function parseT5(html) {
  const validFrom = html.match(/(\d{4})年(\d{1,2})月(\d{1,2})日現在/);
  const remarks = html.match(/<div class="remarks">([\s\S]*?)<\/div>\s*<\/td>/)?.[1] ?? '';
  const typeByClass = {};
  const noteText = {};
  for (const m of remarks.matchAll(/<div class="(K_\d+)"><div class=min>\d+(?:<span class="note">([^<]*)<\/span>)?<\/div>([^<]*)<\/div>/g)) {
    const label = decode(m[3]);
    typeByClass[m[1]] ??= label.includes('しまかぜ') ? 'しまかぜ' : label.replace(/\s+/g, '');
    if (m[2]) noteText[m[2]] = label;
  }
  const abbr = {};
  for (const m of decode(remarks.replace(/<div[\s\S]*?<\/div>\s*<\/div>/g, '')).matchAll(/([^\s＝]+)＝([^\s＝]+)/g)) {
    if (!/^(UL|ISL|V|AL|H|■|●)$/.test(m[1])) abbr[m[1]] = m[2];
  }
  const abbrKeys = Object.keys(abbr).sort((a, b) => b.length - a.length);
  const deps = [];
  let hour = null;
  let prevHour = -1;
  const re =
    /<td align="center" style="width:40px[^"]*"[^>]*><b>(\d+)<\/b><\/td>|<A HREF="(T7\?sf=(\d+)&tx=([^&]+)&dw=(\d)&time=\d+)"><div class="(K_\d+)">([^<]*)((?:<font[^>]*>[^<]*<\/font>)?)\s*<br>\s*<DIV class=min>(\d+)(?:<span class="note">([^<]*)<\/span>)?/g;
  for (const m of html.matchAll(re)) {
    if (m[1] !== undefined) {
      hour = Number(m[1]);
      if (hour < prevHour) hour += 24;
      prevHour = hour;
      continue;
    }
    const [, , href, , tx, , cls, cell, , min, note] = m;
    const label = cell.trim();
    const key = abbrKeys.find((k) => label.startsWith(k));
    deps.push({
      trainNo: tx,
      dep: `${String(hour).padStart(2, '0')}:${min}`,
      type: typeByClass[cls] ?? null,
      toJa: key ? abbr[key] : null,
      note: note && noteText[note] ? noteText[note] : null,
      t7: EKI + href,
    });
  }
  return {
    validFrom: validFrom ? `${validFrom[1]}-${validFrom[2].padStart(2, '0')}-${validFrom[3].padStart(2, '0')}` : null,
    deps,
  };
}

/** T7：列車停站 [{ name, arr, dep }]；過了午夜寫 24:xx */
export function parseT7(html) {
  const stops = [];
  const body = html.replace(/<script[\s\S]*?<\/script>/gi, '');
  for (const row of body.split(/<tr[\s>]/i).slice(1)) {
    const m = [null, ...[...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((x) => x[1])];
    if (m.length !== 4) continue;
    const name = decode(m[1]);
    const t = (s) => {
      const x = decode(s).replace('：', ':');
      return /^\d{1,2}:\d{2}$/.test(x) ? x.padStart(5, '0') : null;
    };
    if (!name || name === '停車駅') continue;
    const arr = t(m[2]);
    const dep = t(m[3]);
    if (!arr && !dep) continue;
    stops.push({ name, arr, dep });
  }
  const wrap = (x) => (x && Number(x.slice(0, 2)) < 3 ? `${String(Number(x.slice(0, 2)) + 24)}${x.slice(2)}` : x);
  for (const s of stops) {
    s.arr = wrap(s.arr);
    s.dep = wrap(s.dep);
  }
  return stops;
}
