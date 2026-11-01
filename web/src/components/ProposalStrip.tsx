// 提議列（interaction-design §16.1、§16.2）：網頁在右欄分頁下面，切到探索、想去也看得到，採用、不要只在這裡。手機在行程面板頂端（onTrip），聊天的提議卡另外有一組，半屏會蓋住這裡，同時只看得到一組。
// 沒有提議卡的提議（showProposal 指令，不是 AI 這一輪給的）只有「不看提議」。

import { useMemo } from 'react';
import { useStore } from 'zustand';
import { commands } from '../appCommands.ts';
import { ai } from '../appAi.ts';
import { shared } from '../appShared.ts';
import { useApp, useData, useUi } from '../hooks.ts';
import { appStore } from '../store.ts';
import { uiStore } from '../uiStore.ts';
import { describeChanges } from '../lib/overlays.ts';
import { Icon } from './Icon.tsx';

export function ProposalStrip({ onTrip: onTripProp }: { onTrip?: boolean } = {}) {
  const proposal = useApp((s) => s.proposal);
  const mode = useApp((s) => s.mode);
  const active = useStore(ai.proposals.store, (s) => s.active);
  const view = useUi((s) => s.proposalView);
  const byId = useData((s) => s.byId);
  const lines = useMemo(() => {
    if (!proposal) return [];
    const name = (id: string) => {
      const p = byId.get(id);
      return p ? p.name.zh || p.name.ja : id;
    };
    return describeChanges(proposal.changes, name).map((l) => l.text);
  }, [proposal, byId]);
  if (!proposal) return null;
  const onTrip = onTripProp ?? mode === 'map';
  const days = proposal.dates.length;
  const adopt = async () => {
    if (!active) return;
    const r = await ai.confirmCard(active.cardId);
    if (!r.ok && r.error !== '取消了' && r.error !== '沒有存成功') shared.notifyError(r.error);
  };
  const seeOnTrip = () => {
    const s = appStore.getState();
    s.closeDetail();
    s.setMode('map');
    uiStore.setState((u) => ({ proposalView: 'diff', proposalReveal: u.proposalReveal + 1 }));
  };
  const original = onTrip && view === 'original';
  return (
    <div className="proposal-strip" data-testid="proposal-bar" role="status">
      <span className="ps-title">
        AI 的提議
        {days > 1 && ` · ${days} 天有變動`}
        {original && '（現在看的是原本的行程）'}
      </span>
      {/* 單一天寫摘要（有時間）；多天逐天列 */}
      {active && days === 1 && proposal.summary ? (
        <span className="ps-lines">
          {proposal.summary.split('；').map((l) => (
            <span key={l}>{l}</span>
          ))}
        </span>
      ) : (
        <span className="ps-lines">
          {proposal.summary && !active && <span>{proposal.summary}</span>}
          {lines.map((l) => (
            <span key={l}>{l}</span>
          ))}
        </span>
      )}
      <div className="ps-actions">
        {active ? (
          <>
            <button type="button" className="button primary small" onClick={() => void adopt()} data-testid="proposal-adopt">
              採用
            </button>
            <button type="button" className="button small" onClick={() => void ai.rejectCard(active.cardId)} data-testid="proposal-reject">
              不要
            </button>
          </>
        ) : (
          <button type="button" className="link-button" onClick={() => commands.clearProposal()}>
            不看提議 <Icon name="close" size={16} />
          </button>
        )}
        <span className="ps-sp" />
        {!onTrip ? (
          <button type="button" className="link-button" onClick={seeOnTrip} data-testid="proposal-see">
            在行程上看
          </button>
        ) : (
          <button type="button" className="link-button" onClick={() => uiStore.setState({ proposalView: original ? 'diff' : 'original' })} data-testid="proposal-toggle">
            {original ? '看提議' : '看原本'}
          </button>
        )}
      </div>
    </div>
  );
}
