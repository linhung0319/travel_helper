// 整趟的直的骨架（T45b 起，T54 改版；interaction-design §19.1、§24）：網頁右欄、手機、iPad 共用同一份直的清單。
// 第一列、最後一列是航班；中間一天一列：左邊細的地區色帶（換區時空一點，還沒決定是灰色虛線）、日期、這天在哪一區（第二行小字是子地區），
// 右邊固定兩格「住哪區」「住宿」，寫的是狀態：住哪區＝區名（選了住宿加 鎖）或「未選區」；住宿＝名字加「待訂／✓ 已訂」、「未選住宿」或「—」。
// 列本身不能點（進某一天用日期列）。點「未選區」或區名：下面展開地區鈕（連著好幾晚沒決定時可以一次套用）；點有 鎖 的區名：說明加「拿掉住宿」；
// 點「未選住宿」：說明加兩個捷徑（看那區的住宿、問 AI 推薦，捷徑由網頁、手機各自給 actions）。
// 最上面一行數字「11 晚 · 區 8／11 · 住宿 6／11 · 已訂 3」和「只看還沒決定的」。
// 有提議時那天變色、列出變動；看提議（proposalView 是 diff）時整份用提議之後的行程畫，有變的格子芥子黃框、旁邊劃掉舊值（T48）；這時格子不能點。

import { nightAreaOf, setLodging, setNightArea } from '@travel-helper/engine';
import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { shared } from '../../appShared.ts';
import { dataStore } from '../../dataStore.ts';
import { useApp, useData, useShared, useUi } from '../../hooks.ts';
import { areaColor, areaTint } from '../../lib/areas.ts';
import { areaNameIn, describeChanges } from '../../lib/overlays.ts';
import { isRedDay, shortDayLabel, weekdayZh } from '../../lib/trip.ts';
import {
  areaNameOf,
  isUndecided,
  openLodgingRun,
  placeAreaOf,
  skeletonCounts,
  skeletonDiff,
  skeletonRows,
  undecidedRun,
  type SkeletonRow,
  type SkeletonRowDiff,
  type StayBooking,
} from '../../lib/tripSkeleton.ts';
import type { Itinerary } from '@travel-helper/engine/types';
import type { Area } from '../../data/types.ts';
import type { Reservation } from '../../backend/types.ts';
import { Icon } from '../../components/Icon.tsx';

/** 「未選住宿」的兩個捷徑：網頁、手機的分頁和聊天室位置不一樣，各自給 */
export interface SkeletonActions {
  /** 到探索、選那區、捲到住宿那排 */
  lodgingShelf(area: string): void;
  /** 問 AI 推薦這幾晚在這區的住宿 */
  askLodging(dates: string[], area: string): void;
}

