// 搜尋框輸入的分類（T31）：連結、日本地址、其他文字。

import { looksLikeAddress } from './address.ts';
import { extractMapLink } from './mapLink.ts';

export { looksLikeAddress };

export type InputKind = 'empty' | 'link' | 'address' | 'text';

export function classifyInput(s: string): InputKind {
  const t = s.trim();
  if (!t) return 'empty';
  // 貼上的分享文字可能是「店名＋網址」，有地圖連結就算連結
  if (extractMapLink(t)) return 'link';
  if (/^https?:\/\//i.test(t)) return 'text';
  return looksLikeAddress(t) ? 'address' : 'text';
}
