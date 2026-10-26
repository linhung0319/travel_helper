// 電腦版的右側：探索、想去、行程共用一欄（順序是使用的順序），頂到最上面。點了探索或想去的卡片，詳情蓋在這一欄上，「← 返回」回到原本的分頁。
// 想去是只放有人 ❤️ 的點的探索（Explore.tsx 的 source="wish"）。AI 沒有自己的分頁：地圖和這三個分頁就是 AI 操作的東西（T16）。

import { appStore } from '../store.ts';
import { useApp, useData } from '../hooks.ts';
import { DayPanel } from './DayPanel.tsx';
import { Icon, type IconName } from './Icon.tsx';
import { DetailPanel } from './DetailPanel.tsx';
import { ExplorePanel, showItinerary } from './Explore.tsx';
import { useLiked } from '../shared/placeLists.ts';

/** 從詳情回到探索或想去：清單重新出現，捲回剛剛那張卡片 */
function back(id: string) {
  const s = appStore.getState();
  s.closeDetail();
  if (s.mode === 'explore' || s.mode === 'wish') s.revealInExplore(id);
}

const BACK_LABELS = { map: '返回行程', explore: '返回探索', wish: '返回想去' } as const;

/** 切到探索或想去（關掉詳情） */
export function showList(mode: 'explore' | 'wish') {
  const s = appStore.getState();
  s.closeDetail();
  s.setMode(mode);
}

export function SidePanel() {
  const mode = useApp((s) => s.mode);
  const detailId = useApp((s) => s.detailId);
  const byId = useData((s) => s.byId);
  const liked = useLiked().size;
  const place = detailId ? byId.get(detailId) : null;
  const tab = (icon: IconName, label: string, on: boolean, onClick: () => void, testId: string) => (
    <button type="button" role="tab" aria-selected={on} className={`side-tab ${on ? 'on' : ''}`} onClick={onClick} data-testid={testId}>
      <Icon name={icon} size={20} />
      {label}
    </button>
  );
  return (
    <div className="side-panel">
      <div className="side-tabs" role="tablist" aria-label="右側">
        {tab('search', '探索', mode === 'explore' && !place, () => showList('explore'), 'side-tab-explore')}
        {tab('heart', `想去${liked ? ` ${liked}` : ''}`, mode === 'wish' && !place, () => showList('wish'), 'side-tab-wish')}
        {tab('calendar', '行程', mode === 'map' && !place, showItinerary, 'side-tab-day')}
      </div>
      {place ? (
        <div className="side-body side-detail">
          <DetailPanel place={place} back={{ label: BACK_LABELS[mode], onClick: () => back(place.id) }} />
        </div>
      ) : (
        <div className="side-body">{mode === 'map' ? <DayPanel /> : <ExplorePanel key={mode} source={mode} />}</div>
      )}
    </div>
  );
}
