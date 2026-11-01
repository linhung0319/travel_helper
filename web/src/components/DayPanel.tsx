// 「行程」分頁（interaction-design §3、§6），兩層，像探索的清單和詳情：
// 選「整趟」是整趟的總覽（每天排了什麼、幾個候選、警告）；選了某一天，編輯中最上面是藍條（說明、快照、完成），接著一列「← 整趟、日期 ‹ ›、問 AI、編輯」，
// 下面是摘要列（⚠ 點了展開提醒）、比例橫條（時間條）、時間軸（資料卡是類型的淡底色，起點、終點的住宿也是卡片）、這天的候選（想去「加到某天」的點）。討論、預約、下載在右欄右上的頭像選單（MeMenu.tsx 的 AccountMenu）。

import { useMemo, useRef, useState } from 'react';
import { TimelineSkeleton } from '../shared/ui/Skeleton.tsx';
import { commands } from '../appCommands.ts';
import { useApp, useData, usePlan, useShared, useUi } from '../hooks.ts';
import { dayPlanOf } from '../planStore.ts';
import { describeChanges } from '../lib/overlays.ts';
import { dayLabel, isRedDay, tripDates } from '../lib/trip.ts';
import { dayAreaName, dayTitle } from '../lib/dayTitle.ts';
import { stopsOn } from '../lib/itinerary.ts';
import { selectedBarKey, WARNING_ICONS } from '../lib/planView.ts';
import { DayBar, DaySummaryLine, Timeline, useDayTimeline, useProposalDay, useRevealProposal } from './Timeline.tsx';
import { DayCandidates } from './Wishlist.tsx';
import { dayCandidates } from '../lib/wishlist.ts';
import { EditHint, PlanningBar, PlanningToggle } from './Planning.tsx';
import { MemberName, stamp } from './common.tsx';
import { askDay, askTrip } from './webAi.ts';
import { showList } from './SidePanel.tsx';
import { Icon } from './Icon.tsx';

const DATES = tripDates();

