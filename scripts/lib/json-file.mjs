// 讀寫資料檔（JSON）：保留原本的換行（CRLF／LF），縮排固定 2 格，結尾一個換行。
// 工作目錄裡的資料檔是 CRLF（core.autocrlf），直接 JSON.stringify 寫回會讓整個檔案都變。

import fs from 'node:fs';

export function readJson(file) {
  const raw = fs.readFileSync(file, 'utf8').replace(/^﻿/, '');
  return { data: JSON.parse(raw), eol: raw.includes('\r\n') ? '\r\n' : '\n' };
}

export function writeJson(file, data, eol = '\n') {
  let out = JSON.stringify(data, null, 2) + '\n';
  if (eol === '\r\n') out = out.replace(/\n/g, '\r\n');
  fs.writeFileSync(file, out);
}

// 一行一筆的 JSON（Chrome 抽取結果）；空行、// 開頭的行略過
export function readJsonl(file) {
  if (!fs.existsSync(file)) return [];
  return fs
    .readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.trim() && !l.trim().startsWith('//'))
    .map((l, i) => {
      try {
        return JSON.parse(l);
      } catch (e) {
        throw new Error(`${file} 第 ${i + 1} 行不是 JSON：${e.message}`);
      }
    });
}

// 用 a.b.c 的路徑讀寫物件
export function getPath(obj, p) {
  return p.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

export function setPath(obj, p, value) {
  const keys = p.split('.');
  let o = obj;
  for (const k of keys.slice(0, -1)) {
    if (o[k] == null || typeof o[k] !== 'object') o[k] = {};
    o = o[k];
  }
  o[keys.at(-1)] = value;
}

export const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
