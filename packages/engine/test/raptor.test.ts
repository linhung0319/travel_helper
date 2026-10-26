// RAPTOR 公共交通搜尋（T29）：資料讀檔
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CONFIG } from '../src/index.ts';
import { realData } from './fixtures.ts';

test('realData 讀得到班距型路線和轉乘', () => {
  const d = realData();
  assert.equal(d.urban?.length, 10);
  const loop = d.urban?.find((r) => r.id === 'jr-osaka-loop');
  assert.ok(loop);
  assert.equal(loop.loop, true);
  assert.equal(d.urbanTransfers?.length, 22);
});

test('transit 新設定的預設值', () => {
  const t = DEFAULT_CONFIG.transit;
  assert.deepEqual([t.maxRides, t.maxAlternatives, t.urbanTransferDefault, t.transferMaxMeters, t.transferPenalty], [4, 3, 5, 300, 10]);
});
