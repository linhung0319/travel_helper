// 確認其他 workspace 用套件名稱 import 得到引擎（T22）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PLACE_TYPES, AREA_IDS } from '@travel-helper/engine';

test('用套件名稱 import 得到共用型別的常數', () => {
  assert.deepEqual(PLACE_TYPES, ['station', 'spot', 'lodging', 'restaurant']);
  assert.ok(AREA_IDS.includes('toba'));
});
