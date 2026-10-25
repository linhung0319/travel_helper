// 手機探索上方的搜尋和篩選（第六輪 §3.2）：搜尋框、類型晶片（全部、景點、餐廳、住宿）、地區 ▾、⚙ 篩選、快速篩選晶片、排序 ▾。
// 狀態放在 mobileStore 的 feed（手機自己一份，不看地圖範圍、不動地圖的篩選）。⚙ 篩選是底部面板（portal 到 body，蓋過底部分頁），條件照 FilterPanel（情境、團體、投票、分級，選了地區再加小區域）。
// 往下滑時 ExploreFeed 改畫一行的摘要（FeedSummary），點了捲回最上面。

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useData } from '../hooks.ts';
import { displayName } from '../data/normalize.ts';
import { CONTEXTS, TIERS, type Area } from '../data/types.ts';
import { CONTEXT_LABELS, FIT15_LABELS, TYPE_LABELS, VOTE_FILTER_LABELS, VOTE_FILTER_VALUES } from '../lib/filter.ts';
import { EXPLORE_SORTS, EXPLORE_SORT_LABELS, FEED_QUICK, feedToken, type ExploreSort, type Feed } from '../lib/explore.ts';
import { TYPE_ICONS } from '../lib/typeStyle.ts';
import { mobileStore, useMobile } from './mobileStore.ts';

const TYPE_CHIPS: { type: Feed['type']; label: string }[] = [
  { type: 'all', label: '全部' },
  ...(['spot', 'restaurant', 'lodging'] as const).map((t) => ({ type: t, label: `${TYPE_ICONS[t]} ${TYPE_LABELS[t]}` })),
];

/** 晶片按鈕 */
function Chip({ on, onClick, testId, children }: { on: boolean; onClick(): void; testId?: string; children: React.ReactNode }) {
  return (
    <button type="button" className={`m-chip ${on ? 'on' : ''}`} aria-pressed={on} onClick={onClick} data-testid={testId}>
      {children}
    </button>
  );
}

/** 篩選摘要的字（收成一行時、底部面板的標題用）：類型・地區・條件・「搜尋字」 */
export function useFeedSummary(): string {
  const feed = useMobile((s) => s.feed);
  const areas = useData((s) => s.areas);
  const area = areas.find((a) => a.id === feed.area);
  const quick = feed.quick.map((t) => FEED_QUICK.find((q) => q.token === t)?.label ?? tokenLabel(t, areas));
  return [feed.type === 'all' ? '全部' : TYPE_LABELS[feed.type], area ? displayName(area.name, area.id) : '全部地區', ...quick, ...(feed.query.trim() ? [`「${feed.query.trim()}」`] : [])].join('・');
}

/** ⚙ 篩選裡條件的名稱 */
function tokenLabel(token: string, areas: Area[]): string {
  const [key, value] = [token.slice(0, token.indexOf(':')), token.slice(token.indexOf(':') + 1)];
  if (key === 'contexts') return CONTEXT_LABELS[value as keyof typeof CONTEXT_LABELS] ?? value;
  if (key === 'fit15') return FIT15_LABELS[value as keyof typeof FIT15_LABELS] ?? value;
  if (key === 'votes') return VOTE_FILTER_LABELS[value as keyof typeof VOTE_FILTER_LABELS] ?? value;
  if (key === 'tiers') return `${value} 級`;
  if (key === 'regions') {
    const r = areas.flatMap((a) => a.regions ?? []).find((x) => x.id === value);
    return r ? displayName(r.name, r.id) : value;
  }
  return value;
}

