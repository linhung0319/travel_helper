// 已經有的點不重複加（T31）。

import type { LonLat, Place } from '../../data/types.ts';
import { haversineMeters } from '../geo/index.ts';

const SAME_M = 80;
const NEAR_M = 30;

/** 正規化：全形半形統一、小寫、去空白 */
const fold = (s: string) => s.normalize('NFKC').toLowerCase().replace(/\s+/g, '');

function namesOf(p: Place): string[] {
  return [p.name.zh, p.name.ja, p.name.kana, p.name.en].filter((x): x is string => !!x).map(fold).filter(Boolean);
}

/** same：80 m 內且名稱互相包含；near：沒有 same 時，30 m 內最近的一個。不含車站。 */
export function findExisting(places: Place[], coords: LonLat, name: string | null): { same: Place | null; near: Place | null } {
  const target = name ? fold(name) : '';
  let same: Place | null = null;
  let sameD = Infinity;
  let near: Place | null = null;
  let nearD = Infinity;
  for (const p of places) {
    if (p.type === 'station') continue;
    const d = haversineMeters(coords, p.coords);
    if (d <= SAME_M && target.length >= 2 && d < sameD && namesOf(p).some((n) => n.length >= 2 && (n.includes(target) || target.includes(n)))) {
      same = p;
      sameD = d;
    }
    if (d <= NEAR_M && d < nearD) {
      near = p;
      nearD = d;
    }
  }
  return same ? { same, near: null } : { same: null, near };
}
