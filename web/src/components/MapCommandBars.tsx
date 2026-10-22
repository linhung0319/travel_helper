// 地圖指令（T12）在地圖上方的說明列：AI 的提議、比較中的點、標示和路線。
// 使用者看得出 AI 對地圖做了什麼，也能自己清掉（interaction-design §0「AI 用的條件要看得到」）。

import { appStore } from '../store.ts';
import { commands } from '../appCommands.ts';
import { useApp, useData } from '../hooks.ts';
import { describeChanges } from '../lib/overlays.ts';
import { placeBadges } from '../lib/badges.ts';
import { TierBadge } from './TierBadge.tsx';
import { TYPE_ICONS } from '../lib/typeStyle.ts';

function ProposalBar() {
  const proposal = useApp((s) => s.proposal);
  const byId = useData((s) => s.byId);
  if (!proposal) return null;
  const name = (id: string) => {
    const p = byId.get(id);
    return p ? p.name.zh || p.name.ja : id;
  };
  const lines = describeChanges(proposal.changes, name);
  return (
    <div className="command-bar proposal-bar" data-testid="proposal-bar" role="status">
      <div className="command-bar-head">
        <strong>AI 的提議（虛線）</strong>
        <button type="button" className="link-button" onClick={() => commands.clearProposal()}>
          不看提議 ✕
        </button>
      </div>
      {proposal.summary && <p className="small">{proposal.summary}</p>}
      {lines.map((l) => (
        <p key={l.date} className="small">
          {l.text}
        </p>
      ))}
      {/* 採用、修改由 T15／T16 接上（用 engine 的操作寫進行程，先存快照） */}
    </div>
  );
}

function CompareBar() {
  const compare = useApp((s) => s.compare);
  const byId = useData((s) => s.byId);
  if (compare.length === 0) return null;
  return (
    <div className="command-bar compare-bar" data-testid="compare-bar">
      <div className="command-bar-head">
        <strong>比較</strong>
        <button type="button" className="link-button" onClick={() => appStore.getState().setCompare([])}>
          結束比較 ✕
        </button>
      </div>
      <div className="compare-cards">
        {compare.map((id, i) => {
          const p = byId.get(id);
          if (!p) return null;
          return (
            <button key={id} type="button" className="compare-card" onClick={() => appStore.getState().openDetail(id)} data-id={id}>
              <span className="compare-letter">{String.fromCharCode(65 + i)}</span>
              <span className="compare-name">
                <TierBadge tier={p.tier} />
                {TYPE_ICONS[p.type]} {p.name.zh || p.name.ja}
              </span>
              <span className="compare-badges small">{placeBadges(p, 3).map((b) => b.label).join('・') || '—'}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** 有標示或路線時，給一個清掉的按鈕 */
function MarksBar() {
  const highlights = useApp((s) => s.highlights);
  const routes = useApp((s) => s.routes);
  const marked = Object.values(highlights).reduce((n, ids) => n + (ids?.length ?? 0), 0);
  if (marked === 0 && routes.length === 0) return null;
  return (
    <div className="command-bar marks-bar" data-testid="marks-bar">
      <span className="small">
        {marked > 0 && `標示 ${marked} 個點`}
        {marked > 0 && routes.length > 0 && '・'}
        {routes.length > 0 && `路線 ${routes.length} 條`}
      </span>
      <button type="button" className="link-button" onClick={() => commands.clearHighlights()}>
        清掉 ✕
      </button>
    </div>
  );
}

export function MapCommandBars() {
  return (
    <div className="command-bars">
      <ProposalBar />
      <CompareBar />
      <MarksBar />
    </div>
  );
}
