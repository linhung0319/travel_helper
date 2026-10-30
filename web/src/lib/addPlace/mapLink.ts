// Google Maps 網址解析（T31）：純函式，不連網。短網址要先由 Worker 展開。

import type { LonLat } from '../../data/types.ts';
import { looksLikeAddress } from './address.ts';

export interface ParsedMapLink {
  name: string | null;
  coords: LonLat | null;
  /** 座標是地點本身（!3d!4d）才是 true；@ 是地圖中心，只是附近 */
  precise: boolean;
  /** q／query 文字裡的地址部分，給呼叫的人拿去查國土地理院 */
  addressText: string | null;
}

const GOOGLE_HOST = /(^|\.)google\.(com|co\.[a-z]{2}|com\.[a-z]{2}|[a-z]{2})$/;

function toUrl(s: string): URL | null {
  try {
    const u = new URL(s.trim());
    return u.protocol === 'https:' || u.protocol === 'http:' ? u : null;
  } catch {
    return null;
  }
}

function isShortUrl(u: URL): boolean {
  return u.hostname === 'maps.app.goo.gl' || (u.hostname === 'goo.gl' && u.pathname.startsWith('/maps/'));
}

export function isShortMapLink(s: string): boolean {
  const u = toUrl(s);
  return !!u && isShortUrl(u);
}

/** 和 Worker 接受的主機一致：短網址、google.<tld>（路徑 /maps）、maps.google.<tld>、consent.google.com */
export function isMapLink(s: string): boolean {
  const u = toUrl(s);
  if (!u) return false;
  if (isShortUrl(u)) return true;
  const host = u.hostname;
  if (host === 'consent.google.com') return true;
  if (!GOOGLE_HOST.test(host)) return false;
  if (host.startsWith('maps.')) return true;
  return u.pathname === '/maps' || u.pathname.startsWith('/maps/');
}

const EMPTY: ParsedMapLink = { name: null, coords: null, precise: false, addressText: null };

/** 「緯度,經度」→ [經度, 緯度] */
function latLng(a: string, b: string): LonLat | null {
  const lat = Number(a);
  const lon = Number(b);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return [lon, lat];
}

const COORD_TEXT = /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/;

export function parseMapLink(url: string): ParsedMapLink {
  const u = toUrl(url);
  if (!u) return { ...EMPTY };
  // 被轉到同意頁：真正的網址在 continue 參數
  if (u.hostname === 'consent.google.com') {
    const next = u.searchParams.get('continue');
    return next && next !== url ? parseMapLink(next) : { ...EMPTY };
  }

  let name: string | null = null;
  let coords: LonLat | null = null;
  let precise = false;
  let addressText: string | null = null;

  const place = /\/place\/([^/]+)/.exec(u.pathname);
  if (place) {
    try {
      name = decodeURIComponent(place[1].replace(/\+/g, ' ')).trim() || null;
      // 沒名稱的點，Google 會把座標文字（34°28'53.4"N …）放在這裡：不是名稱
      if (name && (/\d+°/.test(name) || COORD_TEXT.test(name))) name = null;
    } catch {
      name = null;
    }
  }

  // 1. !3d!4d，取最後一組
  const full = u.pathname + u.search;
  const pins = [...full.matchAll(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/g)];
  if (pins.length) {
    const last = pins[pins.length - 1];
    coords = latLng(last[1], last[2]);
    precise = coords !== null;
  }
  // 2. @緯度,經度
  if (!coords) {
    const at = /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/.exec(u.pathname);
    if (at) coords = latLng(at[1], at[2]);
  }
  // 3. ll／q／query 是座標
  const q = u.searchParams.get('q') ?? u.searchParams.get('query');
  if (!coords) {
    for (const v of [u.searchParams.get('ll'), q]) {
      const m = v ? COORD_TEXT.exec(v) : null;
      if (m) {
        coords = latLng(m[1], m[2]);
        if (coords) break;
      }
    }
  }
  // 4. q／query 是文字：第一個「,」「、」前是名稱，後面（去郵遞區號）像地址才留著查
  if (q && !COORD_TEXT.test(q)) {
    const m = /[,、]/.exec(q);
    let front: string;
    let rest: string;
    if (m) {
      front = q.slice(0, m.index).trim();
      rest = q.slice(m.index + 1).replace(/〒\s*\d{3}-?\d{4}/g, '').trim();
    } else {
      front = q.trim();
      rest = front;
    }
    if (!name && front) name = front;
    if (rest && looksLikeAddress(rest)) addressText = rest;
  }

  return { name, coords, precise, addressText };
}

/** 從貼上的文字（例如分享文字「店名＋網址」）裡找第一個地圖連結 */
export function extractMapLink(s: string): string | null {
  for (const m of s.matchAll(/https?:\/\/[^\s<>"']+/gi)) {
    const url = m[0].replace(/[。，、）)」』！!？?.,]+$/, '');
    if (isMapLink(url)) return url;
  }
  return null;
}
