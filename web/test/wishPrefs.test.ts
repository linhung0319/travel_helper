// 想去的顯示設定（清單／照片牆、現在看哪一排）在兩邊共用的 shared/wishPrefs.ts，不放在手機的 mobileStore（第七輪最終 review #14）。
import { test } from 'node:test';
import assert from 'node:assert/strict';

// node 沒有 localStorage：放一個假的，看設定有沒有存下來
const mem = new Map<string, string>();
(globalThis as Record<string, unknown>).localStorage = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, v),
  removeItem: (k: string) => void mem.delete(k),
};

const { wishPrefs } = await import('../src/shared/wishPrefs.ts');

test('預設：清單、三排書架（沒進任何一排）', () => {
  assert.equal(wishPrefs.getState().view, 'list');
  assert.equal(wishPrefs.getState().section, null);
});

test('setView：改了記到 localStorage', () => {
  wishPrefs.getState().setView('photo');
  assert.equal(wishPrefs.getState().view, 'photo');
  assert.equal(mem.get('travel-helper:wishView'), 'photo');
});

test('setSection 不記住；換地區、按「自己加」（setUserOnly）回到三排書架（T53）', () => {
  const before = new Map(mem);
  wishPrefs.getState().setSection('candidate');
  assert.equal(wishPrefs.getState().section, 'candidate');
  assert.deepEqual(mem, before);
  wishPrefs.getState().setUserOnly(true);
  assert.equal(wishPrefs.getState().section, null);
  wishPrefs.getState().setSection('scheduled');
  wishPrefs.getState().setUserOnly(false);
  assert.equal(wishPrefs.getState().section, null);
});
