// scripts/lib/anchor-rules.mjs 的測試。執行：npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isWalkRegion, needsCarMap, pairRule } from '../lib/anchor-rules.mjs';

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

test('個別組合：真的要繞的照 OSRM、離島的店只和同島的點算（T9e）', () => {
  assert.equal(pairRule('toba-nishikiya', 'toba-seaside-hotel'), 'osrm');
  assert.equal(pairRule('shima-rias-by-cococha', 'kashikojima'), 'osrm');
  assert.equal(pairRule('shima-sushi-yuzen', 'kashikojima'), 'skip');
  assert.equal(pairRule('shima-sushi-yuzen', 'shima-mazakijima'), null);
  assert.equal(pairRule('shima-fukujuso-dining', 'shima-anorisaki-lighthouse'), 'skip');
  assert.equal(pairRule('shima-fukujuso-dining', 'shima-fukujuso'), null);
  assert.equal(pairRule('kashikojima', 'shima-rias-by-cococha'), null); // 有方向
});

test('點、子地區層級的真繞路（T9e）', () => {
  assert.equal(pairRule('shima-marena-french', 'shima-hiougiso'), 'osrm');
  assert.equal(pairRule('shima-la-mer', 'shima-chichukaimura-hotel', { from: 'shima-kashikojima', to: 'shima-sakko' }), 'osrm');
  assert.equal(pairRule('shima-la-mer', 'shima-chichukaimura-hotel', { from: 'shima-sakko', to: 'shima-kashikojima' }), 'osrm');
  assert.equal(pairRule('shima-la-mer', 'shima-michishio', { from: 'shima-kashikojima', to: 'shima-kashikojima' }), null);
});
