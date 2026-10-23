// 整個網站共用的一份共用資料（行程、建議、投票、修改紀錄）；動作在 sharedStore.ts。
import { backend, initBackend } from './backend/index.ts';
import { dataStore } from './dataStore.ts';
import { createShared } from './sharedStore.ts';

export const shared = createShared(backend, dataStore);
export const sharedStore = shared.store;

let syncTimer: number | null = null;

/** 啟動：接上後端、讀全部、開始同步（loadData 呼叫） */
export async function loadShared(): Promise<void> {
  await initBackend();
  await shared.load();
  if (syncTimer !== null) return;
  syncTimer = window.setInterval(() => void shared.syncOnce().catch(() => {}), 30_000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void shared.syncOnce().catch(() => {});
  });
}
