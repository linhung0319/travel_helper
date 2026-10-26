// 想去的顯示設定（清單／照片牆、三段收合）在兩邊共用的 shared/wishPrefs.ts，不放在手機的 mobileStore（第七輪最終 review #14）。
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

test('預設：清單、只有「已排」收起來', () => {
  assert.equal(wishPrefs.getState().view, 'list');
  assert.deepEqual(wishPrefs.getState().collapsed, { unscheduled: false, candidate: false, scheduled: true });
});

test('setView、setCollapsed：改了記到 localStorage', () => {
  wishPrefs.getState().setView('photo');
  assert.equal(wishPrefs.getState().view, 'photo');
  assert.equal(mem.get('travel-helper:wishView'), 'photo');
  wishPrefs.getState().setCollapsed('scheduled', false);
  assert.equal(wishPrefs.getState().collapsed.scheduled, false);
  assert.deepEqual(JSON.parse(mem.get('th.wishCollapsed')!), { unscheduled: false, candidate: false, scheduled: false });
});
