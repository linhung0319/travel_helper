// 國土地理院地址搜尋（T31）：瀏覽器直接查，失敗一律回 null。

import type { LonLat } from '../../data/types.ts';

const ENDPOINT = 'https://msearch.gsi.go.jp/address-search/AddressSearch?q=';

export async function geocodeAddress(q: string, fetchFn: typeof fetch = fetch): Promise<LonLat | null> {
  const text = q.replace(/〒\s*\d{3}-?\d{4}/g, '').trim();
  if (!text) return null;
  try {
    const res = await fetchFn(ENDPOINT + encodeURIComponent(text));
    if (!res.ok) return null;
    const body: unknown = await res.json();
    if (!Array.isArray(body) || !body.length) return null;
    const c = (body[0] as { geometry?: { coordinates?: unknown } } | null)?.geometry?.coordinates;
    if (Array.isArray(c) && typeof c[0] === 'number' && typeof c[1] === 'number') return [c[0], c[1]];
    return null;
  } catch {
    return null;
  }
}
