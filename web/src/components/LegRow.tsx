// 兩張資料卡中間的交通（第五輪 §3，第八輪 §13.6 改成交通卡）：資料準備在 useLegView（網頁 LegRow、手機 MobileLeg 都用），畫出來的是 shared/ui/LegLine.tsx
// （連線上的方式圓點；卡片第一行方式＋分鐘＋「⚠ 數字」，第二行搭車的膠囊或計程車台數，備註；右邊「map ↗」；編輯中多一顆「改」；T29c spec §8.2）。
// 點那一行：地圖只畫這一段（appStore.legRoute，不是 AI 的 routes，所以不出現「清掉」；搭車的照班次的站畫），每一程上下車的站亮起來，
// 地圖框住這段的兩端；再點一次或點別段就恢復，收起來時地圖回到打開前的範圍（中間被別的操作移過就不回去）（第七輪 §8.2）。
// 點開後（T29c spec §8.3、§8.4）：最上面補充資訊框（這段的警告文字、計程車起跳價、前一站可以多待；淡灰底，沒有就不畫），
// 下面搭車的步驟（legView 的 compactSteps）：一個節點一行（左邊時間、中間細線和圓圈、右邊站名，同一行右邊「等 N 分」或「走 N 分 ↓」），一程一行
// （交通方式顏色外框的膠囊＋發車時間、車程分鐘、右邊「錯過的話」的標籤）。上車站（名稱後面「›」）和標籤點了在地圖那側開那一程的班次表
// （uiStore.openTimetable，只能看）。買票太趕在上車站下面一行橘字；轉乘有說明、有電梯路線的另外一行，說明摺起來。
// 計程車點開只有補充資訊框；步行沒有可以看的就不畫小箭頭。
// 交通的警告（引擎標了 leg: true）只在交通卡（legWarnings），資料卡的 WarnToggle 不再顯示（planView 的 warningsByItem）。
// 編輯：編輯中每段右邊有「改」，按了才打開交通編輯器（uiStore.legEdit；網頁在這一行下面，手機是底部面板 m-leg-sheet，見 mobile/MobileLeg.tsx）：
// 自動（目前的方式）／步行／計程車／大眾運輸、大眾運輸的步驟一定展開；
// 算不出來（交通未定、指定的方式找不到班次）或已經填過分鐘時才出現「自己填分鐘」（清空＝回到自動）；備註、「完成」收起來。
// 一次只開一段（uiStore.legOpen）；這一行不見了（換天、回整趟、換分頁）時也收起來，地圖的行程線才會恢復。
// 編輯中交通也是放置區：拖到這裡＝排在這段通往的那張卡片前面（planDrag.dropOnLegProps）。

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { getLegTravel, setLegTravel, type Itinerary, type Leg, type LegTarget, type TimelineEntry, type TravelSpec } from '@travel-helper/engine';
import type { TravelMode } from '@travel-helper/engine/types';
import { itineraryPathOf } from '../appCommands.ts';
import { appStore } from '../store.ts';
import { extentOf } from '../lib/areas.ts';
import { dataStore } from '../dataStore.ts';
import { shared } from '../appShared.ts';
import { useApp, useData, usePlan, useShared, useUi } from '../hooks.ts';
import { dayPlanOf, engineConfig } from '../planStore.ts';
import { EDITOR_MODES, editorModeOf, legKeyOf, legMapsUrl, legModeName, legTargetOf, legTitle, showMinutesInput, taxiCarsText, type EditorMode } from '../lib/planView.ts';
import { compactSteps, infoLines, legChips, legWarnings, slackHint, warnCount, type CompactStep } from '../lib/legView.ts';
import { rideStations } from '../lib/routing.ts';
import { RIDE_COLOR } from '../lib/modeIcon.ts';
import { openTimetable, uiStore } from '../uiStore.ts';
import { ModeIcon } from './ModeIcon.tsx';
import { LegLine } from '../shared/ui/LegLine.tsx';
import { dropOnLegProps } from './planDrag.ts';

