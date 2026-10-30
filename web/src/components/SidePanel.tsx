// 電腦版的右側：探索、想去、行程共用一欄（順序是使用的順序），頂到最上面。
// 想去是只放有人 ❤️ 的點的探索（Explore.tsx 的 source="wish"）。
// 頂端（第七輪）：三個分頁加右上的頭像選單（討論、預約、下載行程）；行程分頁下面是兩週月曆（第八輪 §13.2），再下面是編輯中、衝突提示（套用的篩選條件只在探索、想去的篩選列下面那排，行程分頁不放，第七輪 §8.4）。AI 沒有自己的分頁：地圖和這三個分頁就是 AI 操作的東西（T16）。
// 詳情一律是彈窗（第八輪 §13.3）：開在你剛剛看的那一塊旁邊，不蓋住它——從右欄的卡開（appStore.detailAt＝map）蓋在地圖右側、貼著右欄（DetailFloat）；
// 從地圖上的點開（side）蓋住整個右欄（DetailOverSide），右欄的內容照樣掛著，關掉後捲動位置、展開的卡、編輯中都不變。同時只有一個彈窗。

import { useEffect, useRef } from 'react';
import { appStore } from '../store.ts';
import { commands } from '../appCommands.ts';
import { useApp, useData } from '../hooks.ts';
import { DayPanel } from './DayPanel.tsx';
import { Icon, type IconName } from './Icon.tsx';
import { AccountMenu } from './MeMenu.tsx';
import { ConflictBar, EditingStrip } from './Planning.tsx';
import { DayCalendar } from '../shared/ui/DayCalendar.tsx';
import { DetailPanel } from './DetailPanel.tsx';
import { ExplorePanel, showItinerary } from './Explore.tsx';
import { useLiked } from '../shared/placeLists.ts';
import { addPlaceStore, useAddPlace } from '../addPlaceStore.ts';
import { AddPlaceForm } from '../shared/ui/AddPlaceForm.tsx';

/** 切到探索或想去（關掉詳情） */
export function showList(mode: 'explore' | 'wish') {
  const s = appStore.getState();
  s.closeDetail();
  s.setMode(mode);
}

/** 正在開著、而且在 at 那裡的詳情；原地換成別的點時彈窗捲回最上面（看得到「‹ 上一個」） */
function useDetailAt(at: 'map' | 'side') {
  const detailId = useApp((s) => (s.detailAt === at ? s.detailId : null));
  const from = useApp((s) => s.detailFrom);
  const place = useData((s) => (detailId ? s.byId.get(detailId) : undefined));
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = 0;
  }, [detailId]);
  return { place, from, ref };
}

/** 從右欄的卡開的詳情：蓋在地圖右側、貼著右欄（地圖那一欄裡），右欄不動；✕、Esc、點地圖空白處關掉。畫出來之後地圖再照移動規則讓開它（選中的點不被蓋住） */
export function DetailFloat() {
  const { place, from, ref } = useDetailAt('map');
  const shown = place?.id ?? null;
  // 彈窗已經在 DOM 裡：MapView 算可見範圍時扣掉它（.detail-float），點被蓋住就平移
  useEffect(() => {
    if (shown) commands.focus(shown);
  }, [shown]);
  if (!place) return null;
  return (
    <div className="detail-float" data-testid="detail-float" data-at="map" ref={ref}>
      <DetailPanel place={place} from={from ?? 'map'} />
    </div>
  );
}

/** 從地圖上的點開的詳情：蓋住整個右欄（四周留 8px），地圖完全不被擋 */
function DetailOverSide() {
  const { place, from, ref } = useDetailAt('side');
  if (!place) return null;
  return (
    <div className="detail-float detail-over-side" data-testid="detail-float" data-at="side" ref={ref}>
      <DetailPanel place={place} from={from ?? 'map'} />
    </div>
  );
}

/** 加地點（或修改自己加的點）的確認畫面：取代右欄的內容，圖釘在中間的主地圖上（T31 spec §3「網頁」） */
function AddPlaceBody() {
  const edit = useAddPlace((s) => s.draft?.mode === 'edit');
  return (
    <>
      <div className="apf-head">
        <button type="button" className="apf-back" onClick={() => addPlaceStore.getState().cancel()} data-testid="add-back">
          <Icon name="back" size={20} />
          {edit ? '修改地點' : '加一個地點'}
        </button>
      </div>
      <p className="apf-hint muted">拖曳圖釘調整位置</p>
      <AddPlaceForm surface="desktop" />
    </>
  );
}

export function SidePanel() {
  const adding = useAddPlace((s) => !!s.draft);
  // 表單開起來時詳情彈窗收掉（從詳情按「✎ 修改」進來時，不讓彈窗蓋住表單或圖釘）
  useEffect(() => {
    if (adding) appStore.getState().closeDetail();
  }, [adding]);
  const mode = useApp((s) => s.mode);
  const planning = useApp((s) => s.planning);
  const covered = useApp((s) => !!s.detailId && s.detailAt === 'side');
  const liked = useLiked().size;
  const tab = (icon: IconName, label: string, on: boolean, onClick: () => void, testId: string) => (
    <button type="button" role="tab" aria-selected={on} className={`side-tab ${on ? 'on' : ''}`} onClick={onClick} data-testid={testId}>
      <Icon name={icon} size={20} />
      {label}
    </button>
  );
  return (
    <div className={`side-panel ${covered ? 'covered' : ''}`}>
      <div className="side-tabs" role="tablist" aria-label="右側">
        {tab('search', '探索', mode === 'explore', () => showList('explore'), 'side-tab-explore')}
        {tab('heart', `想去${liked ? ` ${liked}` : ''}`, mode === 'wish', () => showList('wish'), 'side-tab-wish')}
        {tab('calendar', '行程', mode === 'map', showItinerary, 'side-tab-day')}
        <span className="side-tabs-end">
          <AccountMenu />
        </span>
      </div>
      {/* 編輯中編輯條取代日期列：編輯中不能換天（§6.3） */}
      {mode === 'map' && !planning && <DayCalendar />}
      <div className="side-notices">
        <EditingStrip />
        <ConflictBar />
      </div>
      {/* 右欄的內容一直掛著：蓋住右欄的彈窗關掉後原樣回來 */}
      <div className="side-body" inert={covered || undefined}>
        {adding ? <AddPlaceBody /> : mode === 'map' ? <DayPanel /> : <ExplorePanel key={mode} source={mode} />}
      </div>
      <DetailOverSide />
    </div>
  );
}
