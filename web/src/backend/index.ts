// 目前用的後端。dev server 用假後端（mock.ts＋dev-fixtures/seed.ts：固定資料、不用開 Worker）；
// 正式 build 呼叫 Worker 的 API（api.ts）。

import { apiBackend } from './api.ts';
import type { Backend } from './types.ts';
import type { MockBackend } from './mock.ts';

let current: Backend = apiBackend;
let mock: MockBackend | null = null;

/** 啟動時呼叫一次。直接用 import.meta.env.DEV 判斷，build 時整段會被拿掉，假資料不會出現在 dist/ */
export async function initBackend(): Promise<Backend> {
  if (import.meta.env.DEV) {
    const [{ createMockBackend }, { devSeed }] = await Promise.all([import('./mock.ts'), import('../dev-fixtures/seed.ts')]);
    let storage: Storage | null = null;
    try {
      storage = window.localStorage;
    } catch {
      storage = null;
    }
    mock = createMockBackend(devSeed(), { storage, latencyMs: 150 });
    current = mock;
  }
  return current;
}

export function backend(): Backend {
  return current;
}

/** dev 選單用：假後端（正式 build 是 null） */
export function mockBackend(): MockBackend | null {
  return mock;
}

/** 測試用：直接換掉 */
export function setBackend(b: Backend) {
  current = b;
}
