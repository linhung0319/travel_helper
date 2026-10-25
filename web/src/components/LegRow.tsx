// 兩張資料卡中間的交通卡（第五輪 §3）：平常收起，只有標題——左邊交通圖示，第一行方式＋分鐘，
// 第二行距離（路線距離，還沒查到才寫直線）、計程車台數、含等車、📝 備註；右邊 Google Maps 小圖示，大眾運輸加 ▸。
// 點卡片：地圖只畫這一段（commands.drawRoute，搭車的照班次的站畫），每一程上下車的站亮起來；再點一次或點別段就恢復。
// 大眾運輸點了就展開步驟（legSteps）：左邊時間、中間細線（步行點線、搭車用圖示色的粗實線、節點小圓圈）、右邊文字；
// 搭車那一行是膠囊，點了在地圖那側開班次表（uiStore.openTimetable，一般模式只能看）。步行、計程車沒有步驟，不展開。
// 編輯中，點開的那張就在原地變成編輯狀態（藍框）：自動（目前的方式）／步行／計程車／大眾運輸、
// 大眾運輸的步驟一定展開，膠囊換成只列搭得到的班次的下拉（selectRideTrip）；
// 算不出來（交通未定、指定的方式找不到班次）或已經填過分鐘時才出現「自己填分鐘」（清空＝回到自動）；備註、「完成」收起來。
// 一次只開一段（uiStore.legOpen）；這張卡不見了（換天、回整趟、換分頁）時也收起來，地圖的行程線才會恢復。
// 編輯中交通卡也是放置區：拖到這裡＝排在這段通往的那張卡片前面（planDrag.dropOnLegProps）。

import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { getLegTravel, setLegTravel, type Itinerary, type Leg, type LegTarget, type RideDeparture, type TimelineEntry, type TravelSpec } from '@travel-helper/engine';
import type { TravelMode } from '@travel-helper/engine/types';
import { commands, itineraryPathOf, roadRouter } from '../appCommands.ts';
import { dataStore } from '../dataStore.ts';
import { shared } from '../appShared.ts';
import { departuresOf } from '../planStore.ts';
import { useApp, useData, useShared, useUi } from '../hooks.ts';
import {
  EDITOR_MODES,
  departureChoices,
  departureRows,
  editorModeOf,
  legDistance,
  legKeyOf,
  legMapsUrl,
  legModeName,
  legSteps,
  legSubParts,
  legTargetOf,
  legTitle,
  rideReadyAt,
  showMinutesInput,
  specWithRide,
  type EditorMode,
  type LegStep,
} from '../lib/planView.ts';
import { lineMeters, rideStations } from '../lib/routing.ts';
import { MODE_ICON, modeIconKey } from '../lib/modeIcon.ts';
import { openTimetable, uiStore } from '../uiStore.ts';
import { ModeIcon } from './ModeIcon.tsx';
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

/**
 * 選某一程的班次（交通卡的下拉、地圖那側的班次表都用）：寫進這段的 TravelSpec.trip，方式照舊、轉乘站 via 照舊。
 * 後面那程接不上時引擎改成接得上的最早一班
 */
export function selectRideTrip(target: LegTarget, leg: Leg, rideIndex: number, dep: RideDeparture): void {
  void shared.changeItinerary((it) => setLegTravel(it, target, specWithRide(getLegTravel(it, target), leg, rideIndex, dep)), '換班次');
}

