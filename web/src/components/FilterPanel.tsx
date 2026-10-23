import { useMemo } from 'react';
import { appStore } from '../store.ts';
import { useApp, useData } from '../hooks.ts';
import { displayName } from '../data/normalize.ts';
import { CONTEXT_LABELS, FIT15_LABELS, TYPE_LABELS, VOTE_FILTER_LABELS, VOTE_FILTER_VALUES, matchesFilter } from '../lib/filter.ts';
import { CONTEXTS, PLACE_TYPES, TIERS } from '../data/types.ts';
import { commands } from '../appCommands.ts';

function Toggle({ on, label, onClick, count }: { on: boolean; label: string; onClick(): void; count?: number }) {
  return (
    <button type="button" className={`pill ${on ? 'on' : ''}`} aria-pressed={on} onClick={onClick}>
      {label}
      {count !== undefined && <span className="pill-count">{count}</span>}
    </button>
  );
}

/** 篩選器（區域、子地區、類型、情境、分級、團體）和「跳到區域」。選項一律從 areas.json 和資料來 */
export function FilterPanel({ onClose }: { onClose(): void }) {
  const filter = useApp((s) => s.filter);
  const areas = useData((s) => s.areas);
  const places = useData((s) => s.places);
  const { toggleFilter, clearFilter } = appStore.getState();
  // 各選項的筆數：其他條件不變，只看這一項
  const countWith = useMemo(
    () => (patch: Partial<typeof filter>) => places.filter((p) => matchesFilter(p, { ...filter, ...patch })).length,
    [places, filter],
  );
  const regionAreas = filter.areas.length ? areas.filter((a) => filter.areas.includes(a.id)) : [];

  return (
    <div className="filter-panel" role="dialog" aria-label="篩選" data-testid="filter-panel">
      <div className="filter-head">
        <strong>篩選</strong>
        <button type="button" className="link-button" onClick={clearFilter}>
          全部取消
        </button>
        <button type="button" className="icon-button" aria-label="關閉篩選" onClick={onClose}>
          ✕
        </button>
      </div>
      <h4>類型</h4>
      <div className="pills">
        {PLACE_TYPES.map((t) => (
          <Toggle key={t} label={TYPE_LABELS[t]} on={filter.types.includes(t)} count={countWith({ types: [t] })} onClick={() => toggleFilter('types', t)} />
        ))}
      </div>
      <h4>區域</h4>
      <div className="pills">
        {areas.map((a) => (
          <Toggle
            key={a.id}
            label={displayName(a.name, a.id)}
            on={filter.areas.includes(a.id)}
            count={countWith({ areas: [a.id], regions: [] })}
            onClick={() => {
              toggleFilter('areas', a.id);
              // 取消區域時，那一區的子地區也一起取消
              const regionIds = new Set((a.regions ?? []).map((r) => r.id));
              const s = appStore.getState();
              if (!s.filter.areas.includes(a.id)) s.setFilter({ regions: s.filter.regions.filter((r) => !regionIds.has(r)) });
            }}
          />
        ))}
      </div>
      {regionAreas.map((a) => (
        <div key={a.id}>
          <h4>{displayName(a.name, a.id)}的子地區</h4>
          <div className="pills">
            {(a.regions ?? []).map((r) => (
              <Toggle key={r.id} label={displayName(r.name, r.id)} on={filter.regions.includes(r.id)} count={countWith({ regions: [r.id] })} onClick={() => toggleFilter('regions', r.id)} />
            ))}
          </div>
        </div>
      ))}
      <h4>情境（餐廳）</h4>
      <div className="pills">
        {CONTEXTS.map((c) => (
          <Toggle key={c} label={CONTEXT_LABELS[c]} on={filter.contexts.includes(c)} count={countWith({ contexts: [c] })} onClick={() => toggleFilter('contexts', c)} />
        ))}
      </div>
      <h4>團體（餐廳）</h4>
      <div className="pills">
        {(['yes', 'split'] as const).map((v) => (
          <Toggle key={v} label={FIT15_LABELS[v]} on={filter.fit15.includes(v)} count={countWith({ fit15: [v] })} onClick={() => toggleFilter('fit15', v)} />
        ))}
      </div>
      <h4>投票</h4>
      <div className="pills">
        {VOTE_FILTER_VALUES.map((v) => (
          <Toggle key={v} label={VOTE_FILTER_LABELS[v]} on={filter.votes.includes(v)} count={countWith({ votes: [v] })} onClick={() => toggleFilter('votes', v)} />
        ))}
      </div>
      <h4>分級</h4>
      <div className="pills">
        {TIERS.map((t) => (
          <Toggle key={t} label={`${t} 級`} on={filter.tiers.includes(t)} count={countWith({ tiers: [t] })} onClick={() => toggleFilter('tiers', t)} />
        ))}
      </div>
      <h4>跳到區域</h4>
      <div className="pills">
        {areas.map((a) => (
          <button
            key={a.id}
            type="button"
            className="pill"
            onClick={() => {
              commands.focus({ area: a.id });
              onClose();
            }}
          >
            {displayName(a.name, a.id)}
          </button>
        ))}
      </div>
    </div>
  );
}
