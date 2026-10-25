// 地圖那側的班次表（第五輪 §4）：交通卡步驟裡搭車那一行的「› 班次」打開（uiStore.timetable）。
// 標題是圖示＋路線名、下一行上下車站和車程；藍底提示是判斷搭不搭得到的時間（走到上車站／轉乘完）；
// 清單一班一行：搭不到灰底劃線、搭得到綠底（等 1 小時以上橘字）、選定藍底。班很多時先列走到站前後幾班＋「看全部」。
// 編輯中點綠色那班＝選它（selectRideTrip）；一般模式只能看。打開時地圖框住這一程、上車站亮起來。
// 電腦版浮在地圖區左上（不蓋右邊的時間軸），手機是下方面板；✕、點地圖、換天、交通卡收起、這段不見了都關掉。

import { useEffect, useState } from 'react';
import { rideDepartures, toMinutes, type Leg, type TransitRide } from '@travel-helper/engine';
import { appStore } from '../store.ts';
import { commands } from '../appCommands.ts';
import { dataStore } from '../dataStore.ts';
import { currentEngineData, dayPlanOf, engineConfig } from '../planStore.ts';
import { useApp, useData, usePlan, useShared, useUi } from '../hooks.ts';
import { closeTimetable, type TimetableState } from '../uiStore.ts';
import { departureRows, findLegEntry, legTargetOf, rideReadyAt } from '../lib/planView.ts';
import { departureLabel, readyHint, timetableSource, timetableWindow } from '../lib/timetableView.ts';
import type { LonLat } from '../data/types.ts';
import { ModeIcon } from './ModeIcon.tsx';
import { selectRideTrip } from './LegRow.tsx';

/** 一程上下車站的座標：車站是資料點；巴士、船的停留所用路線檔裡的座標（用站名對） */
function stopCoords(ride: TransitRide, id: string): LonLat | null {
  const p = dataStore.getState().byId.get(id);
  if (p) return p.coords;
  const doc = currentEngineData()?.routes?.find((r) => r.id === ride.routeId);
  return doc?.stops.find((s) => s.name === id || s.id === id)?.coords ?? null;
}

export function TimetablePopup() {
  const tt = useUi((s) => s.timetable);
  const legOpen = useUi((s) => s.legOpen);
  const day = useApp((s) => s.day);
  const plan = usePlan((s) => s.plan);
  const entry = tt ? findLegEntry(dayPlanOf(plan, tt.date), tt.legKey) : null;
  const leg = entry?.travel ?? null;
  const ride = tt && leg ? leg.rides[tt.rideIndex] : undefined;
  // 換天、交通卡收起來（或換別段）、這段或這一程不見了（刪掉、改成計程車）就關掉；時間軸還沒算好時先不判斷
  const stale = !!tt && (day !== tt.date || legOpen !== tt.legKey || (plan != null && !ride));
  useEffect(() => {
    if (stale) closeTimetable();
  }, [stale]);
  if (!tt || !leg || !ride || stale) return null;
  return <TimetableBody key={`${tt.legKey}#${tt.rideIndex}`} tt={tt} leg={leg} ride={ride} target={legTargetOf(entry!, tt.date)} />;
}

