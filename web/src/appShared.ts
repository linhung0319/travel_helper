// 整個網站共用的一份共用資料（行程、建議、投票、修改紀錄）；動作在 sharedStore.ts。
import { backend, initBackend } from './backend/index.ts';
import { dataStore } from './dataStore.ts';
import { createShared } from './sharedStore.ts';
import { appStore } from './store.ts';
import { setVoteLookup } from './lib/filter.ts';

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

// 「大家喜歡的」篩選（lib/filter.ts）讀這裡的票數；票變了而且正在用投票篩選時，換一份 filter 讓地圖、圖片牆重畫
let likes = new Map<string, number>();
let mine = new Set<string>();
function indexVotes() {
  const { votes, me } = sharedStore.getState();
  likes = new Map();
  mine = new Set();
  for (const v of votes) {
    if (v.value !== 'like') continue;
    likes.set(v.placeId, (likes.get(v.placeId) ?? 0) + 1);
    if (v.memberId === me?.id) mine.add(v.placeId);
  }
}
setVoteLookup({ likes: (id) => likes.get(id) ?? 0, likedByMe: (id) => mine.has(id) });
sharedStore.subscribe((s, prev) => {
  if (s.votes === prev.votes && s.me === prev.me) return;
  indexVotes();
  const app = appStore.getState();
  if (app.filter.votes.length) app.setFilter({});
});