/** ⚙ 篩選的底部面板：一組一排晶片，點了馬上套用；「完成」關掉 */
function FeedSheet({ onClose }: { onClose(): void }) {
  const feed = useMobile((s) => s.feed);
  const areas = useData((s) => s.areas);
  const area = areas.find((a) => a.id === feed.area);
  const { toggleFeedQuick, setFeed } = mobileStore.getState();
  const group = (title: string, items: { token: string; label: string }[]) => (
    <section className="m-sheet-group">
      <h3 className="m-sheet-h">{title}</h3>
      <div className="m-chips wrap">
        {items.map((it) => (
          <Chip key={it.token} on={feed.quick.includes(it.token)} onClick={() => toggleFeedQuick(it.token)}>
            {it.label}
          </Chip>
        ))}
      </div>
    </section>
  );
  // 掛到 body：畫在分頁內容（.m-page 自己一層）裡會被底部分頁蓋住
  return createPortal(
    <div className="m-sheet-backdrop" onClick={onClose}>
      <div className="m-sheet" role="dialog" aria-label="篩選" data-testid="m-feed-sheet" onClick={(e) => e.stopPropagation()}>
        <header className="m-sheet-head">
          <h2 className="m-h2">篩選</h2>
          <button type="button" className="m-text-btn" onClick={() => setFeed({ quick: [] })}>
            全部取消
          </button>
          <button type="button" className="m-text-btn strong" onClick={onClose} data-testid="m-feed-sheet-done">
            完成
          </button>
        </header>
        <div className="m-sheet-body">
          {area?.regions?.length ? group(`${displayName(area.name, area.id)}的小區域`, area.regions.map((r) => ({ token: feedToken('regions', r.id), label: displayName(r.name, r.id) }))) : null}
          {group('情境（餐廳）', CONTEXTS.map((c) => ({ token: feedToken('contexts', c), label: CONTEXT_LABELS[c] })))}
          {group('團體（餐廳）', (['yes', 'split'] as const).map((v) => ({ token: feedToken('fit15', v), label: FIT15_LABELS[v] })))}
          {group('投票', VOTE_FILTER_VALUES.map((v) => ({ token: feedToken('votes', v), label: VOTE_FILTER_LABELS[v] })))}
          {group('分級', TIERS.map((t) => ({ token: feedToken('tiers', t), label: `${t} 級` })))}
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** 探索上方的搜尋和篩選（展開的樣子） */
export function FeedFilters() {
  const feed = useMobile((s) => s.feed);
  const areas = useData((s) => s.areas);
  const [sheet, setSheet] = useState(false);
  const { setFeed, toggleFeedQuick } = mobileStore.getState();
  // ⚙ 的 ●：選了快速晶片以外的條件
  const extra = feed.quick.some((t) => !FEED_QUICK.some((q) => q.token === t));
  return (
    <div className="m-feed-filters" data-testid="m-feed-filters">
      <label className="m-search">
        <span aria-hidden>🔍</span>
        <input type="search" value={feed.query} placeholder="搜尋景點、餐廳、住宿" aria-label="搜尋名稱" onChange={(e) => setFeed({ query: e.target.value })} data-testid="m-feed-search" />
      </label>
      <div className="m-chips">
        {TYPE_CHIPS.map((c) => (
          <Chip key={c.type} on={feed.type === c.type} onClick={() => setFeed({ type: c.type })} testId={`m-feed-type-${c.type}`}>
            {c.label}
          </Chip>
        ))}
      </div>
      <div className="m-chips">
        <select
          className={`m-chip m-select ${feed.area ? 'on' : ''}`}
          value={feed.area ?? ''}
          aria-label="地區"
          // 換地區時，舊地區的小區域拿掉
          onChange={(e) => setFeed({ area: e.target.value || null, quick: feed.quick.filter((t) => !t.startsWith('regions:')) })}
          data-testid="m-feed-area"
        >
          <option value="">全部地區</option>
          {areas.map((a) => (
            <option key={a.id} value={a.id}>
              {displayName(a.name, a.id)}
            </option>
          ))}
        </select>
        <Chip on={sheet} onClick={() => setSheet(true)} testId="m-feed-more">
          ⚙ 篩選{extra ? ' ●' : ''}
        </Chip>
        <select className="m-chip m-select" value={feed.sort} aria-label="排序" onChange={(e) => setFeed({ sort: e.target.value as ExploreSort })} data-testid="m-feed-sort">
          {EXPLORE_SORTS.map((s) => (
            <option key={s} value={s}>
              排序：{EXPLORE_SORT_LABELS[s]}
            </option>
          ))}
        </select>
      </div>
      <div className="m-chips">
        {FEED_QUICK.map((q) => (
          <Chip key={q.token} on={feed.quick.includes(q.token)} onClick={() => toggleFeedQuick(q.token)} testId={`m-feed-quick-${q.token}`}>
            {q.label}
          </Chip>
        ))}
      </div>
      {sheet && <FeedSheet onClose={() => setSheet(false)} />}
    </div>
  );
}

