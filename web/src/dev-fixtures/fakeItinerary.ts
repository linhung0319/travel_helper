// 開發用的假行程（👤 2026-10-22：只在 dev server 有，預設開、可以關；正式 build 不帶）。
import type { Itinerary } from '@travel-helper/engine/types';

const KEY = 'travel-helper:fakeItinerary';

export function fakeItineraryEnabled(): boolean {
  if (!import.meta.env.DEV) return false;
  try {
    return localStorage.getItem(KEY) !== '0';
  } catch {
    return true;
  }
}

export function setFakeItineraryEnabled(on: boolean) {
  try {
    localStorage.setItem(KEY, on ? '1' : '0');
  } catch {
    // 無痕模式等情況存不了，不影響使用
  }
}

export async function loadFakeItinerary(): Promise<Itinerary | null> {
  // 直接用 import.meta.env.DEV 判斷，build 時整段會被拿掉，假行程不會出現在 dist/
  if (import.meta.env.DEV && fakeItineraryEnabled()) {
    const mod = await import('./itinerary.json');
    return mod.default as unknown as Itinerary;
  }
  return null;
}
