// 搜尋框下面的提示怎麼判斷（T31 spec §2）：純非同步函式，AddPlaceSuggest 只負責畫結果。

import type { LonLat, Place } from '../../data/types.ts';
import { RESOLVE_OFFLINE_MESSAGE } from '../../backend/types.ts';
import { matchesQuery } from '../filter.ts';
import { classifyInput } from './classify.ts';
import { findExisting } from './dedupe.ts';
import { extractMapLink, isShortMapLink, parseMapLink } from './mapLink.ts';

export const ADDRESS_NOT_FOUND = '找不到這個地址。可以改打大一點的範圍（例如只打到町），或直接在地圖上指位置。';
export const LINK_UNREADABLE = '這個連結讀不到位置。可以在地圖上指位置，名稱自己填。';

export type Suggestion =
  /** 不用顯示提示（空白、或文字比得到我們的點） */
  | { kind: 'none' }
  /** 連結或地址解析出一個位置（coords 可能是 null：只拿到名稱） */
  | { kind: 'candidate'; via: 'google-link' | 'address'; coords: LonLat | null; name: string; link: string | null; near: Place | null }
  /** 已經有了 */
  | { kind: 'same'; place: Place }
  /** 讀不到；可以改在地圖上指 */
  | { kind: 'error'; message: string }
  /** 文字比不到任何點 */
  | { kind: 'notFound'; text: string };

export interface SuggestDeps {
  /** 展開短網址（backend().resolveMapLink） */
  resolveShort(url: string): Promise<string>;
  geocode(q: string): Promise<LonLat | null>;
  /** 全部的點（不看篩選、不看地圖範圍） */
  places: Place[];
}

export async function resolveSuggestion(query: string, deps: SuggestDeps): Promise<Suggestion> {
  const kind = classifyInput(query);
  if (kind === 'empty') return { kind: 'none' };

  if (kind === 'text') {
    const text = query.trim();
    return deps.places.some((p) => matchesQuery(p, text)) ? { kind: 'none' } : { kind: 'notFound', text };
  }

  if (kind === 'address') {
    const text = query.trim();
    const coords = await deps.geocode(text);
    if (!coords) return { kind: 'error', message: ADDRESS_NOT_FOUND };
    return withExisting(deps.places, { via: 'address', coords, name: '', link: null });
  }

  // link：貼上的可能是「店名＋網址」，只取網址
  const link = extractMapLink(query)!;
  let full = link;
  if (isShortMapLink(link)) {
    try {
      full = await deps.resolveShort(link);
    } catch (e) {
      return { kind: 'error', message: e instanceof Error && e.message ? e.message : RESOLVE_OFFLINE_MESSAGE };
    }
  }
  const parsed = parseMapLink(full);
  let coords = parsed.coords;
  if (!coords && parsed.addressText) coords = await deps.geocode(parsed.addressText);
  if (!coords && !parsed.name) return { kind: 'error', message: LINK_UNREADABLE };
  return withExisting(deps.places, { via: 'google-link', coords, name: parsed.name ?? '', link });
}

function withExisting(places: Place[], c: { via: 'google-link' | 'address'; coords: LonLat | null; name: string; link: string | null }): Suggestion {
  if (!c.coords) return { kind: 'candidate', ...c, near: null };
  const { same, near } = findExisting(places, c.coords, c.name || null);
  return same ? { kind: 'same', place: same } : { kind: 'candidate', ...c, near };
}
