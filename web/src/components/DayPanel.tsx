// 「這一天」面板（interaction-design §3、§6）：上面是確定的行程的時間軸，下面是這天的候選（想去「加到某天」的點）和這天的留言。
// 選「全部」時是整趟的總覽：每天排了什麼、幾個候選、警告。

import { appStore } from '../store.ts';
import { commands } from '../appCommands.ts';
import { useApp, useData, usePlan, useShared } from '../hooks.ts';
import { openDialog } from '../uiStore.ts';
import { dayPlanOf } from '../planStore.ts';
import { dayLabel, tripDates } from '../lib/trip.ts';
import { stopsOn } from '../lib/itinerary.ts';
import { exportFileName, WARNING_ICONS, warningsByItem } from '../lib/planView.ts';
import { dayColor } from '../lib/visual.ts';
import { DayBar, DaySummaryLine, Timeline } from './Timeline.tsx';
import { DayCandidates, DayComments } from './Wishlist.tsx';
import { dayCandidates } from '../lib/wishlist.ts';
import { PlanningToggle } from './Planning.tsx';
import { MemberName, stamp } from './common.tsx';

const DATES = tripDates();

function PanelActions() {
  const itinerary = useData((s) => s.itinerary);
  const version = useShared((s) => s.version);
  return (
    <div className="panel-actions">
      <PlanningToggle />
      <button type="button" className="text-button" onClick={() => openDialog({ kind: 'reservations' })} data-testid="reservations-button">
        📋 需要預約
      </button>
      <button
        type="button"
        className="text-button"
        disabled={!itinerary}
        onClick={() => {
          if (!itinerary) return;
          const url = URL.createObjectURL(new Blob([JSON.stringify(itinerary, null, 2)], { type: 'application/json' }));
          const a = document.createElement('a');
          a.href = url;
          a.download = exportFileName(version);
          a.click();
          URL.revokeObjectURL(url);
        }}
      >
        ⬇ 匯出 JSON
      </button>
    </div>
  );
}

function Overview() {
  const itinerary = useData((s) => s.itinerary);
  const byId = useData((s) => s.byId);
  const plan = usePlan((s) => s.plan);
  const updatedBy = useShared((s) => s.updatedBy);
  const updatedAt = useShared((s) => s.updatedAt);
  const version = useShared((s) => s.version);
  const candidates = useShared((s) => s.candidates);
  return (
    <div className="day-panel" data-testid="day-panel">
      <div className="day-head">
        <h3>整趟行程</h3>
        <span className="muted small">
          第 {version} 版・<MemberName id={updatedBy} /> {stamp(updatedAt)} 改的
        </span>
      </div>
      <PanelActions />
      {plan?.warnings.map((w, i) => (
        <p key={i} className={`small warning-${w.level}`}>
          {WARNING_ICONS[w.level]} {w.message}
        </p>
      ))}
      <ol className="overview">
        {DATES.map((d) => {
          const stops = stopsOn(itinerary, d).filter((s) => s.kind !== 'lodging' && s.kind !== 'flight');
          const dp = dayPlanOf(plan, d);
          const warn = dp?.warnings.filter((w) => w.level !== 'info').length ?? 0;
          const lodging = itinerary?.days.find((x) => x.date === d)?.lodging;
          const lp = lodging ? byId.get(lodging) : null;
          const cands = dayCandidates(candidates, d, itinerary).length;
          return (
            <li key={d}>
              <button type="button" className="overview-day" onClick={() => commands.selectDay(d)} data-overview-day={d}>
                <span className="overview-dot" style={{ background: dayColor(DATES, d) }} />
                <span className="overview-date">{dayLabel(d)}</span>
                <span className="overview-stops">
                  {stops.length ? stops.map((s) => byId.get(s.place)?.name.zh || byId.get(s.place)?.name.ja || s.place).join(' → ') : <span className="muted">還沒排</span>}
                  {lp && <span className="muted small">　🏨 {lp.name.zh || lp.name.ja}</span>}
                </span>
                <span className="overview-flags">
                  {cands > 0 && <span className="badge">📋 {cands}</span>}
                  {warn > 0 && <span className="badge badge-warn">⚠️ {warn}</span>}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export function DayPanel() {
  const day = useApp((s) => s.day);
  const itinerary = useData((s) => s.itinerary);
  const planStatus = usePlan((s) => s.status);
  const planError = usePlan((s) => s.error);
  const plan = usePlan((s) => (day === 'all' ? null : dayPlanOf(s.plan, day)));
  if (day === 'all') return <Overview />;
  const itDay = itinerary?.days.find((d) => d.date === day) ?? null;
  const { day: dayWarnings } = warningsByItem(plan);
  return (
    <div className="day-panel" data-testid="day-panel">
      <div className="day-head">
        <h3>
          <span className="overview-dot" style={{ background: dayColor(DATES, day) }} />
          {dayLabel(day)}
        </h3>
        {plan && <DaySummaryLine plan={plan} />}
      </div>
      {plan && <DayBar plan={plan} color={dayColor(DATES, day)} />}
      <PanelActions />
      {!itDay && <p className="muted">行程裡沒有這一天。</p>}
      {itDay && planStatus === 'loading' && <p className="muted">計算時間軸中…</p>}
      {planStatus === 'error' && <p className="warn">時間軸算不出來：{planError}</p>}
      {dayWarnings.length > 0 && (
        <details className="day-warnings" data-testid="day-warnings">
          <summary className="small">
            {WARNING_ICONS[dayWarnings.some((w) => w.level !== 'info') ? 'warning' : 'info']} 這天有 {dayWarnings.length} 個提醒
          </summary>
          <ul className="tl-warnings">
            {dayWarnings.map((w, i) => (
              <li key={i} className={`warning-${w.level}`}>
                {WARNING_ICONS[w.level]} {w.message}
              </li>
            ))}
          </ul>
        </details>
      )}
      {itDay && plan && <Timeline plan={plan} day={itDay} />}
      {itDay && plan && itDay.items.length === 0 && <p className="muted small">這天還沒排東西。在「❤️ 想去」把點加到這天，再進入規劃模式，從下面的候選按 ↑ 排進。</p>}
      <DayCandidates date={day} />
      <DayComments date={day} />
      <button type="button" className="text-button small" onClick={() => appStore.getState().selectDay('all')}>
        ← 看整趟
      </button>
    </div>
  );
}
