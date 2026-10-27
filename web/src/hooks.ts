import { useEffect, useState } from 'react';
import { useStore } from 'zustand';
import { appStore, type AppStore } from './store.ts';
import { dataStore, type DataState } from './dataStore.ts';
import { sharedStore } from './appShared.ts';
import type { SharedState } from './sharedStore.ts';
import { planStore, type PlanState } from './planStore.ts';
import { uiStore, type UiState } from './uiStore.ts';

export function useApp<T>(selector: (s: AppStore) => T): T {
  return useStore(appStore, selector);
}

export function useData<T>(selector: (s: DataState) => T): T {
  return useStore(dataStore, selector);
}

export function useShared<T>(selector: (s: SharedState) => T): T {
  return useStore(sharedStore, selector);
}

export function useUi<T>(selector: (s: UiState) => T): T {
  return useStore(uiStore, selector);
}

export function usePlan<T>(selector: (s: PlanState) => T): T {
  return useStore(planStore, selector);
}

/** 網頁版的寬度（interaction-design §1「平板」）：1100px 以上三欄。iPad 直拿（最寬 1024）是手機版、橫拿（最窄 1133）是網頁版 */
export const DESKTOP_QUERY = '(min-width: 1100px)';

export function useMediaQuery(query: string): boolean {
  const [match, setMatch] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setMatch(mq.matches);
    mq.addEventListener('change', onChange);
    onChange();
    return () => mq.removeEventListener('change', onChange);
  }, [query]);
  return match;
}

export const useIsDesktop = () => useMediaQuery(DESKTOP_QUERY);
/** 滑鼠：移上去出現小卡片；觸控：點一下出現小卡片、再點一下開詳情 */
export const useCanHover = () => useMediaQuery('(hover: hover) and (pointer: fine)');
