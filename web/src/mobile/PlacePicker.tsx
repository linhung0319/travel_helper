// 「＋ 加地點」的底部面板（interaction-design §16.2）：手機沒有拖曳，一次勾好幾個點帶進聊天。
// 先列想去、這天行程、AI 挑的，少打字；搜尋用全部的點（中日文名、別名）。已經帶著的點一開始就勾著，取消勾選就拿掉。

import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { ai } from '../appAi.ts';
import { useApp, useData } from '../hooks.ts';
import { stopsOn } from '../lib/itinerary.ts';
import { matchesQuery } from '../lib/filter.ts';
import { shortDayLabel, tripDates } from '../lib/trip.ts';
import { useLiked } from '../shared/placeLists.ts';
import { Icon } from '../components/Icon.tsx';
import type { Place } from '../data/types.ts';
import { placeAreaLabel } from './ExploreFeed.tsx';
import { Thumb } from './Thumb.tsx';
import { mobileStore } from './mobileStore.ts';

type Source = 'wish' | 'day' | 'ai';

/** 搜尋一次最多列幾個 */
const MAX_FOUND = 40;

export function PlacePicker() {
  const places = useData((s) => s.places);
  const byId = useData((s) => s.byId);
  const areas = useData((s) => s.areas);
  const itinerary = useData((s) => s.itinerary);
  const day = useApp((s) => s.day);
  const aiResult = useApp((s) => s.aiResult);
  const liked = useLiked();
  const [query, setQuery] = useState('');
  const [source, setSource] = useState<Source>('wish');
  const chips = ai.store.getState().contexts;
  const [picked, setPicked] = useState<string[]>(() => chips.flatMap((c) => (c.kind === 'place' ? [c.id] : [])));
  const close = () => mobileStore.getState().setChatOverlay(null);

  const list = useMemo((): Place[] => {
    const found = (ids: string[]) => ids.map((id) => byId.get(id)).filter((p): p is Place => !!p);
    if (query.trim()) return places.filter((p) => matchesQuery(p, query)).slice(0, MAX_FOUND);
    if (source === 'wish') return found([...liked.keys()]);
    if (source === 'ai') return found(aiResult?.ids ?? []);
    const dates = day === 'all' ? tripDates() : [day];
    return found([...new Set(dates.flatMap((d) => stopsOn(itinerary, d).filter((s) => s.kind !== 'flight').map((s) => s.place)))]);
  }, [query, source, places, byId, liked, aiResult, day, itinerary]);

  const toggle = (id: string) => setPicked((x) => (x.includes(id) ? x.filter((y) => y !== id) : [...x, id]));

  const done = async () => {
    // 拿掉取消勾選的（從後面拿，前面的索引才不會變）
    for (let i = chips.length - 1; i >= 0; i--) {
      const c = chips[i];
      if (c.kind === 'place' && !picked.includes(c.id)) ai.removeContext(i);
    }
    const had = new Set(chips.flatMap((c) => (c.kind === 'place' ? [c.id] : [])));
    const fresh = picked.filter((id) => !had.has(id));
    close();
    if (fresh.length) await ai.ask(fresh.map((id) => ({ kind: 'place' as const, id, ...(day === 'all' ? {} : { date: day }) })));
  };

  const tabs: { id: Source; label: string }[] = [
    { id: 'wish', label: '想去' },
    { id: 'day', label: day === 'all' ? '行程' : `${shortDayLabel(day)} 行程` },
    ...(aiResult ? [{ id: 'ai' as const, label: 'AI 挑的' }] : []),
  ];

  return createPortal(
    <div className="m-picker-root">
      <div className="m-picker-dim" onClick={close} aria-hidden />
      <section className="m-picker" role="dialog" aria-label="加地點" data-testid="m-picker">
        <header className="m-picker-head">
          <strong>加地點</strong>
          <button type="button" className="m-icon-button" aria-label="關掉" onClick={close} data-testid="m-picker-close">
            <Icon name="close" size={20} />
          </button>
        </header>
        <div className="m-picker-search">
          <Icon name="search" size={20} />
          <input type="search" value={query} placeholder="搜尋名稱" aria-label="搜尋名稱" onChange={(e) => setQuery(e.target.value)} data-testid="m-picker-search" />
        </div>
        {!query.trim() && (
          <div className="m-picker-tabs" role="tablist">
            {tabs.map((t) => (
              <button key={t.id} type="button" role="tab" aria-selected={source === t.id} className={`m-picker-tab ${source === t.id ? 'on' : ''}`} onClick={() => setSource(t.id)} data-testid={`m-picker-tab-${t.id}`}>
                {t.label}
              </button>
            ))}
          </div>
        )}
        <ul className="m-picker-list">
          {list.map((p) => {
            const on = picked.includes(p.id);
            return (
              <li key={p.id}>
                <button type="button" className="m-picker-row" aria-pressed={on} onClick={() => toggle(p.id)} data-testid="m-picker-row" data-id={p.id}>
                  <Thumb place={p} size={40} />
                  <span className="m-picker-name">
                    <b className="m-ellipsis">{p.name.zh || p.name.ja}</b>
                    <small className="m-ellipsis">{placeAreaLabel(p, areas)}</small>
                  </span>
                  <span className={`m-picker-check ${on ? 'on' : ''}`} aria-hidden>
                    {on && <Icon name="check" size={16} />}
                  </span>
                </button>
              </li>
            );
          })}
          {list.length === 0 && <li className="muted m-empty">{query.trim() ? '找不到這個名字。' : '這裡還沒有地點，搜尋看看。'}</li>}
        </ul>
        <footer className="m-picker-foot">
          <button type="button" className="button primary" onClick={() => void done()} data-testid="m-picker-done">
            {picked.length ? `帶 ${picked.length} 個地點` : '完成'}
          </button>
        </footer>
      </section>
    </div>,
    document.body,
  );
}
