// AI 套的篩選（set_filter，T85 interaction-design §37）：探索內容最上面的「✦ AI 幫你套了」什麼時候畫、什麼時候變回一般的條件列。
// 狀態在 appStore.aiFilter（stage.setFilter 經 commands.showFilterResult 設）：符合的點（地圖畫水滴）、「復原」、套好以後那頁的篩選（key）。
// key 由探索畫面第一次畫出來時記下（手機、網頁的篩選在不同的 store，這樣兩邊同一套）；之後篩選、搜尋和它不一樣，
// 就是使用者自己動了（點掉晶片、開面板改、換主題、換區、搜尋）→ 清掉，條件列變回一般的、水滴收掉。網頁、手機共用。

import { useEffect } from 'react';
import { appStore } from '../store.ts';
import { useApp } from '../hooks.ts';
import type { Filter } from '../lib/filter.ts';

/** 一頁的篩選、搜尋寫成一個字串（欄位、值都排過序） */
export function aiFilterKey(filter: Filter, query: string): string {
  const entries = Object.entries(filter)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => [k, Array.isArray(v) ? [...v].sort() : v]);
  return JSON.stringify([entries, query.trim()]);
}

/**
 * 探索畫面叫（on：這一頁會畫條件列；AI 結果集、想去給 false）：AI 剛套的第一次畫出來記下 key，之後不一樣就清掉。
 * 回傳現在要不要畫「AI 幫你套了」
 */
export function useAiFilterWatch(on: boolean, filter: Filter, query: string): boolean {
  const ai = useApp((s) => (on ? s.aiFilter : null));
  const key = aiFilterKey(filter, query);
  useEffect(() => {
    if (!ai) return;
    if (ai.key === null) appStore.getState().setAiFilterKey(key);
    else if (ai.key !== key) appStore.getState().setAiFilter(null);
  }, [ai, key]);
  return !!ai && (ai.key === null || ai.key === key);
}

/** 「復原」：回到 AI 套用之前的篩選（「AI 幫你套了」和水滴一起收掉） */
export function undoAiFilter() {
  const f = appStore.getState().aiFilter;
  appStore.getState().setAiFilter(null);
  f?.undo();
}
