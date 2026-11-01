// 代表照片：photos 的第一張（T21 已排好）。打不開時依序換下一張，全部打不開就顯示替代圖。
// 照片只記網址（CONVENTIONS §4「照片」）；來源網站有提供小尺寸的網址，就照畫面要的寬度換（T32）：
// 卡片不用下載幾 MB 的原圖（楽天的原圖有到 8000×4500）。換過的網址打不開時，原圖留在下一個候選。

import type { Photo } from '../data/types.ts';

const WIKIMEDIA_ORIGINAL = /^https:\/\/upload\.wikimedia\.org\/wikipedia\/commons\/(?!thumb\/)([0-9a-f])\/([0-9a-f]{2})\/([^/]+\.(?:jpe?g|png|webp|gif))$/i;
/** Google 的照片：網址結尾的參數決定尺寸（`=w800`、`=w408-h306-k-no`），不會放大超過原圖 */
const GOOGLE_SIZED = /^(https:\/\/lh\d+\.googleusercontent\.com\/.+)=w\d+(?:-h\d+)?(?:-k-no)?$/;
/** 楽天的飯店主照片（`/share/HOTEL/7563/7563.jpg`）才有縮圖；`_kan`、`_bath` 這類沒有 */
const RAKUTEN_MAIN = /^https:\/\/img\.travel\.rakuten\.co\.jp\/share\/HOTEL\/(\d+)\/\1\.jpg$/;

/** 卡片（中）、小圖（小）的寬度：畫面只有這兩種小尺寸，Google、楽天都照這個換 */
const SMALLER_WIDTHS = [500, 200];

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

/** 楽天只有 60、90、200、300 寬的縮圖（2026-11-01 實測），再大就只有原圖 */
function rakutenThumb(url: string, width: number): string | null {
  const m = RAKUTEN_MAIN.exec(url);
  if (!m || width > 500) return null;
  return `https://img.travel.rakuten.co.jp/HIMG/${width <= 200 ? 200 : 300}/${m[1]}.jpg`;
}

/** 這個寬度的網址；來源沒有小尺寸的網址就是 null（用原圖） */
export function sizedUrl(url: string, width: number): string | null {
  const google = GOOGLE_SIZED.exec(url);
  if (google) return `${google[1]}=w${width}`;
  return wikimediaThumb(url, width) ?? rakutenThumb(url, width);
}

/** 要依序嘗試的網址：代表照片在前；有小尺寸的先試小尺寸，再試原圖 */
export function photoCandidates(photos: Photo[], width = 800): string[] {
  const out: string[] = [];
  for (const p of photos) {
    const sized = sizedUrl(p.url, width);
    if (sized) out.push(sized);
    out.push(p.url);
  }
  return [...new Set(out)];
}

/**
 * 大圖還沒到時先墊在底下的小圖：優先用看過的（seen，已經在瀏覽器快取裡，馬上畫得出來）。
 * 楽天的原圖可能好幾 MB，沒看過也先載小圖（約 45 KB）；其他來源的大圖本來就不大，不多載一張。
 */
export function underlayUrl(url: string, width: number, seen: (url: string) => boolean): string | null {
  const target = sizedUrl(url, width) ?? url;
  const smaller = SMALLER_WIDTHS.filter((w) => w < width)
    .map((w) => sizedUrl(url, w))
    .filter((u): u is string => !!u && u !== target);
  return smaller.find(seen) ?? (target === url && RAKUTEN_MAIN.test(url) ? (smaller[0] ?? null) : null);
}

/** 這張照片的出處（顯示在照片角落） */
export function photoCredit(photo: Photo | undefined): string | null {
  if (!photo) return null;
  return [photo.credit, photo.license].filter(Boolean).join('・') || null;
}