/** 換到探索之後捲到那排書架（畫出來要等幾個畫面，最多等半秒） */
export function scrollToShelf(id: string) {
  let n = 0;
  const tick = () => {
    const el = document.querySelector<HTMLElement>(`[data-testid="shelf"][data-shelf="${CSS.escape(id)}"]`);
    if (el) el.scrollIntoView({ block: 'start' });
    else if (n++ < 30) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

const rangeLabel =(dates: string[]) => (dates.length > 1 ? `${shortDayLabel(dates[0])}–${shortDayLabel(dates.at(-1)!)}` : shortDayLabel(dates[0]));

/** 選這幾晚住哪一區：存進 nights（換區會清掉這晚的住宿，engine 的 setNightArea），跳「復原」 */
export async function chooseNightArea(date: string | string[], area: string | null, areas: Area[]) {
  const dates = Array.isArray(date) ? date : [date];
  const byId = dataStore.getState().byId;
  const name = area ? areaNameOf(areas)(area) : null;
  const text = `${rangeLabel(dates)} 晚上${name ? `住${name}` : '的區清掉'}`;
  return shared.changeItinerary((it) => dates.reduce((x, d) => setNightArea(x, d, area, nightAreaOf(x, d, placeAreaOf(byId))), it), text, { undo: { text: `已改・${text}` } });
}

/** 拿掉這晚的住宿，區留著（換區前先拿掉，T54） */
export async function removeNightLodging(date: string) {
  const byId = dataStore.getState().byId;
  const text = `${shortDayLabel(date)} 晚上的住宿拿掉`;
  return shared.changeItinerary((it) => setLodging(it, date, null, null, nightAreaOf(it, date, placeAreaOf(byId))), text, { undo: { text: `已改・${text}` } });
}

/** 地區按鈕一列（整趟展開、單天頂端共用）：照 areas 的順序；current 是現在的區（加「清掉」）；dates 給了就一次套用那幾晚 */
export function AreaPicker({ date, dates, current, onDone, testId = 'area-picker' }: { date: string; dates?: string[]; current: string | null; onDone?: () => void; testId?: string }) {
  const areas = useData((s) => s.areas);
  const [busy, setBusy] = useState(false);
  const pick = async (a: string | null) => {
    setBusy(true);
    const r = await chooseNightArea(a && dates?.length ? dates : date, a, areas);
    setBusy(false);
    if (r.ok) onDone?.();
  };
  return (
    <div className="ui-area-picker" role="group" aria-label="選這晚住哪一區" data-testid={testId}>
      {areas.map((a) => (
        <button
          key={a.id}
          type="button"
          className={`ui-area-btn ${a.id === current ? 'on' : ''}`}
          style={{ '--area': areaColor(areas, a.id), '--area-tint': areaTint(areas, a.id) } as CSSProperties}
          disabled={busy || a.id === current}
          onClick={() => pick(a.id)}
          data-area={a.id}
          data-testid="area-pick"
        >
          {a.name.zh || a.name.ja}
        </button>
      ))}
      {current && (
        <button type="button" className="ui-area-btn clear" disabled={busy} onClick={() => pick(null)} data-testid="area-clear">
          清掉
        </button>
      )}
    </div>
  );
}

function flightLine(it: Itinerary, date: string | undefined, dir: 'arrive' | 'depart'): string | null {
  const day = it.days.find((d) => d.date === date);
  const times = (day?.items ?? []).flatMap((x) => (x.type === 'flight' && x.direction === dir ? [dir === 'arrive' ? x.arrive : x.depart] : []));
  if (!times.length) return null;
  return dir === 'arrive' ? `${times.join('／')} 到關西` : `${times.join('／')} 起飛`;
}

/** 有變的格子劃掉的舊值（原本空的寫「未定」） */
const Old = ({ text }: { text: string | null }) => (
  <s className="ui-sk-old" data-testid="sk-old">
    {text ?? '未定'}
  </s>
);

/** 看提議時有變的那格芥子黃框，下面劃掉舊值 */
function Changed({ diff, testId, children }: { diff?: { before: string | null }; testId: string; children: ReactNode }) {
  return (
    <span className={`ui-sk-cell ${diff ? 'changed' : ''}`} data-testid={diff ? testId : undefined}>
      {children}
      {diff && <Old text={diff.before} />}
    </span>
  );
}

/** 每晚的預約狀態：看預約筆記這段連住的第一晚（沒寫過是待訂，同 lib/reservations.ts 的 noteRows） */
const bookingOf = (reservations: Reservation[]) => (placeId: string, date: string) => reservations.find((r) => r.placeId === placeId && r.date === date)?.status as StayBooking | undefined;

/** 整趟的數字（T54）：「11 晚 · 區 8／11 · 住宿 6／11 · 已訂 3」。看提議時照提議之後的行程算（同骨架，T48） */
export function TripNightCount({ className = 'ui-sk-count' }: { className?: string }) {
  const itinerary = useData((s) => s.itinerary);
  const byId = useData((s) => s.byId);
  const areas = useData((s) => s.areas);
  const reservations = useShared((s) => s.reservations);
  const proposal = useApp((s) => s.proposal);
  const view = useUi((s) => s.proposalView);
  if (!itinerary) return null;
  const c = skeletonCounts(skeletonRows({ itinerary: proposal && view === 'diff' ? proposal.itinerary : itinerary, areas, byId, booking: bookingOf(reservations) }));
  return (
    <span className={className} data-testid="sk-count">
      {c.total} 晚 · 區 {c.areas}／{c.total} · 住宿 {c.lodgings}／{c.total} · 已訂 {c.booked}
    </span>
  );
}

type Panel = { date: string; kind: 'area' | 'lock' | 'stay' };

/** 住哪區那格：區名（選了住宿加 鎖）或「未選區」；最後一天空著 */
function AreaCell({ row, areas, readOnly, open, onToggle }: { row: SkeletonRow; areas: Area[]; readOnly: boolean; open: boolean; onToggle: () => void }) {
  if (!row.stay) return <span className="ui-sk-area empty" />;
  const a = row.nightArea;
  const locked = row.stay.kind === 'lodging';
  const style = a ? ({ '--area': areaColor(areas, a), '--area-tint': areaTint(areas, a) } as CSSProperties) : undefined;
  return (
    <button
      type="button"
      className={`ui-sk-area ${a ? 'set' : 'none'}`}
      style={style}
      aria-expanded={open}
      aria-label={a ? `住${areaNameOf(areas)(a)}${locked ? '（已選住宿，鎖定）' : ''}` : '未選區'}
      disabled={readOnly}
      onClick={onToggle}
      data-testid="sk-area"
      data-state={a ? (locked ? 'locked' : 'set') : 'none'}
    >
      <span className="ui-sk-cell-text">{a ? areaNameOf(areas)(a) : '未選區'}</span>
      {locked && (
        <span className="ui-sk-lock" aria-hidden>
          <Icon name="lock" size={16} />
        </span>
      )}
    </button>
  );
}

const BOOKING_LABEL: Partial<Record<StayBooking, string>> = { pending: '待訂', booked: '✓ 已訂' };

/** 住宿那格：名字加「待訂／✓ 已訂」、區定了沒住宿是「未選住宿」（可以點）、區還沒定是「—」；最後一天空著 */
function StayCell({ row, readOnly, open, onToggle }: { row: SkeletonRow; readOnly: boolean; open: boolean; onToggle: () => void }) {
  const s = row.stay;
  if (!s) return <span className="ui-sk-stay empty" />;
  if (s.kind === 'lodging') {
    return (
      <span className="ui-sk-stay lodging" data-testid="sk-stay" data-stay="lodging" data-booking={s.booking}>
        <span className="ui-sk-cell-text">{s.name}</span>
        {BOOKING_LABEL[s.booking] && (
          <small className={`ui-sk-booking ${s.booking}`} data-testid="sk-booking">
            {BOOKING_LABEL[s.booking]}
          </small>
        )}
      </span>
    );
  }
  if (s.kind === 'none') {
    return (
      <span className="ui-sk-stay none" data-testid="sk-stay" data-stay="none">
        —
      </span>
    );
  }
  return (
    <button type="button" className="ui-sk-stay open" aria-expanded={open} disabled={readOnly} onClick={onToggle} data-testid="sk-stay" data-stay="area">
      未選住宿
    </button>
  );
}

/** 點「未選區」或區名：地區鈕；連著好幾晚沒決定時多一個「2/9–2/11 都套用」（預設勾著） */
function AreaPanel({ rows, row, onDone }: { rows: SkeletonRow[]; row: SkeletonRow; onDone: () => void }) {
  const run = undecidedRun(rows, row.date);
  const [all, setAll] = useState(true);
  return (
    <>
      {run && (
        <label className="ui-sk-apply" data-testid="sk-apply-all">
          <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /> {rangeLabel(run)} 都套用
        </label>
      )}
      <AreaPicker date={row.date} dates={run && all ? run : undefined} current={row.nightArea} onDone={onDone} />
    </>
  );
}

/** 點有 鎖 的區名：為什麼不能換、「拿掉住宿」（拿掉後接著展開地區鈕） */
function LockPanel({ row, onRemoved }: { row: SkeletonRow; onRemoved: () => void }) {
  const [busy, setBusy] = useState(false);
  const remove = async () => {
    setBusy(true);
    const r = await removeNightLodging(row.date);
    setBusy(false);
    if (r.ok) onRemoved();
  };
  return (
    <p className="ui-sk-note" data-testid="sk-lock-note">
      <span>已選了住宿，要換區先拿掉住宿</span>
      <button type="button" className="ui-sk-link" disabled={busy} onClick={remove} data-testid="sk-unlock">
        拿掉住宿
      </button>
    </p>
  );
}

/** 點「未選住宿」：住宿從哪裡選，加「看二見的住宿 ›」「✦ 問 AI 推薦」 */
function StayPanel({ rows, row, areas, actions }: { rows: SkeletonRow[]; row: SkeletonRow; areas: Area[]; actions?: SkeletonActions }) {
  const area = row.nightArea!;
  return (
    <div className="ui-sk-note" data-testid="sk-stay-note">
      <span>住宿從地點的詳情按「排進行程」選</span>
      {actions && (
        <span className="ui-sk-links">
          <button type="button" className="ui-sk-link" onClick={() => actions.lodgingShelf(area)} data-testid="sk-stay-shelf">
            看{areaNameOf(areas)(area)}的住宿 ›
          </button>
          <button type="button" className="ui-sk-link" onClick={() => actions.askLodging(openLodgingRun(rows, row.date), area)} data-testid="sk-stay-ask">
            <Icon name="spark" size={16} /> 問 AI 推薦
          </button>
        </span>
      )}
    </div>
  );
}

/** head＝false：不畫「整趟」那一列（手機的標題列自己畫，mobile/TripOverview）；數字那行兩邊都畫 */
export function TripSkeleton({ head = true, actions }: { head?: boolean; actions?: SkeletonActions }) {
  const itinerary = useData((s) => s.itinerary);
  const byId = useData((s) => s.byId);
  const areas = useData((s) => s.areas);
  const proposal = useApp((s) => s.proposal);
  const view = useUi((s) => s.proposalView);
  const reservations = useShared((s) => s.reservations);
  const [panel, setPanel] = useState<Panel | null>(null);
  const [onlyOpen, setOnlyOpen] = useState(false);
  const changes = useMemo(() => {
    if (!proposal) return new Map<string, string>();
    const nameOf = (id: string) => byId.get(id)?.name.zh || byId.get(id)?.name.ja || id;
    return new Map(describeChanges(proposal.changes, nameOf, areaNameIn(areas)).map((l) => [l.date, l.text.split('：').slice(1).join('：')]));
  }, [proposal, byId, areas]);
  if (!itinerary) return null;
  const booking = bookingOf(reservations);
  // 看提議：畫提議之後的行程，和確定的比出有變的格子；這時格子不能點（點了是改確定的行程）
  const proposed = proposal && view === 'diff' ? proposal.itinerary : null;
  const shown = proposed ?? itinerary;
  const rows = skeletonRows({ itinerary: shown, areas, byId, booking });
  const diffs = proposed ? skeletonDiff(rows, skeletonRows({ itinerary, areas, byId, booking }), areas) : new Map<string, SkeletonRowDiff>();
  const arrive = flightLine(shown, shown.days[0]?.date, 'arrive');
  const depart = flightLine(shown, shown.days.at(-1)?.date, 'depart');
  const visible = onlyOpen ? rows.filter(isUndecided) : rows;
  const toggle = (date: string, kind: Panel['kind']) => setPanel(panel?.date === date && panel.kind === kind ? null : { date, kind });
  return (
    <div className="ui-sk" data-testid="trip-skeleton" data-view={proposed ? 'proposal' : 'trip'}>
      {head && (
        <div className="ui-sk-head">
          <span className="ui-sk-title">整趟</span>
        </div>
      )}
      <div className="ui-sk-bar">
        <TripNightCount />
        <button type="button" className={`ui-sk-filter ${onlyOpen ? 'on' : ''}`} aria-pressed={onlyOpen} onClick={() => setOnlyOpen(!onlyOpen)} data-testid="sk-only-open">
          只看還沒決定的
        </button>
      </div>
      <div className="ui-sk-cols" aria-hidden>
        <span>住哪區</span>
        <span>住宿</span>
      </div>
      <ol className="ui-sk-list">
        {arrive && (
          <li className="ui-sk-flight" data-testid="sk-flight-arrive">
            <Icon name="plane" size={16} /> {arrive}
          </li>
        )}
        {onlyOpen && !visible.length && (
          <li className="ui-sk-empty" data-testid="sk-all-decided">
            每晚的區和住宿都決定了
          </li>
        )}
        {visible.map((r) => {
          const rail = r.rail;
          const railStyle = rail ? ({ '--area': areaColor(areas, rail.area) } as CSSProperties) : undefined;
          const open = !proposed && panel?.date === r.date ? panel.kind : null;
          const diff = diffs.get(r.date);
          const locked = r.stay?.kind === 'lodging';
          const blank = r.stay?.kind === 'none';
          return (
            <li key={r.date} className={`ui-sk-row ${blank ? 'blank' : ''} ${changes.has(r.date) ? 'proposed' : ''}`} data-date={r.date} data-testid="sk-row" data-area={r.nightArea ?? ''}>
              <span className={`ui-sk-rail ${rail ? `${rail.pos} ${rail.area ? '' : 'undecided'}` : 'none'}`} style={railStyle} aria-hidden />
              <span className={`ui-sk-date ${isRedDay(r.date) ? 'red-day' : ''}`} data-overview-day={r.date} data-testid="sk-day">
                {shortDayLabel(r.date)}
                <small>（{weekdayZh(r.date)}）</small>
              </span>
              <span className="ui-sk-where">
                <span className="ui-sk-where-line">
                  <b className={`${r.where ? '' : 'muted'} ${diff?.where ? 'changed' : ''}`} data-testid="sk-where">
                    {r.where ?? '還沒決定'}
                  </b>
                  {diff?.where && <Old text={diff.where.before} />}
                </span>
                {r.regions.length > 0 && <small data-testid="sk-regions">{r.regions.join(' → ')}</small>}
                {changes.has(r.date) && (
                  <span className="overview-change" data-testid="overview-change">
                    {changes.get(r.date)}
                  </span>
                )}
              </span>
              <Changed diff={diff?.area} testId="sk-area-changed">
                <AreaCell row={r} areas={areas} readOnly={!!proposed} open={open === 'area' || open === 'lock'} onToggle={() => toggle(r.date, locked ? 'lock' : 'area')} />
              </Changed>
              <Changed diff={diff?.stay} testId="sk-stay-changed">
                <StayCell row={r} readOnly={!!proposed} open={open === 'stay'} onToggle={() => toggle(r.date, 'stay')} />
              </Changed>
              {open && (
                <div className="ui-sk-pick" data-testid="sk-panel" data-kind={open}>
                  {open === 'area' && <AreaPanel rows={rows} row={r} onDone={() => setPanel(null)} />}
                  {open === 'lock' && <LockPanel row={r} onRemoved={() => setPanel({ date: r.date, kind: 'area' })} />}
                  {open === 'stay' && <StayPanel rows={rows} row={r} areas={areas} actions={actions} />}
                </div>
              )}
            </li>
          );
        })}
        {depart && (
          <li className="ui-sk-flight" data-testid="sk-flight-depart">
            <Icon name="plane" size={16} /> {depart}
          </li>
        )}
      </ol>
    </div>
  );
}