/** 方式選單的字（自動另外接上目前的方式） */
const EDITOR_LABELS: Record<EditorMode, string> = { auto: '自動', walk: '步行', taxi: '計程車', transit: '大眾運輸' };

const isRide = (mode: Leg['mode']) => mode === 'train' || mode === 'bus' || mode === 'ferry';

/** 讀這段已經設定的值；找不到項目（剛被刪掉）時當作沒設定 */
function readSpec(it: Itinerary | null, target: LegTarget | null): TravelSpec | null {
  if (!it || !target) return null;
  try {
    return getLegTravel(it, target);
  } catch {
    return null;
  }
}

/** 一步左邊的細線：步行點線、搭車用交通方式顏色的粗實線 */
type Line = { kind: 'walk' } | { kind: 'ride'; color: string } | null;
const RIDE_LINE = (mode: keyof typeof RIDE_COLOR): Line => ({ kind: 'ride', color: RIDE_COLOR[mode] });
const WALK_LINE: Line = { kind: 'walk' };

/** 節點上面那半段的線：前一步是搭車（那一程的顏色）、轉乘或前一個節點要走路（點線） */
function lineAbove(steps: CompactStep[], i: number): Line {
  const prev = steps[i - 1];
  if (!prev) return null;
  if (prev.kind === 'ride') return RIDE_LINE(prev.mode);
  if (prev.kind === 'transfer' || prev.walk != null) return WALK_LINE;
  return null;
}

/** 節點下面那半段的線：下一步是搭車、轉乘，或從這裡走路 */
function lineBelow(steps: CompactStep[], i: number): Line {
  const s = steps[i];
  const next = steps[i + 1];
  if (!next) return null;
  if (next.kind === 'ride') return RIDE_LINE(next.mode);
  if (next.kind === 'transfer' || (s.kind === 'node' && s.walk != null)) return WALK_LINE;
  return null;
}

/** 細線的一段：full＝整格，top／bottom＝節點圓圈的上半、下半 */
function RailLine({ line, part }: { line: Line; part: 'full' | 'top' | 'bottom' }) {
  if (!line) return null;
  return <span className={`leg-step-ln ${line.kind} ${part}`} style={line.kind === 'ride' ? { borderLeftColor: line.color } : undefined} />;
}

/**
 * 大眾運輸的步驟（T29c spec §8.4，一程一行）：節點一行（等車、走路寫在同一行右邊）、一程一行（膠囊、分鐘、錯過的標籤）、
 * 轉乘有說明或電梯路線時另外一行。上車站、標籤點了開那一程的班次表（只能看）
 */