/** 編輯中搭車那一行的班次下拉：只列搭得到的（和選定的那班），搭不到的收成一行不能選的說明 */
function RideSelect({ leg, index, date, target, disabled }: { leg: Leg; index: number; date: string; target: LegTarget; disabled: boolean }) {
  const ride = leg.rides[index];
  const readyAt = rideReadyAt(leg, index);
  const selectedId = ride.tripId ?? '';
  const { missedNote, options } = departureChoices(departureRows(departuresOf(date, ride), readyAt, selectedId || null), readyAt);
  // 時刻表查不到目前這班（資料缺、還在載入）：照樣列出目前這班，只是不能從清單換回來
  const list = options.some((o) => o.tripId === selectedId) ? options : [{ tripId: selectedId, label: `${ride.depart} 發 → ${ride.arrive} 到` }, ...options];
  const pick = (tripId: string) => {
    const o = options.find((x) => x.tripId === tripId);
    if (o && tripId !== selectedId) selectRideTrip(target, leg, index, o.row);
  };
  return (
    <select
      className="leg-ride-select"
      aria-label={`第 ${index + 1} 程的班次`}
      value={selectedId}
      disabled={disabled || options.length === 0}
      onChange={(e) => pick(e.target.value)}
      data-testid="leg-ride-select"
    >
      {missedNote && (
        <option disabled value="__missed">
          {missedNote}
        </option>
      )}
      {list.map((o) => (
        <option key={o.tripId} value={o.tripId}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

/** 一步左邊的細線：步行點線、搭車用圖示色的粗實線 */
type Line = { kind: 'walk' } | { kind: 'ride'; color: string } | null;
const lineOf = (s: LegStep | undefined): Line => (s?.kind === 'walk' ? { kind: 'walk' } : s?.kind === 'ride' ? { kind: 'ride', color: MODE_ICON[modeIconKey(s.mode)].bg } : null);

/** 細線的一段：full＝整格，top／bottom＝節點圓圈的上半、下半 */
function RailLine({ line, part }: { line: Line; part: 'full' | 'top' | 'bottom' }) {
  if (!line) return null;
  return <span className={`leg-step-ln ${line.kind} ${part}`} style={line.kind === 'ride' ? { borderLeftColor: line.color } : undefined} />;
}

/** 大眾運輸的步驟（第五輪 §3.2）；編輯中搭車那一行是班次下拉 */
function LegSteps({ steps, leg, date, legKey, target, editing, saving }: { steps: LegStep[]; leg: Leg; date: string; legKey: string; target: LegTarget | null; editing: boolean; saving: boolean }) {
  const openRide = (rideIndex: number) => openTimetable({ date, legKey, rideIndex });
  return (
    <ol className="leg-steps" data-testid="leg-steps">
      {steps.map((s, i) => {
        if (s.kind === 'node') {
          const above = lineOf(steps[i - 1]);
          const below = lineOf(steps[i + 1]);
          const ride = below?.kind === 'ride' ? below : above?.kind === 'ride' ? above : null;
          return (
            <li key={i} className="leg-step node" data-testid="leg-step">
              <span className="leg-step-tm">{s.time}</span>
              <span className="leg-step-rail">
                <RailLine line={above} part="top" />
                <RailLine line={below} part="bottom" />
                <span className="leg-step-dot" style={ride ? { borderColor: ride.color } : undefined} />
              </span>
              <span className="leg-step-tx">
                {s.name}
                {s.wait ? (
                  <span className="leg-step-wait" data-testid="leg-step-wait">
                    ⏳ 等 {s.wait} 分
                  </span>
                ) : null}
              </span>
            </li>
          );
        }
        return (
          <li key={i} className={`leg-step ${s.kind}`} data-testid="leg-step">
            <span className="leg-step-tm" />
            <span className="leg-step-rail">
              <RailLine line={lineOf(s)} part="full" />
            </span>
            <span className="leg-step-tx">
              {s.kind === 'walk' ? (
                <span className="leg-step-walk">
                  <ModeIcon mode="walk" size="s" /> 步行 {s.minutes} 分
                </span>
              ) : editing && target ? (
                <>
                  <span className="leg-ride editing" data-testid="leg-ride">
                    <ModeIcon mode={s.mode} size="s" />
                    <span>{s.line}</span>
                    <RideSelect leg={leg} index={s.index} date={date} target={target} disabled={saving} />
                    <button type="button" className="leg-ride-more" onClick={() => openRide(s.index)} data-testid="leg-ride-timetable">
                      › 班次
                    </button>
                  </span>
                  <span className="leg-ride-min">{s.minutes} 分</span>
                </>
              ) : (
                <>
                  <button type="button" className="leg-ride" onClick={() => openRide(s.index)} data-testid="leg-ride">
                    <ModeIcon mode={s.mode} size="s" />
                    <span>
                      {s.line} {s.depart} 發
                    </span>
                    <span className="leg-ride-more">› 班次</span>
                  </button>
                  <span className="leg-ride-min">{s.minutes} 分</span>
                </>
              )}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** 編輯中的編輯狀態，由上到下：方式、步驟（children，大眾運輸的班次在這裡選）、（算不出來時）分鐘、備註、完成 */
function LegEditor({ target, spec, leg, children }: { target: LegTarget; spec: TravelSpec | null; leg: Leg; children?: ReactNode }) {
  const saving = useShared((s) => s.saving);
  // 每次都從最新的行程讀目前的設定再改
  const change = (fn: (cur: TravelSpec | null) => TravelSpec | null, label = '調整交通') => void shared.changeItinerary((it) => setLegTravel(it, target, fn(getLegTravel(it, target))), label);
  const current = editorModeOf(spec);
  const [minutes, setMinutes] = useState(spec?.minutes != null ? String(spec.minutes) : '');
  const [note, setNote] = useState(spec?.note ?? '');
  // 換方式時清掉班次和自己填的分鐘，只留備註
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
        <button type="button" className="chip" onClick={() => uiStore.setState({ legOpen: null })} data-testid="leg-done">
          完成
        </button>
      </div>
    </div>
  );
}

/** 時間軸上的一段交通（交通卡）；date 是這天的日期 */
export function LegRow({ entry, date }: { entry: TimelineEntry; date: string }) {
  const leg = entry.travel;
  const byId = useData((s) => s.byId);
  const itinerary = useData((s) => s.itinerary);
  const planning = useApp((s) => s.planning);
  const saving = useShared((s) => s.saving);
  // 道路路線查到時（地圖的行程線跟著更新）重畫，距離從直線換成路線
  useApp((s) => s.routesVersion);
  const target = legTargetOf(entry, date);
  // 每一段交通有自己的 key（起點、會合這類不能改的也可以點，但不會開到別段）；班次表的 legKey 也是這個
  const key = legKeyOf(entry, date);
  const open = useUi((s) => s.legOpen) === key;
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

  // 點開時地圖只畫這一段，每一程上下車的站亮起來；收起來（或換成別段、離開）就清掉
  useEffect(() => {
    if (!open || !fromId || !toId) return;
    commands.clearHighlights();
    const rides = ridesRef.current;
    // 搭車的照班次的站畫（和地圖上整天的行程線一樣）；其他交給 routeResolver 查
    const byId = dataStore.getState().byId;
    const a = byId.get(fromId);
    const b = byId.get(toId);
    const geometry = rides.length && a && b && isRide(mode) ? itineraryPathOf(a, b, mode, rides) : null;
    commands.drawRoute(fromId, toId, mode, { minutes, geometry, unknown });
    const stations = rideStations(rides).filter((id) => byId.has(id));
    if (stations.length) commands.highlight(stations);
    return () => void commands.clearHighlights();
  }, [open, fromId, toId, mode, unknown, minutes, ridesKey]);

  // 這張卡不見了（換天、回整趟、換分頁）或換成別段時，開著的是這段就收起來，否則地圖的行程線一直是淡的
  useEffect(() => {
    if (!open) return;
    return () => {
      if (uiStore.getState().legOpen === key) uiStore.setState({ legOpen: null });
    };
  }, [open, key]);

  if (hidden || !leg) return null;
  const editing = open && planning && !!target;
  const from = fromId ? byId.get(fromId) : undefined;
  const to = toId ? byId.get(toId) : undefined;
  // 距離（第五輪 §3.5）：步行、計程車用道路路線的快取，搭車用照班次的站畫的路徑長度；
  // 不看點開後畫在地圖上的那條，點開前後同一個數字
  const ridePath = from && to && isRide(leg.mode) && leg.rides.length ? itineraryPathOf(from, to, mode, leg.rides) : null;
  const distance = from && to ? legDistance(leg, from, to, roadRouter, ridePath ? lineMeters(ridePath) : null) : null;
  const sub = legSubParts(leg, distance);
  const steps = legSteps(leg, from ? nameOf(from.id) : '', to ? nameOf(to.id) : '', nameOf);
  const transit = steps.length > 0;
  const stepList = open && transit ? <LegSteps steps={steps} leg={leg} date={date} legKey={key} target={target} editing={editing} saving={saving} /> : null;
  const note = spec?.note && !editing ? spec.note : null;
  // 點卡片上任何地方都切換（編輯區、地圖連結、搭車膠囊、下拉裡的點擊不算）；鍵盤用標題的按鈕
  const toggle = (e: MouseEvent) => {
    if ((e.target as HTMLElement).closest('a, select, .leg-edit, .leg-ride')) return;
    uiStore.setState({ legOpen: open ? null : key });
  };
  return (
    <li className={`tl-leg mode-${leg.mode} ${open ? 'open' : ''} ${editing ? 'editing' : ''}`} data-testid="tl-leg" data-leg={key} {...dropOnLegProps(entry.itemId, date, planning)}>
      <div className="tl-leg-card" onClick={toggle}>
        <div className="tl-leg-head">
          <ModeIcon mode={leg.mode} size="l" />
          <button type="button" className="tl-leg-text" aria-pressed={open} aria-expanded={transit ? open : undefined}>
            <span className="tl-leg-title">{legTitle(leg) || '交通 0 分'}</span>
            {(sub.length > 0 || note) && (
              <span className="tl-leg-sub">
                {sub.join('・')}
                {note && (
                  <span className="tl-leg-note" data-testid="leg-note-text">
                    {sub.length > 0 && '・'}📝 {note}
                  </span>
                )}
              </span>
            )}
          </button>
          {from && to && (
            <a className="leg-maps" href={legMapsUrl(from, to, mode)} target="_blank" rel="noreferrer" aria-label="在 Google Maps 開路線" title="在 Google Maps 開路線" data-testid="leg-maps">
              🗺️
            </a>
          )}
          {planning && target && !open ? (
            <span className="tl-leg-chev edit" aria-hidden="true">
              改 ›
            </span>
          ) : transit && !editing ? (
            <span className={`tl-leg-chev ${open ? 'open' : ''}`} aria-hidden="true">
              ▸
            </span>
          ) : null}
        </div>
        {editing && target ? (
          <LegEditor key={JSON.stringify(spec)} target={target} spec={spec} leg={leg}>
            {stepList}
          </LegEditor>
        ) : (
          stepList
        )}
      </div>
    </li>
  );
}
