#!/usr/bin/env node
// 把 schema/ 編譯成 Worker 用的驗證程式（ajv standalone，architecture §3.2）。
// Worker 不能執行 new Function，所以先在這裡產生 JS，再由 Worker import。
//
// 用法：npm run build:validators           產生 worker/src/generated/place-validators.js
//       npm run build:validators -- --check  只比對，和 schema/ 不一致就失敗（測試也會檢查）
//
// - 每個資料點類別一個驗證函式（schema 的 items）：station、spot、lodging、restaurant
// - areaId 和 validate 一樣放寬成一般的 ID 格式（scripts/lib/schemas.mjs），區域不寫死
// - format 只用到 date，用正規表示式代替 ajv-formats，Worker 不用多帶一個套件
// - ajv 產生的程式會 require 兩個小函式（字串長度、深層相等），直接換成內嵌的版本，產生的檔案沒有任何 import

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import standaloneCode from 'ajv/dist/standalone/index.js';
import { loadSchemaDocs } from './lib/schemas.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const OUT = path.join(ROOT, 'worker/src/generated/place-validators.js');
export const PLACE_TYPES = ['station', 'spot', 'lodging', 'restaurant'];

const RUNTIME = {
  'ajv/dist/runtime/ucs2length': `function __ucs2length(str) {
  // 和 ajv 的 runtime/ucs2length 相同：代理對（surrogate pair）算一個字
  const len = str.length;
  let length = 0;
  let pos = 0;
  let value;
  while (pos < len) {
    length++;
    value = str.charCodeAt(pos++);
    if (value >= 0xd800 && value <= 0xdbff && pos < len) {
      value = str.charCodeAt(pos);
      if ((value & 0xfc00) === 0xdc00) pos++;
    }
  }
  return length;
}`,
  'ajv/dist/runtime/equal': `function __equal(a, b) {
  // 和 ajv 的 runtime/equal（fast-deep-equal）相同，只用在 JSON 值
  if (a === b) return true;
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    if (Array.isArray(a)) {
      if (!Array.isArray(b) || a.length !== b.length) return false;
      for (let i = 0; i < a.length; i++) if (!__equal(a[i], b[i])) return false;
      return true;
    }
    if (Array.isArray(b)) return false;
    const keys = Object.keys(a);
    if (keys.length !== Object.keys(b).length) return false;
    for (const k of keys) if (!Object.prototype.hasOwnProperty.call(b, k) || !__equal(a[k], b[k])) return false;
    return true;
  }
  return a !== a && b !== b;
}`,
};
const RUNTIME_NAME = { 'ajv/dist/runtime/ucs2length': '__ucs2length', 'ajv/dist/runtime/equal': '__equal' };

export function generate(schemaDir = path.join(ROOT, 'schema')) {
  const ajv = new Ajv2020({ allErrors: true, strict: false, code: { source: true, esm: true, lines: false } });
  ajv.addFormat('date', /^\d{4}-\d{2}-\d{2}$/);
  for (const { file, schema } of loadSchemaDocs(schemaDir)) ajv.addSchema(schema, file);
  const refs = Object.fromEntries(PLACE_TYPES.map((t) => [t, `${t}.schema.json#/items`]));
  let code = standaloneCode.default(ajv, refs);

  const used = new Set();
  code = code.replace(/require\("([^"]+)"\)\.default/g, (_, mod) => {
    if (!RUNTIME[mod]) throw new Error(`ajv 產生的程式用到沒有內嵌的 ${mod}：請在 build-validators.mjs 的 RUNTIME 補上`);
    used.add(mod);
    return RUNTIME_NAME[mod];
  });
  if (/require\(/.test(code)) throw new Error('ajv 產生的程式還有 require()，Worker 不能用');
  code = code.replace(/^"use strict";/, '');

  return [
    '// 由 scripts/build-validators.mjs 從 schema/ 產生，不要手改。schema 改了之後跑 npm run build:validators',
    '/* eslint-disable */',
    ...[...used].sort().map((m) => RUNTIME[m]),
    code,
    '',
  ].join('\n');
}

function main() {
  const check = process.argv.includes('--check');
  const code = generate();
  if (check) {
    const cur = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
    if (cur !== code) {
      console.error(`${path.relative(ROOT, OUT)} 和 schema/ 不一致：請跑 npm run build:validators`);
      process.exit(1);
    }
    console.log('驗證程式和 schema/ 一致。');
    return;
  }
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, code);
  console.log(`寫入 ${path.relative(ROOT, OUT)}（${(code.length / 1024).toFixed(0)} KB）`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
