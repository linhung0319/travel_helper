// Worker 的驗證程式（scripts/build-validators.mjs 產生）要和 schema/ 一致，而且和 validate 的結果相同

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { WORKER_DIR } from './helpers/d1.ts';
// @ts-expect-error 沒有型別宣告的 .mjs
import { generate, OUT } from '../../scripts/build-validators.mjs';
import { validatePlace } from '../src/lib/validate.ts';

const ROOT = path.resolve(WORKER_DIR, '..');

test('產生的驗證程式和 schema/ 一致（不一致就跑 npm run build:validators）', () => {
  assert.equal(fs.readFileSync(OUT, 'utf8'), generate(), 'worker/src/generated/place-validators.js 過期了');
});

test('產生的程式沒有 require、import（Worker 直接用）', () => {
  const code = fs.readFileSync(OUT, 'utf8');
  assert.doesNotMatch(code, /require\(|^import /m);
});

test('真的資料全部通過；區域不寫死（不在五個區域裡的 area 也通過 schema）', () => {
  for (const area of fs.readdirSync(path.join(ROOT, 'data/areas'))) {
    for (const f of ['spots.json', 'lodging.json', 'restaurants.json']) {
      const p = path.join(ROOT, 'data/areas', area, f);
      if (!fs.existsSync(p)) continue;
      for (const rec of JSON.parse(fs.readFileSync(p, 'utf8'))) assert.deepEqual(validatePlace(rec.type, rec), [], `${rec.id}`);
    }
  }
  const st = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/stations.json'), 'utf8'))[0];
  assert.deepEqual(validatePlace('station', { ...st, area: 'osaka' }), []);
});

test('錯誤：多的欄位、型別不對、不認得的類別', () => {
  const st = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/stations.json'), 'utf8'))[0];
  assert.match(validatePlace('station', { ...st, foo: 1 })[0].message, /沒定義的欄位「foo」/);
  assert.equal(validatePlace('station', { ...st, coords: 'x' })[0].path, '/coords');
  assert.match(validatePlace('area', st)[0].message, /不認得的類別/);
});
