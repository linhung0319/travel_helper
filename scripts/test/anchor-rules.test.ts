// scripts/lib/anchor-rules.mjs 的測試。執行：npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isWalkRegion, needsCarMap } from '../lib/anchor-rules.mjs';

const areas = [
  { id: 'toba', regions: [{ id: 'toba-station', needsCar: false }, { id: 'osatsu', needsCar: true }, { id: 'uramura', needsCar: true }] },
  { id: 'ise', regions: [{ id: 'ise-geku', needsCar: false }, { id: 'ise-outskirts', needsCar: true }] },
  { id: 'futami', regions: [{ id: 'futami-okitama', needsCar: false }] },
];
const m = needsCarMap(areas);

test('鳥羽照手寫清單（相差 needsCar 但算步行圈）', () => {
  assert.equal(isWalkRegion('toba', 'osatsu', m), true);
  assert.equal(isWalkRegion('toba', 'uramura', m), false);
  assert.equal(isWalkRegion('toba', '鳥羽站周邊', m), true);
});

test('其他區域照 areas.json 的 needsCar', () => {
  assert.equal(isWalkRegion('ise', 'ise-geku', m), true);
  assert.equal(isWalkRegion('ise', 'ise-outskirts', m), false);
  assert.equal(isWalkRegion('futami', 'futami-okitama', m), true);
  assert.equal(isWalkRegion('ise', 'unknown-region', m), false);
});
