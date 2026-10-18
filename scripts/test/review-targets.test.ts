// scripts/review-targets.mjs 的測試。執行：npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { restaurantTier, keywordsFor, makeBatches, READ_MARK } from '../review-targets.mjs';

test('餐廳的優先順序', () => {
  assert.equal(restaurantTier({ group: { fit15: 'split' }, ratings: { tabelog: 3.1 } }), 1);
  assert.equal(restaurantTier({ group: { fit15: 'no' }, ratings: { tabelog: 3.4 } }), 2);
  assert.equal(restaurantTier({ group: { fit15: 'unknown' }, ratings: { tabelog: 3.2, google: 4.3, googleReviews: 100 } }), 3);
  assert.equal(restaurantTier({ group: { fit15: 'unknown' }, ratings: { tabelog: 3.2, google: 4.5, googleReviews: 99 } }), null);
});

test('餐廳的關鍵字照 null／unknown 欄位', () => {
  const full = { kids: { allowed: 'yes' }, group: { fit15: 'yes', source: '食べログ' }, seating: ['table'], accessibility: { barrierFree: null, note: '路面店' } };
  assert.deepEqual(keywordsFor('restaurant', full), ['中止', '冬']);
  const lack = { kids: { allowed: null }, group: { fit15: 'split' }, seating: [], accessibility: null };
  assert.deepEqual(keywordsFor('restaurant', lack), ['中止', '冬', '子供', '子連れ', '団体', '予約', '階段', '2階', '座敷']);
  const twoF = { ...full, accessibility: { barrierFree: null, note: '宴會在 2 樓' } };
  assert.deepEqual(keywordsFor('restaurant', twoF), ['中止', '冬', '階段', '2階', '座敷']);
});

test('景點、住宿的關鍵字', () => {
  assert.deepEqual(keywordsFor('spot', { kids: { friendly: null }, accessibility: { stairs: '多' } }), ['冬', '子供']);
  assert.deepEqual(keywordsFor('lodging', { accessibility: { kids: '添い寝免費', elevator: null } }), ['冬', '階段']);
});

test('已讀過評論的筆記', () => {
  assert.ok(READ_MARK.test('  5. [tabelog] 食べログ口コミ（最新 20 則；2026-10-18 讀）'));
  assert.ok(!READ_MARK.test('- [價格] 食べログ口コミ集計 5,000 円'));
});

test('依子地區分批', () => {
  const mk = (region, n) => Array.from({ length: n }, (_, i) => ({ id: `${region}-${i}`, region }));
  const items = [...mk('b', 12), ...mk('a', 10), ...mk('c', 30)];
  const out = makeBatches(items, ['a', 'b', 'c'], 20);
  const sizes = [1, 2, 3].map((b) => out.filter((x) => x.batch === b).length);
  assert.deepEqual(sizes, [22, 15, 15]); // a＋b＝22 ≤ 25 放同一批；c 30 > 25 拆成 2 批
  assert.equal(out[0].region, 'a');
});