function Overview() {
  const itinerary = useData((s) => s.itinerary);
  const byId = useData((s) => s.byId);
  const plan = usePlan((s) => s.plan);
  const updatedBy = useShared((s) => s.updatedBy);
  const updatedAt = useShared((s) => s.updatedAt);
  const version = useShared((s) => s.version);
  const candidates = useShared((s) => s.candidates);
  const proposal = useApp((s) => s.proposal);
  const proposalLines = useMemo(() => {
    if (!proposal) return new Map<string, string>();
    const nameOf = (id: string) => byId.get(id)?.name.zh || byId.get(id)?.name.ja || id;
    return new Map(describeChanges(proposal.changes, nameOf).map((l) => [l.date, l.text.split('：').slice(1).join('：')]));
  }, [proposal, byId]);
  return (
    <div className="day-panel" data-testid="day-panel">
      <div className="day-head">
        <h3>整趟行程</h3>
        <button type="button" className="text-button ask-ai-quiet" onClick={askTrip} data-testid="trip-ask-ai">
          <Icon name="spark" size={20} /> 問 AI
        </button>
        <span className="muted small">
          第 {version} 版・<MemberName id={updatedBy} /> {stamp(updatedAt)} 改的
        </span>
      </div>
      {plan?.warnings.map((w, i) => (
        <p key={i} className={`small warning-${w.level}`}>
          <Icon name={WARNING_ICONS[w.level]} size={16} /> {w.message}
        </p>
      ))}
      <ol className="overview">
        {DATES.map((d) => {
          const stops = stopsOn(itinerary, d).filter((s) => s.kind !== 'lodging' && s.kind !== 'flight');
          const dp = dayPlanOf(plan, d);
          const warn = dp?.warnings.filter((w) => w.level !== 'info').length ?? 0;
          const lodging = itinerary?.days.find((x) => x.date === d)?.lodging;
          const lp = lodging ? byId.get(lodging) : null;
          const cands = dayCandidates(candidates, d, itinerary, byId).length;
          return (
            <li key={d}>
              <button type="button" className={`overview-day ${proposalLines.has(d) ? 'proposed' : ''}`} onClick={() => commands.selectDay(d)} data-overview-day={d}>
                <span className={`overview-date ${isRedDay(d) ? 'red-day' : ''}`}>{dayLabel(d)}</span>
                <span className="overview-stops">
                  {stops.length ? stops.map((s) => byId.get(s.place)?.name.zh || byId.get(s.place)?.name.ja || s.place).join(' → ') : <span className="muted">還沒排</span>}
                  {lp && (
                    <span className="muted small ic-text">
                      <Icon name="bed" size={16} /> {lp.name.zh || lp.name.ja}
                    </span>
                  )}
                  {proposalLines.has(d) && (
                    <span className="overview-change" data-testid="overview-change">
                      {proposalLines.get(d)}
                    </span>
                  )}
                </span>
                <span className="overview-flags">
                  {cands > 0 && (
                    <span className="badge ic-text">
                      <Icon name="calendar" size={16} /> {cands}
                    </span>
                  )}
                  {warn > 0 && (
                    <span className="badge badge-warn ic-text">
                      <Icon name="warn" size={16} /> {warn}
                    </span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** 去想去分頁 */
function goWish() {
  showList('wish');
}

/** 某一天最上面一列（§6.1）：圓體的大日期，旁邊「週五 · 第 4 天 · 鳥羽」；右邊「問 AI」和主要按鈕「編輯」。換天用上面的日期列 */
function DayHead({ day }: { day: string }) {
  const itinerary = useData((s) => s.itinerary);
  const byId = useData((s) => s.byId);
  const areas = useData((s) => s.areas);
  const title = dayTitle(day, dayAreaName(stopsOn(itinerary, day), byId, areas));
  return (
    <div className="day-nav" data-testid="day-nav">
      <h3 className="day-title">
        <span className={`day-title-date ${isRedDay(day) ? 'red-day' : ''}`} data-testid="day-title-date">
          {title.date}
        </span>
        <span className="day-title-sub" data-testid="day-title-sub">
          {title.sub}
        </span>
        {/* 右欄窄時換成短的（沒有「第 N 天」），日期和按鈕才排得進一排 */}
        <span className="day-title-short" data-testid="day-title-short">
          {title.short}
        </span>
      </h3>
      <span className="day-nav-actions">
        <button type="button" className="text-button ask-ai-quiet" onClick={() => askDay(day)} data-testid="day-ask-ai">
          <Icon name="spark" size={20} /> 問 AI
        </button>
        <PlanningToggle />
      </span>
    </div>
  );
}

export function DayPanel() {
  const day = useApp((s) => s.day);
  const planning = useApp((s) => s.planning);
  const shown = useProposalDay(day);
  const tl = useDayTimeline(day, shown?.source);
  const { plan, itDay, status: planStatus, error: planError, dayWarnings } = tl;
  const [warnOpen, setWarnOpen] = useState(false);
  const legOpen = useUi((s) => s.legOpen);
  const detailId = useApp((s) => s.detailId);
  const selectedKey = selectedBarKey(plan, legOpen, detailId);
  const panelRef = useRef<HTMLDivElement>(null);
  useRevealProposal(panelRef, day, !!shown, plan);
  if (day === 'all') return <Overview />;
  return (
    <div className={`day-panel ${planning ? 'editing' : ''}`} data-testid="day-panel" ref={panelRef}>
      <PlanningBar title={`編輯 ${dayLabel(day)}`} />
      {/* 看提議的差異時不畫：按「編輯」提議的卡會不見，要編輯先按提議列的「看原本」 */}
      {!shown && <DayHead day={day} />}
      {plan && (
        <div className="day-head">
          <DaySummaryLine plan={plan} warnOpen={warnOpen} reminders={dayWarnings.length} onWarn={() => setWarnOpen((o) => !o)} />
        </div>
      )}
      {warnOpen && dayWarnings.length > 0 && (
        <ul className="tl-warnings day-warnings" data-testid="day-warnings">
          {dayWarnings.map((w, i) => (
            <li key={i} className={`warning-${w.level}`}>
              <Icon name={WARNING_ICONS[w.level]} size={16} /> {w.message}
            </li>
          ))}
        </ul>
      )}
      {plan && <DayBar plan={plan} selected={selectedKey} />}
      {!itDay && <p className="muted">行程裡沒有這一天。</p>}
      {itDay && planStatus === 'loading' && <TimelineSkeleton />}
      {planStatus === 'error' && <p className="warn">時間軸算不出來：{planError}</p>}
      {!shown && <EditHint />}
      {itDay && plan && <Timeline tl={{ ...tl, itDay, plan }} diff={shown?.diff ?? null} originalPlan={shown?.originalPlan ?? null} />}
      {itDay && plan && itDay.items.length === 0 && (
        <p className="muted small" data-testid="day-empty">
          這天還沒排。到「想去」把想去的點加到這天{' '}
          <button type="button" className="button small" onClick={goWish} data-testid="day-go-wish">
            去想去
          </button>
        </p>
      )}
      <DayCandidates date={day} />
    </div>
  );
}
