// 代表照片：photos 的第一張（T21 已排好）。打不開時依序換下一張，全部打不開就顯示替代圖。

import type { Photo } from '../data/types.ts';

const WIKIMEDIA_ORIGINAL = /^https:\/\/upload\.wikimedia\.org\/wikipedia\/commons\/(?!thumb\/)([0-9a-f])\/([0-9a-f]{2})\/([^/]+\.(?:jpe?g|png|webp|gif))$/i;

/**
 * Wikimedia 的原圖改用縮圖網址（原圖很大，連續讀原圖會被限流 429，見 data/raw/toba/log/T21.md）。
 * 縮圖比原圖大時 Wikimedia 會回錯誤，所以原圖留在下一個候選。
 */
export function wikimediaThumb(url: string, width = 800): string | null {
  const m = WIKIMEDIA_ORIGINAL.exec(url);
  if (!m) return null;
  const [, a, ab, file] = m;
  return `https://upload.wikimedia.org/wikipedia/commons/thumb/${a}/${ab}/${file}/${width}px-${file}`;
}

/** 要依序嘗試的網址：代表照片在前；Wikimedia 先試縮圖再試原圖 */
export function photoCandidates(photos: Photo[], width = 800): string[] {
  const out: string[] = [];
  for (const p of photos) {
    const thumb = wikimediaThumb(p.url, width);
    if (thumb) out.push(thumb);
    out.push(p.url);
  }
  return [...new Set(out)];
}

/** 這張照片的出處（顯示在照片角落） */
export function photoCredit(photo: Photo | undefined): string | null {
  if (!photo) return null;
  return [photo.credit, photo.license].filter(Boolean).join('・') || null;
}
