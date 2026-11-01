// 螢幕鍵盤的判斷（interaction-design §16.3）：純函式。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { keyboardState } from '../src/lib/keyboard.ts';

test('iOS：layout 不變、可視高度變矮：讓出差的那段', () => {
  assert.deepEqual(keyboardState({ baseline: 664, visualHeight: 364, layoutHeight: 664, focused: true }), { open: true, inset: 300 });
});

test('Android WebView：layout 自己變矮：鍵盤開著，但不用再讓', () => {
  assert.deepEqual(keyboardState({ baseline: 664, visualHeight: 364, layoutHeight: 364, focused: true }), { open: true, inset: 0 });
});

test('沒有在打字：畫面變矮不算鍵盤（分割畫面、網址列）', () => {
  assert.deepEqual(keyboardState({ baseline: 664, visualHeight: 364, layoutHeight: 664, focused: false }), { open: false, inset: 0 });
});

test('網址列收合只差幾十 px：不算鍵盤', () => {
  assert.deepEqual(keyboardState({ baseline: 664, visualHeight: 600, layoutHeight: 664, focused: true }), { open: false, inset: 0 });
});