export function LegSteps({ steps, leg, date, legKey }: { steps: CompactStep[]; leg: Leg; date: string; legKey: string }) {
  const openRide = (rideIndex: number) => openTimetable({ date, legKey, rideIndex });
  return (
    <ol className="leg-steps" data-testid="leg-steps">
      {steps.map((s, i) => {
        if (s.kind === 'node') {
          const above = lineAbove(steps, i);
          const below = lineBelow(steps, i);
          const ride = below?.kind === 'ride' ? below : above?.kind === 'ride' ? above : null;
          // 近鐵特急要另買特急券，其他（JR、船）寫買票（和引擎 ticket-tight 的訊息一樣）
          const ticket = s.board != null && leg.rides[s.board]?.operator === 'kintetsu' ? '特急券' : '票';
          return (
            <li key={i} className="leg-step node" data-testid="leg-step-node">
              <span className="leg-step-tm">{s.time}</span>
              <span className="leg-step-rail">
                <RailLine line={above} part="top" />
                <RailLine line={below} part="bottom" />
                <span className="leg-step-dot" style={ride ? { borderColor: ride.color } : undefined} />
              </span>
              <span className="leg-step-tx">
                <span className="leg-step-line">
                  {s.board != null ? (
                    <button type="button" className="leg-step-name leg-step-board" onClick={() => openRide(s.board!)} data-testid="leg-step-board">
                      <span className="leg-step-nm">{s.name}</span>
                      <span className="leg-step-tap" aria-hidden>
                        ›
                      </span>
                    </button>
                  ) : (
                    <span className="leg-step-name">
                      <span className="leg-step-nm">{s.name}</span>
                    </span>
                  )}
                  {s.walk != null && (
                    <span className="leg-step-walk">
                      走 {s.walk} 分{s.walkLast ? '' : ' ↓'}
                    </span>
                  )}
                  {s.wait != null && (
                    <span className="leg-step-wait" data-testid="leg-step-wait">
                      等 {s.wait} 分
                    </span>
                  )}
                </span>
                {s.ticketTight != null && (
                  <span className="leg-step-tight" data-testid="leg-ticket-tight">
                    到站 {s.ticketTight} 分就發車，買{ticket}可能來不及
                  </span>
                )}
              </span>
            </li>
          );
        }
        if (s.kind === 'transfer') {
          return (
            <li key={i} className="leg-step transfer" data-testid="leg-step-transfer">
              <span className="leg-step-tm" />
              <span className="leg-step-rail">
                <RailLine line={WALK_LINE} part="full" />
              </span>
              <span className="leg-step-tx">
                <span className="leg-xfer">
                  轉乘・走 {s.walk} 分{s.elevatorWalk != null ? `・有電梯的路線約 ${s.elevatorWalk} 分` : ''}
                </span>
                {s.note && (
                  <details className="leg-xfer-note">
                    <summary>轉乘說明</summary>
                    <p>{s.note}</p>
                  </details>
                )}
              </span>
            </li>
          );
        }
        return (
          <li key={i} className="leg-step ride" data-testid="leg-step-ride">
            <span className="leg-step-tm" />
            <span className="leg-step-rail">
              <RailLine line={RIDE_LINE(s.mode)} part="full" />
            </span>
            <span className="leg-step-tx">
              <span className="leg-ride" style={{ '--ride-c': RIDE_COLOR[s.mode] } as CSSProperties} data-testid="leg-ride">
                <ModeIcon mode={s.mode} size="s" />
                {/* 窄的時候名稱省略，發車時間一定看得到 */}
                <span className="leg-ride-name">{s.name}</span>
                {s.depart && <span className="leg-ride-dep">{s.depart}</span>}
              </span>
              <span className="leg-ride-min">{s.minutes} 分</span>
              {s.badge && (
                <button type="button" className={`leg-miss ${s.badge.tone}`} onClick={() => openRide(s.index)} data-testid="leg-miss">
                  {s.badge.text}
                </button>
              )}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** 點開後的內容：補充資訊框（沒有行就不畫）、搭車的步驟 */
export function LegDetail({ v, date }: { v: NonNullable<ReturnType<typeof useLegView>>; date: string }) {
  return (
    <>
      {v.info.length > 0 && (
        <div className="leg-info" data-testid="leg-info">
          {v.info.map((line, i) => (
            <div key={i}>{line}</div>
          ))}
        </div>
      )}
      {v.transit && <LegSteps steps={v.steps} leg={v.leg} date={date} legKey={v.key} />}
    </>
  );
}

/** 編輯中的編輯狀態，由上到下：方式、步驟（children）、（算不出來時）分鐘、備註、完成 */
export function LegEditor({ target, spec, leg, children }: { target: LegTarget; spec: TravelSpec | null; leg: Leg; children?: ReactNode }) {
  const saving = useShared((s) => s.saving);
  // 每次都從最新的行程讀目前的設定再改
  const change = (fn: (cur: TravelSpec | null) => TravelSpec | null, label = '調整交通') => void shared.changeItinerary((it) => setLegTravel(it, target, fn(getLegTravel(it, target))), label);
  const current = editorModeOf(spec);
  const [minutes, setMinutes] = useState(spec?.minutes != null ? String(spec.minutes) : '');
  const [note, setNote] = useState(spec?.note ?? '');
  // 換方式時清掉走法和自己填的分鐘，只留備註
  const pickMode = (m: EditorMode) => {
    if (m === current) return;
    change((cur) => ({ ...(m === 'auto' ? {} : { mode: m }), ...(cur?.note ? { note: cur.note } : {}) }));
  };
  const commitMinutes = () => {
    const n = minutes.trim() === '' ? null : Number(minutes);
    if (n != null && !(Number.isFinite(n) && n >= 0)) return setMinutes(spec?.minutes != null ? String(spec.minutes) : '');
    if (n !== (spec?.minutes ?? null)) change((cur) => ({ ...cur, minutes: n }));
  };
  const commitNote = () => {
    const v = note.trim() === '' ? null : note.trim();
    if (v !== (spec?.note ?? null)) change((cur) => ({ ...cur, note: v }));
  };
  const noTransit = leg.transitAvailable === false;
  // 「自動」寫出它選了什麼（第五輪 §3.4）；指定了別的方式時只寫「自動」（不知道自動會選什麼）
  const label = (m: EditorMode) => (m === 'auto' && current === 'auto' ? `自動（${legModeName(leg.mode)}）` : EDITOR_LABELS[m]);
  return (
    <div className="leg-edit" data-testid="leg-editor">
      <div className="leg-edit-row">
        <span className="leg-modes" role="group" aria-label="交通方式">
          {EDITOR_MODES.map((m) => (
            <button
              key={m}
              type="button"
              className="chip"
              aria-pressed={current === m}
              disabled={saving || (m === 'transit' && noTransit)}
              onClick={() => pickMode(m)}
              data-testid="leg-mode"
              data-mode={m}
            >
              {label(m)}
            </button>
          ))}
        </span>
        {noTransit && (
          <span className="muted small" data-testid="leg-no-transit">
            這兩點之間沒有電車或巴士
          </span>
        )}
      </div>
      {current === 'transit' && leg.rides.length === 0 && <div className="muted small">找不到班次</div>}
      {children}
      {showMinutesInput(leg, spec) && (
        <div className="leg-edit-row">
          <span className="leg-edit-label">時間</span>
          <input
            type="number"
            min={0}
            inputMode="numeric"
            className="leg-minutes"
            placeholder="分鐘"
            aria-label="自己填交通分鐘（空白：自動）"
            value={minutes}
            disabled={saving}
            onChange={(e) => setMinutes(e.target.value)}
            onBlur={commitMinutes}
            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
            data-testid="leg-minutes"
          />
          <span className="muted small">分</span>
        </div>
      )}
      <div className="leg-edit-row">
        <span className="leg-edit-label">備註</span>
        <input
          type="text"
          className="leg-note"
          placeholder="例如：在車站前集合"
          aria-label="交通備註"
          value={note}
          disabled={saving}
          onChange={(e) => setNote(e.target.value)}
          onBlur={commitNote}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          data-testid="leg-note"
        />
        <button type="button" className="chip" onClick={() => uiStore.setState({ legOpen: null, legEdit: null })} data-testid="leg-done">
          完成
        </button>
      </div>
    </div>
  );
}

/** 打開交通前的地圖範圍，和打開時框住兩端那次的請求（seq）：收起來時地圖還停在那次的結果才回去 */
let beforeLeg: { center: [number, number]; zoom: number; seq: number } | null = null;

/** 打開一段交通：框住兩端（第一次打開時記下原本的範圍，換成別段時不覆蓋） */
function frameLeg(a: [number, number], b: [number, number]) {
  const s = appStore.getState();
  const view = beforeLeg ? { center: beforeLeg.center, zoom: beforeLeg.zoom } : s.view && { center: s.view.center, zoom: s.view.zoom };
  s.moveCamera({ bbox: extentOf([a, b])!, zoom: 16 });
  beforeLeg = view ? { ...view, seq: appStore.getState().camera!.seq } : null;
}

/** 收起交通：沒有接著打開別段、地圖也沒被別的操作移過（換天、選中別的點）時，回到打開前的範圍 */
function unframeLeg() {
  queueMicrotask(() => {
    const saved = beforeLeg;
    if (!saved || uiStore.getState().legOpen) return;
    beforeLeg = null;
    const s = appStore.getState();
    if (s.camera?.seq === saved.seq) s.moveCamera({ center: saved.center, zoom: saved.zoom });
  });
}

/**
 * 一段交通要畫的東西（網頁版的交通卡、手機版的一行都用）：方式、膠囊或台數、這段的警告、補充資訊、步驟、點開了沒有、編輯中的設定。
 * 點開時地圖只畫這一段（效果在這裡）；不用顯示（不用移動、0 分）時回 null
 */
export function useLegView(entry: TimelineEntry, date: string) {
  const leg = entry.travel;
  const byId = useData((s) => s.byId);
  const itinerary = useData((s) => s.itinerary);
  const planning = useApp((s) => s.planning);
  const saving = useShared((s) => s.saving);
  // 這天引擎算的結果（交通的警告在 plan.warnings）
  const plan = usePlan((s) => dayPlanOf(s.plan, date));
  const target = legTargetOf(entry, date);
  // 每一段交通有自己的 key（起點、會合這類不能改的也可以點，但不會開到別段）；班次表的 legKey 也是這個
  const key = legKeyOf(entry, date);
  const open = useUi((s) => s.legOpen) === key;
  // 編輯器只有按「改」才開（不會跟著展開自己出現）
  const editOpen = useUi((s) => s.legEdit) === key;
  const spec = readSpec(itinerary, target);
  // 使用者設定過的（包含分鐘填 0）或有備註的不能藏起來，否則改不回來
  const userSet = !!leg?.specified || !!spec;
  const hidden = !leg || (!userSet && (leg.mode === 'none' || (leg.minutes === 0 && !leg.rides.length)));
  const nameOf = (id: string) => byId.get(id)?.name.zh || byId.get(id)?.name.ja || id;
  const fromId = leg?.from ?? null;
  const toId = leg?.to ?? null;
  // 畫線、查路徑用的方式（交通未定、不用移動都當 other）；圖示另外用 leg.mode，交通未定才會是問號
  const mode: TravelMode = leg && leg.mode !== 'none' && leg.mode !== 'unknown' ? leg.mode : 'other';
  const unknown = leg?.mode === 'unknown';
  const minutes = leg?.minutes ?? 0;
  const ridesKey = leg ? leg.rides.map((r) => `${r.mode}:${r.from}>${r.to}`).join('|') : '';
  // 班次本身放 ref：時間軸重算時陣列換了但站一樣，不用重畫
  const ridesRef = useRef(leg?.rides ?? []);
  ridesRef.current = leg?.rides ?? [];

  // 點開時地圖只畫這一段（legRoute），每一程上下車的站亮起來；收起來（或換成別段、離開）就清掉
  useEffect(() => {
    if (!open || !fromId || !toId) return;
    const rides = ridesRef.current;
    // 搭車的照班次的站畫（和地圖上整天的行程線一樣）；其他交給 routeResolver 查
    const byId = dataStore.getState().byId;
    const a = byId.get(fromId);
    const b = byId.get(toId);
    if (!a || !b) return;
    const geometry = rides.length && isRide(mode) ? itineraryPathOf(a, b, mode, rides) : null;
    const stations = rideStations(rides).filter((id) => byId.has(id));
    appStore.getState().setLegRoute({
      from: { place: a.id, coords: a.coords },
      to: { place: b.id, coords: b.coords },
      mode,
      minutes,
      minutesGiven: true,
      label: null,
      geometry: geometry && geometry.length >= 2 ? geometry : null,
      meters: null,
      source: geometry && geometry.length >= 2 ? 'given' : 'pending',
      ...(unknown ? { unknown: true } : {}),
      stations,
    });
    return () => {
      if (appStore.getState().legRoute?.from.place === a.id && appStore.getState().legRoute?.to.place === b.id) appStore.getState().setLegRoute(null);
    };
  }, [open, fromId, toId, mode, unknown, minutes, ridesKey]);

  // 打開時地圖框住兩端；收起來回到原本的範圍（只看打開、收起，交通重算不重新框）
  useEffect(() => {
    if (!open || !fromId || !toId) return;
    const byId = dataStore.getState().byId;
    const a = byId.get(fromId);
    const b = byId.get(toId);
    if (!a || !b) return;
    frameLeg(a.coords, b.coords);
    return unframeLeg;
  }, [open, fromId, toId]);

  // 這張卡不見了（換天、回整趟、換分頁）或換成別段時，開著的是這段就收起來，否則地圖的行程線一直是淡的
  useEffect(() => {
    if (!open) return;
    return () => {
      if (uiStore.getState().legOpen === key) uiStore.setState({ legOpen: null });
    };
  }, [open, key]);
  // 編輯器開著時結束編輯、這一行不見了：編輯器也關掉
  useEffect(() => {
    if (!editOpen) return;
    if (!planning) uiStore.setState({ legEdit: null });
    return () => {
      if (uiStore.getState().legEdit === key) uiStore.setState({ legEdit: null });
    };
  }, [editOpen, planning, key]);

  if (hidden || !leg) return null;
  const editing = open && editOpen && planning && !!target;
  const editable = planning && !!target;
  const from = fromId ? byId.get(fromId) : undefined;
  const to = toId ? byId.get(toId) : undefined;
  const margin = engineConfig.transit.ticketMargin;
  // 收合的第二行：搭車的膠囊、計程車的台數（步行沒有）
  const chips = leg.rides.length ? legChips(leg, nameOf) : null;
  const taxi = taxiCarsText(leg);
  const sub = taxi ? [taxi] : [];
  // 這段的警告（引擎標了 leg: true 的；回住宿那段沒有 itemId）：第一行的 ⚠ 數字、補充資訊框
  const warnings = plan ? legWarnings(plan, entry) : [];
  const warns = warnCount(warnings);
  const info = infoLines(leg, warnings, slackHint(leg, margin));
  const steps = compactSteps(leg, from ? nameOf(from.id) : '', to ? nameOf(to.id) : '', nameOf, margin);
  const transit = steps.length > 0;
  // 點開有東西看（步驟、補充資訊框）或計程車（spec §8.3 也能點開）才畫小箭頭；步行沒有就不畫
  const expandable = transit || info.length > 0 || leg.mode === 'taxi';
  const note = spec?.note && !editing ? spec.note : null;
  /** 點開／收起這段（一次只開一段） */
  const toggleOpen = () => uiStore.setState({ legOpen: open ? null : key, legEdit: null });
  /** 按「改」：打開這段和它的編輯器 */
  const startEdit = () => uiStore.setState({ legOpen: key, legEdit: key });
  return { leg, key, open, editing, editable, planning, saving, target, spec, from, to, mode, chips, sub, warns, info, steps, transit, expandable, note, toggleOpen, startEdit };
}

/** 時間軸上的一段交通（一行 LegLine）；date 是這天的日期 */
export function LegRow({ entry, date }: { entry: TimelineEntry; date: string }) {
  const v = useLegView(entry, date);
  if (!v) return null;
  const { leg, key, open, editing, editable, planning, target, spec, from, to, mode } = v;
  const detail = open ? <LegDetail v={v} date={date} /> : null;
  return (
    <li className={`tl-leg ll-li mode-${leg.mode} ${open ? 'open' : ''} ${editing ? 'editing' : ''}`} data-testid="tl-leg" data-leg={key} {...dropOnLegProps(entry.itemId, date, planning)}>
      <LegLine
        mode={leg.mode}
        title={legTitle(leg) || '交通 0 分'}
        warnCount={v.warns}
        chips={v.chips}
        sub={v.sub}
        note={v.note}
        mapsHref={from && to ? legMapsUrl(from, to, mode) : null}
        onToggle={v.toggleOpen}
        open={open}
        expandable={v.expandable}
        onEdit={editable && !editing ? v.startEdit : null}
      >
        {editing && target ? (
          <LegEditor key={JSON.stringify(spec)} target={target} spec={spec} leg={leg}>
            {detail}
          </LegEditor>
        ) : (
          detail
        )}
      </LegLine>
    </li>
  );
}
