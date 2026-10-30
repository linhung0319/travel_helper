// 搜尋框下面的提示（T31 spec §2）：放在篩選列下面、清單上面，只有探索用（想去不放）。
// 輸入是連結或地址：解析中 → 結果卡（＋ 加這個地點）／已經有了的那個點／錯誤；輸入是文字且全部的點都比不到：教怎麼加。
// 判斷在 lib/addPlace/suggest.ts，這裡只畫結果；輸入變了就丟掉舊的非同步結果。

import { useEffect, useMemo, useState } from 'react';
import { addPlaceStore } from '../../addPlaceStore.ts';
import { backend } from '../../backend/index.ts';
import { displayName } from '../../data/normalize.ts';
import { commands } from '../../appCommands.ts';
import { appStore } from '../../store.ts';
import { mobileStore } from '../../mobile/mobileStore.ts';
import { useData } from '../../hooks.ts';
import { matchesQuery } from '../../lib/filter.ts';
import { classifyInput } from '../../lib/addPlace/classify.ts';
import { geocodeAddress } from '../../lib/addPlace/gsi.ts';
import { areaOfCoords } from '../../lib/addPlace/userPlace.ts';
import { reconcileSuggestion, resolveSuggestion, type Suggestion } from '../../lib/addPlace/suggest.ts';
import type { Area, LonLat, Place } from '../../data/types.ts';
import type { FilterSurface } from './FilterSheet.tsx';
import { PlaceRow, useDayStatus } from './PlaceRow.tsx';

/** 輸入停下來多久才開始查（網址和地址要連外面） */
const DEBOUNCE_MS = 350;

/** 連結或地址：清單不顯示「沒有符合的地點」（清單那邊用） */
export const isLookupInput = (q: string): boolean => {
  const k = classifyInput(q);
  return k === 'link' || k === 'address';
};

/** 提示區塊接手時（連結、地址、全部的點都比不到），清單不再顯示「沒有符合的地點」 */
export function useSuggestOwnsEmpty(query: string): boolean {
  const places = useData((s) => s.places);
  const q = query.trim();
  if (!q) return false;
  if (isLookupInput(q)) return true;
  return !places.some((p) => matchesQuery(p, q));
}

export function AddPlaceSuggest({ query, surface }: { query: string; surface: FilterSurface }) {
  const places = useData((s) => s.places);
  const areas = useData((s) => s.areas);
  const statusOf = useDayStatus();
  const [result, setResult] = useState<{ query: string; s: Suggestion } | null>(null);

  useEffect(() => {
    let stale = false;
    const t = setTimeout(() => {
      // 連外面的查詢只看輸入；「已經有了」等用現在的點在下面重算
      resolveSuggestion(query, { resolveShort: (u) => backend().resolveMapLink(u), geocode: (q) => geocodeAddress(q), places: [] })
        .then((s) => !stale && setResult({ query, s }))
        .catch(() => !stale && setResult({ query, s: { kind: 'none' } }));
    }, classifyInput(query) === 'text' ? 0 : DEBOUNCE_MS);
    return () => {
      stale = true;
      clearTimeout(t);
    };
  }, [query]);

  const openPlace = (p: Place) => {
    if (surface === 'mobile') mobileStore.getState().openPlace(p.id, 'explore');
    else {
      const s = appStore.getState();
      s.openDetail(p.id, 'explore', undefined, 'map');
      commands.focus(p.id);
    }
  };
  const pinOnMap = () => addPlaceStore.getState().start({ via: 'map', coords: null });

  const lookup = isLookupInput(query);
  const s = useMemo(() => (result && result.query === query ? reconcileSuggestion(result.s, places) : null), [result, query, places]);
  if (!s && !lookup) return null;
  if (s?.kind === 'none') return null;

  return (
    <div className={`aps aps-${surface}`} data-testid="add-suggest">
      {!s && <p className="aps-loading muted">讀取中…</p>}
      {s?.kind === 'same' && (
        <div data-testid="add-suggest-existing">
          <p className="aps-note muted">已經有這個地點了</p>
          <PlaceRow place={s.place} status={statusOf(s.place.id)} onOpen={() => openPlace(s.place)} testId="place-row" />
        </div>
      )}
      {s?.kind === 'candidate' && (
        <div className="aps-card">
          <div className="aps-name">{s.name || '（沒有名稱）'}</div>
          <div className="aps-meta muted">{areaLabel(s.coords, areas) || (s.coords ? '' : '位置請在地圖上指')}</div>
          {s.near && (
            <button type="button" className="aps-near" onClick={() => openPlace(s.near!)} data-testid="add-suggest-existing">
              附近已經有：{s.near.name.zh || s.near.name.ja}
            </button>
          )}
          <button
            type="button"
            className="button primary aps-add"
            data-testid="add-suggest-add"
            onClick={() => addPlaceStore.getState().start(s.via === 'google-link' ? { via: 'google-link', coords: s.coords, name: s.name, jaName: s.name || null, link: s.link } : { via: 'address', coords: s.coords, name: '' })}
          >
            ＋ 加這個地點
          </button>
        </div>
      )}
      {s?.kind === 'error' && (
        <div className="aps-card">
          <p className="aps-error" data-testid="add-suggest-error">
            {s.message}
          </p>
          <button type="button" className="button aps-add" data-testid="add-suggest-add" onClick={pinOnMap}>
            在地圖上指位置
          </button>
        </div>
      )}
      {s?.kind === 'notFound' && (
        <div className="aps-card">
          <p className="aps-name">找不到「{s.text}」</p>
          <button type="button" className="button primary aps-add" data-testid="add-suggest-add" onClick={() => addPlaceStore.getState().start({ via: 'search', name: s.text, coords: null })}>
            ＋ 自己加一個地點
          </button>
          <ol className="aps-howto muted">
            <li>在 Google Maps 找到那個地點</li>
            <li>按「分享」，複製連結</li>
            <li>回來貼在上面的搜尋框</li>
          </ol>
        </div>
      )}
    </div>
  );
}

function areaLabel(coords: LonLat | null, areas: Area[]): string {
  if (!coords) return '';
  const a = areas.find((x) => x.id === areaOfCoords(coords, areas));
  return a ? displayName(a.name, a.id) : '';
}
