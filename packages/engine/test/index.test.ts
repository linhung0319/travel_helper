// 確認其他 workspace 用套件名稱 import 得到引擎（T22）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as engine from '@travel-helper/engine';
import { PLACE_TYPES, type AreaId } from '@travel-helper/engine';

test('用套件名稱 import 得到共用型別的常數', () => {
  assert.deepEqual(PLACE_TYPES, ['station', 'spot', 'lodging', 'restaurant']);
});

test('區域不寫死（T12）：AreaId 是一般字串，沒有寫死的區域清單', () => {
  const osaka: AreaId = 'osaka';
  assert.equal(osaka, 'osaka');
  assert.equal('AREA_IDS' in engine, false);
});
