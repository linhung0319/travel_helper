// 電腦版的右側：探索、想去、行程共用一欄（順序是使用的順序），頂到最上面。點了探索或想去的卡片，詳情蓋在這一欄上，「← 返回」回到原本的分頁；從行程打開的詳情浮在地圖上（DetailFloat）。
// 想去是只放有人 ❤️ 的點的探索（Explore.tsx 的 source="wish"）。
// 頂端（第七輪）：三個分頁加右上的頭像選單（討論、預約、下載行程）；行程分頁下面是日期列，再下面是編輯中、衝突提示（套用的篩選條件只在探索、想去的篩選列下面那排，行程分頁不放，第七輪 §8.4）。AI 沒有自己的分頁：地圖和這三個分頁就是 AI 操作的東西（T16）。

import { appStore } from '../store.ts';
import { useApp, useData } from '../hooks.ts';
import { DayPanel } from './DayPanel.tsx';
import { Icon, type IconName } from './Icon.tsx';
import { AccountMenu } from './MeMenu.tsx';
import { ConflictBar, EditingStrip } from './Planning.tsx';
import { DayStrip } from '../shared/ui/DayStrip.tsx';
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

/** 從行程打開的詳情：浮在地圖右邊（地圖那一欄裡），右欄的時間軸不動；✕ 或 Esc 關掉 */
export function DetailFloat() {
  const detailId = useApp((s) => s.detailId);
  const from = useApp((s) => s.detailFrom);
  const place = useData((s) => (detailId ? s.byId.get(detailId) : undefined));
  if (!place || from !== 'map') return null;
  return (
    <div className="detail-float" data-testid="detail-float">
      <DetailPanel place={place} from="map" />
    </div>
  );
}

export function SidePanel() {
  const mode = useApp((s) => s.mode);
  const planning = useApp((s) => s.planning);
  const detailId = useApp((s) => s.detailId);
  const detailFrom = useApp((s) => s.detailFrom);
  const byId = useData((s) => s.byId);
  const liked = useLiked().size;
  // 從行程打開的詳情浮在地圖上（DetailFloat），右欄不換
  const place = detailId && detailFrom !== 'map' ? byId.get(detailId) : null;
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
        <span className="side-tabs-end">
          <AccountMenu />
        </span>
      </div>
      {/* 編輯中編輯條取代日期列：編輯中不能換天（§6.3） */}
      {mode === 'map' && !place && !planning && <DayStrip variant="side" />}
      <div className="side-notices">
        <EditingStrip />
        <ConflictBar />
      </div>
      {place ? (
        <div className="side-body side-detail">
          <DetailPanel place={place} from={detailFrom ?? mode} back={{ label: BACK_LABELS[detailFrom ?? mode], onClick: () => back(place.id) }} />
        </div>
      ) : (
        <div className="side-body">{mode === 'map' ? <DayPanel /> : <ExplorePanel key={mode} source={mode} />}</div>
      )}
    </div>
  );
}
