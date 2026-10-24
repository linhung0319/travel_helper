// 「行程」分頁（interaction-design §3、§6），兩層，像探索的清單和詳情：
// 選「全部」是整趟的總覽（每天排了什麼、幾個候選、警告）；選了某一天，最上面一列是「← 整趟、日期 ‹ ›、問 AI、規劃」，
// 下面是摘要列（⚠ 點了展開提醒）、細的比例橫條、時間軸（資料卡是類型的淡底色，起點、終點的住宿也是卡片）、這天的候選（想去「加到某天」的點）。留言、預約、匯出在日期列（TopBar）。

import { useState } from 'react';
import { appStore } from '../store.ts';
import { commands } from '../appCommands.ts';
import { useApp, useData, usePlan, useShared } from '../hooks.ts';
import { dayPlanOf } from '../planStore.ts';
import { dayLabel, tripDates } from '../lib/trip.ts';
import { stopsOn } from '../lib/itinerary.ts';
import { WARNING_ICONS, warningsByItem } from '../lib/planView.ts';
import { dayColor } from '../lib/visual.ts';
import { DayBar, DaySummaryLine, Timeline } from './Timeline.tsx';
import { DayCandidates } from './Wishlist.tsx';
import { dayCandidates } from '../lib/wishlist.ts';
import { PlanningToggle } from './Planning.tsx';
import { MemberName, stamp } from './common.tsx';
import { askAiAboutDay } from './askAi.ts';
import { showList } from './SidePanel.tsx';

const DATES = tripDates();

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
                  {cands > 0 && <span className="badge">📅 {cands}</span>}
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

/** 去想去分頁（手機是下方面板的想去分頁） */
function goWish() {
  showList('wish');
  appStore.getState().setSheet({ tab: 'wish' });
}

/** 某一天最上面一列：← 整趟、日期 ‹ ›、問 AI、規劃 */
function DayHead({ day }: { day: string }) {
  const i = DATES.indexOf(day);
  return (
    <div className="day-nav" data-testid="day-nav">
      <button type="button" className="text-button" onClick={() => commands.selectDay('all')} data-testid="day-back">
        ← 整趟
      </button>
      <h3>
        <span className="overview-dot" style={{ background: dayColor(DATES, day) }} />
        {dayLabel(day)}
      </h3>
      <span className="day-step">
        <button type="button" className="text-button" aria-label="前一天" disabled={i <= 0} onClick={() => commands.selectDay(DATES[i - 1])} data-testid="day-prev">
          ‹
        </button>
        <button type="button" className="text-button" aria-label="後一天" disabled={i < 0 || i >= DATES.length - 1} onClick={() => commands.selectDay(DATES[i + 1])} data-testid="day-next">
          ›
        </button>
      </span>
      <span className="day-nav-actions">
        <button type="button" className="text-button" onClick={() => askAiAboutDay(day)} data-testid="day-ask-ai">
          🤖 問 AI
        </button>
        <PlanningToggle />
      </span>
    </div>
  );
}

export function DayPanel() {
  const day = useApp((s) => s.day);
  const itinerary = useData((s) => s.itinerary);
  const planStatus = usePlan((s) => s.status);
  const planError = usePlan((s) => s.error);
  const plan = usePlan((s) => (day === 'all' ? null : dayPlanOf(s.plan, day)));
  const [warnOpen, setWarnOpen] = useState(false);
  if (day === 'all') return <Overview />;
  const itDay = itinerary?.days.find((d) => d.date === day) ?? null;
  const { day: dayWarnings } = warningsByItem(plan);
  return (
    <div className="day-panel" data-testid="day-panel">
      <DayHead day={day} />
      {plan && (
        <div className="day-head">
          <DaySummaryLine plan={plan} warnOpen={warnOpen} reminders={dayWarnings.length} onWarn={() => setWarnOpen((o) => !o)} />
        </div>
      )}
      {warnOpen && dayWarnings.length > 0 && (
        <ul className="tl-warnings day-warnings" data-testid="day-warnings">
          {dayWarnings.map((w, i) => (
            <li key={i} className={`warning-${w.level}`}>
              {WARNING_ICONS[w.level]} {w.message}
            </li>
          ))}
        </ul>
      )}
      {plan && <DayBar plan={plan} color={dayColor(DATES, day)} thin />}
      {!itDay && <p className="muted">行程裡沒有這一天。</p>}
      {itDay && planStatus === 'loading' && <p className="muted">計算時間軸中…</p>}
      {planStatus === 'error' && <p className="warn">時間軸算不出來：{planError}</p>}
      {itDay && plan && <Timeline plan={plan} day={itDay} />}
      {itDay && plan && itDay.items.length === 0 && (
        <p className="muted small" data-testid="day-empty">
          這天還沒排。到 ❤️ 想去把想去的點加到這天{' '}
          <button type="button" className="button small" onClick={goWish} data-testid="day-go-wish">
            去想去
          </button>
        </p>
      )}
      <DayCandidates date={day} />
    </div>
  );
}
