// 「行程」分頁（interaction-design §3、§6），兩層，像探索的清單和詳情：
// 選「整趟」是直的骨架（地區、子地區、住宿，T45b §19.1）；選了某一天，最上面一列「日期、問 AI、討論、編輯」，下面一行這晚住哪一區・第幾晚（§19.3），編輯中換成墨色編輯條（日期、問 AI、討論、上一步、完成，T33），
// 下面是摘要列（⚠ 點了展開這天所有的提醒，T74b）、比例橫條（時間條）、時間軸（資料卡是類型的淡底色，起點、終點的住宿也是卡片）、這天的候選（想去「加到某天」的點）。預約、下載在右欄右上的頭像選單（MeMenu.tsx 的 AccountMenu）。

import { useRef, useState } from 'react';
import { TimelineSkeleton } from '../shared/ui/Skeleton.tsx';
import { useApp, useData, useNeedPlan, useUi } from '../hooks.ts';
import { dayLabel, isRedDay } from '../lib/trip.ts';
import { dayAreaTitle, dayTitle } from '../lib/dayTitle.ts';
import { selectedBarKey } from '../lib/planView.ts';
import { DayBar, DayReminders, DaySummaryLine, Timeline, useDayTimeline, useProposalDay, useRevealProposal } from './Timeline.tsx';
import { DayCandidates } from './Wishlist.tsx';
import { EditHint, PlanningBar, PlanningToggle } from './Planning.tsx';
import { askDay, askEmptyDay, askNightLodging, askTrip } from './webAi.ts';
import { openAreaHome } from '../exploreArea.ts';
import { showList } from './SidePanel.tsx';
import { Icon } from './Icon.tsx';
import { DiscussButton } from '../shared/ui/DiscussButton.tsx';
import { DayEmpty } from '../shared/ui/EmptyStates.tsx';
import { TripSkeleton, type SkeletonActions } from '../shared/ui/TripSkeleton.tsx';
import { NightLine } from '../shared/ui/NightLine.tsx';

/** 整趟「未選住宿」的捷徑（T54）：右欄換到探索、進那區的「住」（T78，區段收合、捲到頂）；問 AI 在左欄的聊天室 */
const WEB_SKELETON: SkeletonActions = {
  lodgingShelf: (area) => {
    showList('explore');
    openAreaHome(area);
  },
  askLodging: askNightLodging,
};

/**
 * 整趟（T45b）：最上面「整趟行程」，問 AI、討論兩顆圓形圖示鈕靠右（T81 拿掉「第 N 版・誰 幾點改的」，過去的版本在頭像選單）；
 * 下面是直的骨架（地區、子地區、住宿，shared/ui/TripSkeleton.tsx；「累」標、沒有空檔、晚餐未選都在骨架上，T74b）
 */
function Overview() {
  return (
    <div className="day-panel" data-testid="day-panel">
      <div className="day-head trip-head">
        <h3>整趟行程</h3>
        <span className="day-nav-actions">
          <button type="button" className="text-button ask-ai-quiet icon-round" aria-label="問 AI 整趟" title="問 AI 整趟" onClick={askTrip} data-testid="trip-ask-ai">
            <Icon name="spark" size={20} />
          </button>
          <DiscussButton variant="quiet" />
        </span>
      </div>
      <TripSkeleton actions={WEB_SKELETON} />
    </div>
  );
}

/** 去想去分頁 */
function goWish() {
  showList('wish');
}

/** 某一天最上面一列（§6.1、T33）：圓體的大日期，旁邊「週五 · 鳥羽」；右邊問 AI、討論兩顆圓形圖示鈕（T81）和主要按鈕「編輯」。換天用地圖上的日期晶片 */
function DayHead({ day }: { day: string }) {
  const itinerary = useData((s) => s.itinerary);
  const byId = useData((s) => s.byId);
  const areas = useData((s) => s.areas);
  const title = dayTitle(day, dayAreaTitle(itinerary, day, byId, areas));
  return (
    <div className="day-nav" data-testid="day-nav">
      <h3 className="day-title">
        <span className={`day-title-date ${isRedDay(day) ? 'red-day' : ''}`} data-testid="day-title-date">
          {title.date}
        </span>
        <span className="day-title-sub" data-testid="day-title-sub">
          {title.short}
        </span>
      </h3>
      <span className="day-nav-actions">
        <button type="button" className="text-button ask-ai-quiet icon-round" aria-label="問 AI 這天" title="問 AI 這天" onClick={() => askDay(day)} data-testid="day-ask-ai">
          <Icon name="spark" size={20} />
        </button>
        <DiscussButton variant="quiet" />
        <PlanningToggle />
      </span>
    </div>
  );
}

export function DayPanel() {
  useNeedPlan();
  const day = useApp((s) => s.day);
  const planning = useApp((s) => s.planning);
  const shown = useProposalDay(day);
  const tl = useDayTimeline(day, shown?.source);
  const { plan, itDay, status: planStatus, error: planError } = tl;
  const [warnOpen, setWarnOpen] = useState(false);
  const legOpen = useUi((s) => s.legOpen);
  const detailId = useApp((s) => s.detailId);
  const selectedKey = selectedBarKey(plan, legOpen, detailId);
  const panelRef = useRef<HTMLDivElement>(null);
  useRevealProposal(panelRef, day, !!shown, plan);
  if (day === 'all') return <Overview />;
  return (
    <div className={`day-panel ${planning ? 'editing' : ''}`} data-testid="day-panel" ref={panelRef}>
      <PlanningBar
        title={`編輯 ${dayLabel(day)}`}
        extra={
          <button type="button" className="text-button" onClick={() => askDay(day)} data-testid="day-ask-ai">
            <Icon name="spark" size={20} /> 問 AI
          </button>
        }
      />
      {/* 編輯中已經有編輯條；看提議的差異時不畫：按「編輯」提議的卡會不見，要編輯先按提議列的「看原本」 */}
      {!shown && !planning && <DayHead day={day} />}
      {!shown && !planning && <NightLine date={day} />}
      {plan && (
        <div className="day-head">
          <DaySummaryLine plan={plan} warnOpen={warnOpen} onWarn={() => setWarnOpen((o) => !o)} />
        </div>
      )}
      {warnOpen && plan && <DayReminders plan={plan} />}
      {plan && <DayBar plan={plan} selected={selectedKey} />}
      {!itDay && <p className="muted">行程裡沒有這一天。</p>}
      {itDay && planStatus === 'loading' && <TimelineSkeleton />}
      {planStatus === 'error' && <p className="warn">時間軸算不出來：{planError}</p>}
      {!shown && <EditHint />}
      {itDay && plan && <Timeline tl={{ ...tl, itDay, plan }} diff={shown?.diff ?? null} originalPlan={shown?.originalPlan ?? null} />}
      {itDay && plan && itDay.items.length === 0 && (
        <DayEmpty date={day} onAsk={() => askEmptyDay(day)} onWish={goWish} testId="day-empty" />
      )}
      <DayCandidates date={day} />
    </div>
  );
}
