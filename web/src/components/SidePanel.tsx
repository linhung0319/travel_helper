// 電腦版的右側：行程、探索共用一欄，頂到最上面。點了探索的卡片，詳情蓋在這一欄上，「← 返回」回到原本的分頁。
// 之後 AI 聊天產生的行程、餐廳建議也放這裡（T16）。

import { appStore } from '../store.ts';
import { useApp, useData } from '../hooks.ts';
import { DayPanel } from './DayPanel.tsx';
import { DetailPanel } from './DetailPanel.tsx';
import { ExplorePanel, showItinerary } from './Explore.tsx';

/** 從詳情回到探索：清單重新出現，捲回剛剛那張卡片 */
function back(id: string) {
  const s = appStore.getState();
  s.closeDetail();
  if (s.mode === 'explore') s.revealInExplore(id);
}

export function SidePanel() {
  const mode = useApp((s) => s.mode);
  const detailId = useApp((s) => s.detailId);
  const byId = useData((s) => s.byId);
  const place = detailId ? byId.get(detailId) : null;
  const tab = (label: string, on: boolean, onClick: () => void, testId: string) => (
    <button type="button" role="tab" aria-selected={on} className={`side-tab ${on ? 'on' : ''}`} onClick={onClick} data-testid={testId}>
      {label}
    </button>
  );
  return (
    <div className="side-panel">
      <div className="side-tabs" role="tablist" aria-label="右側">
        {tab('📅 行程', mode === 'map' && !place, showItinerary, 'side-tab-day')}
        {tab(
          '🔎 探索',
          mode === 'explore' && !place,
          () => {
            appStore.getState().closeDetail();
            appStore.getState().setMode('explore');
          },
          'side-tab-explore',
        )}
        <button type="button" role="tab" aria-selected={false} className="side-tab" disabled title="T16 接上 AI 聊天後，AI 的建議放這裡">
          ✨ AI 建議
        </button>
      </div>
      {place ? (
        <div className="side-body side-detail">
          <DetailPanel place={place} back={{ label: `返回${mode === 'explore' ? '探索' : '行程'}`, onClick: () => back(place.id) }} />
        </div>
      ) : (
        <div className="side-body">{mode === 'explore' ? <ExplorePanel /> : <DayPanel />}</div>
      )}
    </div>
  );
}
