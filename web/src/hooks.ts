import { useEffect, useState } from 'react';
import { useStore } from 'zustand';
import { appStore, type AppStore } from './store.ts';
import { dataStore, type DataState } from './dataStore.ts';

export function useApp<T>(selector: (s: AppStore) => T): T {
  return useStore(appStore, selector);
}

export function useData<T>(selector: (s: DataState) => T): T {
  return useStore(dataStore, selector);
}

/** 電腦版的寬度（interaction-design §1）：900px 以上左右分 */
export const DESKTOP_QUERY = '(min-width: 900px)';

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
