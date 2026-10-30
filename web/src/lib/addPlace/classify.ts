// 搜尋框輸入的分類（T31）：連結、日本地址、其他文字。

import { isMapLink } from './mapLink.ts';

export type InputKind = 'empty' | 'link' | 'address' | 'text';

/** 像日本地址：有都道府県＋市区町村，或「○市」「○町」之類，或丁目，或「數字-數字」的門牌 */
export function looksLikeAddress(s: string): boolean {
  const t = s.normalize('NFKC');
  return /[都道府県].*[市区町村郡]|[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]+[市区町村郡]|丁目|\d+[-ー－]\d+/u.test(t);
}

export function classifyInput(s: string): InputKind {
  const t = s.trim();
  if (!t) return 'empty';
  if (isMapLink(t)) return 'link';
  if (/^https?:\/\//i.test(t)) return 'text';
  return looksLikeAddress(t) ? 'address' : 'text';
}
