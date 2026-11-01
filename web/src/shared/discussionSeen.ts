// 討論的「看到哪裡」（T33 設計 §2）：每台裝置、每個人記一份（localStorage）。新裝置第一次打開時舊留言全算已讀。
// 彈窗開著時一直算看過；shownSeen 是打開前的位置，彈窗用它標出哪些是新的。

import { useMemo } from 'react';
import { createStore } from 'zustand/vanilla';
import { useStore } from 'zustand';
import { sharedStore } from '../appShared.ts';
import { useShared } from '../hooks.ts';
import { latestCommentAt, unreadCount } from '../lib/discussion.ts';
import { uiStore } from '../uiStore.ts';

const key = (me: string) => `travel-helper:discussSeen:${me}`;

function load(me: string): string | null {
  try {
    return localStorage.getItem(key(me));
  } catch {
    return null;
  }
}

function save(me: string, seen: string) {
  try {
    localStorage.setItem(key(me), seen);
  } catch {
    // 私密視窗等存不了：只是換個裝置、重新整理後又從最新的開始算
  }
}

export const seenStore = createStore<{ me: string | null; seen: string | null; shownSeen: string | null }>()(() => ({ me: null, seen: null, shownSeen: null }));

function mark(me: string, seen: string) {
  seenStore.setState({ me, seen });
  save(me, seen);
}

/** 換了人、第一次拿到資料：讀回這個人看到哪裡；彈窗開著時，新的留言算看過 */
function refresh() {
  const { me: member, comments } = sharedStore.getState();
  const me = member?.id ?? null;
  if (!me) return;
  const cur = seenStore.getState();
  if (cur.me !== me) {
    const stored = load(me);
    if (stored === null) mark(me, latestCommentAt(comments));
    else seenStore.setState({ me, seen: stored });
  }
  if (uiStore.getState().discussion) {
    const latest = latestCommentAt(comments);
    if (latest > (seenStore.getState().seen ?? '')) mark(me, latest);
  }
}

sharedStore.subscribe(refresh);
let wasOpen = false;
uiStore.subscribe((s) => {
  const open = !!s.discussion;
  if (open && !wasOpen) seenStore.setState({ shownSeen: seenStore.getState().seen });
  wasOpen = open;
  if (open) refresh();
});
refresh();

/** 還沒看過的留言數 */
export function useDiscussionUnread(): number {
  const comments = useShared((s) => s.comments);
  const me = useShared((s) => s.me?.id ?? null);
  const seen = useStore(seenStore, (s) => s.seen);
  return useMemo(() => unreadCount(comments, me, seen), [comments, me, seen]);
}