function TimetableBody({ tt, leg, ride, target }: { tt: TimetableState; leg: Leg; ride: TransitRide; target: ReturnType<typeof legTargetOf> }) {
  const byId = useData((s) => s.byId);
  const planning = useApp((s) => s.planning);
  const saving = useShared((s) => s.saving);
  const [showAll, setShowAll] = useState(false);
  const nameOf = (id: string) => byId.get(id)?.name.zh || byId.get(id)?.name.ja || id;
  const editing = planning && !!target;

  // 打開時（或換到別程）地圖框住這一程、上車站亮起來；關掉時把交通卡亮的站換回來（交通卡已經收起、清掉的就不動）
  const board = ride.from;
  const alight = ride.to;
  useEffect(() => {
    const coords = [stopCoords(ride, board), stopCoords(ride, alight)].filter((c): c is LonLat => !!c);
    if (coords.length) {
      const xs = coords.map((c) => c[0]);
      const ys = coords.map((c) => c[1]);
      commands.focus({ bbox: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] });
    }
    if (!dataStore.getState().byId.has(board)) return;
    const prev = appStore.getState().highlights.primary ?? [];
    commands.highlight([board]);
    return () => {
      const now = appStore.getState().highlights.primary;
      if (now?.length === 1 && now[0] === board) appStore.getState().setHighlight('primary', prev);
    };
    // 時間軸重算時 ride 換了物件但站一樣，不用重做
  }, [board, alight]);

  const data = currentEngineData();
  const readyAt = rideReadyAt(leg, tt.rideIndex);
  const rows = data ? departureRows(rideDepartures(data, engineConfig, tt.date, ride), readyAt, ride.tripId ?? null) : [];
  const shown = timetableWindow(rows, readyAt, showAll);
  const source = data ? timetableSource(ride, data, tt.date, engineConfig.holidays) : null;
  const minutes = toMinutes(ride.arrive) - toMinutes(ride.depart);
  const fromName = leg.from ? nameOf(leg.from) : '';
  const title = ride.line;

  return (
    <section className="timetable-pop" data-testid="timetable" aria-label={`${title} 的班次`}>
      <header className="timetable-head">
        <ModeIcon mode={ride.mode} size="l" />
        <div className="timetable-title">
          <h2>{title}</h2>
          <div className="timetable-sub">
            {nameOf(board)} → {nameOf(alight)}・約 {minutes} 分
          </div>
        </div>
        <button type="button" className="text-button" onClick={closeTimetable} aria-label="關掉" data-testid="timetable-close">
          ✕
        </button>
      </header>
      <div className="timetable-ready" data-testid="timetable-ready">
        {tt.rideIndex === 0 && <ModeIcon mode="walk" size="s" />}
        <span>{readyHint(leg, tt.rideIndex, fromName, nameOf)}</span>
      </div>
      <div className="timetable-body">
        {!data ? (
          <div className="muted small">時刻表載入中…</div>
        ) : rows.length === 0 ? (
          <div className="muted small">時刻表裡查不到這一程的班次</div>
        ) : (
          <ol className="timetable-list">
            {shown.rows.map((r) => {
              const { text, long } = departureLabel(r);
              const pickable = editing && r.state === 'ok' && !saving;
              const cls = `timetable-row ${r.state}${long ? ' long' : ''}${pickable ? ' pickable' : ''}`;
              return (
                <li key={r.tripId} className={cls} data-testid="timetable-row" data-state={r.state}>
                  {pickable && target ? (
                    <button type="button" className="timetable-row-in" onClick={() => selectRideTrip(target, leg, tt.rideIndex, r)} aria-label={`選 ${r.depart} 發的班次`}>
                      <RowText depart={r.depart} arrive={r.arrive} text={text} />
                    </button>
                  ) : (
                    <div className="timetable-row-in">
                      <RowText depart={r.depart} arrive={r.arrive} text={text} />
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        )}
        {shown.hidden > 0 && (
          <button type="button" className="text-button timetable-all" onClick={() => setShowAll(true)} data-testid="timetable-all">
            看全部（共 {rows.length} 班）
          </button>
        )}
      </div>
      {source && (
        <div className="timetable-src" data-testid="timetable-source">
          {source.url ? (
            <a href={source.url} target="_blank" rel="noreferrer">
              {source.text}
            </a>
          ) : (
            source.text
          )}
        </div>
      )}
    </section>
  );
}

function RowText({ depart, arrive, text }: { depart: string; arrive: string; text: string }) {
  return (
    <>
      <span className="timetable-dep">{depart}</span>
      <span className="timetable-arr">{arrive} 到</span>
      <span className="timetable-wait">{text}</span>
    </>
  );
}
