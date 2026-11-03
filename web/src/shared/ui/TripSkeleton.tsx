// 整趟的直的骨架（T45b，interaction-design §19.1）：網頁右欄、手機、iPad 共用同一份直的清單。
// 第一列、最後一列是航班；中間一天一列：左邊地區色帶（連住同一區連成一段，還沒決定是虛線）、日期、這天在哪一區（第二行小字是子地區）、
// 右邊那晚的住宿（「鳥羽國際飯店 ✓」「志摩・還沒選住宿」、虛線的「選住哪一區」）。景點名稱不出現，要看去單天。
// 點一列進那一天；點住宿欄（還沒選住宿的）在下面展開地區按鈕選這晚住哪一區（AreaPicker）。有提議時那天變色、列出變動。警告不放這裡（單天的摘要列、網頁日期晶片的紅點有）。

import { setNightArea } from '@travel-helper/engine';
import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { commands } from '../../appCommands.ts';
import { shared } from '../../appShared.ts';
import { dataStore } from '../../dataStore.ts';
import { useApp, useData, useShared } from '../../hooks.ts';
import { areaColor, areaTint } from '../../lib/areas.ts';
import { areaNameIn, describeChanges } from '../../lib/overlays.ts';
import { isRedDay, shortDayLabel, weekdayZh } from '../../lib/trip.ts';
import { areaNameOf, nightsDecided, placeAreaOf, skeletonRows, type SkeletonRow } from '../../lib/tripSkeleton.ts';
import { nightAreaOf } from '@travel-helper/engine';
import type { Itinerary } from '@travel-helper/engine/types';
import type { Area } from '../../data/types.ts';
import { Icon } from '../../components/Icon.tsx';

/** 選這晚住哪一區：存進 nights（換區會清掉這晚的住宿，engine 的 setNightArea），跳「復原」 */
export async function chooseNightArea(date: string, area: string | null, areas: Area[]) {
  const byId = dataStore.getState().byId;
  const name = area ? areaNameOf(areas)(area) : null;
  const text = `${shortDayLabel(date)} 晚上${name ? `住${name}` : '的區清掉'}`;
  return shared.changeItinerary((it) => setNightArea(it, date, area, nightAreaOf(it, date, placeAreaOf(byId))), text, { undo: { text: `已改・${text}` } });
}

/** 地區按鈕一列（整趟展開、單天頂端共用）：照 areas 的順序；current 是現在的區（加「清掉」） */
export function AreaPicker({ date, current, onDone, testId = 'area-picker' }: { date: string; current: string | null; onDone?: () => void; testId?: string }) {
  const areas = useData((s) => s.areas);
  const [busy, setBusy] = useState(false);
  const pick = async (a: string | null) => {
    setBusy(true);
    const r = await chooseNightArea(date, a, areas);
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

function StayCell({ row, areas, open, onToggle }: { row: SkeletonRow; areas: Area[]; open: boolean; onToggle: () => void }) {
  const s = row.stay;
  if (!s) return <span className="ui-sk-stay empty" />;
  const name = areaNameOf(areas);
  if (s.kind === 'lodging') {
    const color = areaColor(areas, row.nightArea);
    return (
      <button type="button" className="ui-sk-stay lodging" style={{ '--area': color, '--area-tint': areaTint(areas, row.nightArea) } as CSSProperties} onClick={() => commands.selectDay(row.date)} data-testid="sk-stay" data-stay="lodging">
        <span className="ui-sk-seal" aria-hidden>
          宿
        </span>
        <span className="ui-sk-stay-name">{s.name}</span>
        {s.booked && <span aria-label="已訂">✓</span>}
      </button>
    );
  }
  const style = s.kind === 'area' ? ({ '--area': areaColor(areas, s.area), '--area-tint': areaTint(areas, s.area) } as CSSProperties) : undefined;
  return (
    <button type="button" className={`ui-sk-stay ${s.kind}`} style={style} aria-expanded={open} onClick={onToggle} data-testid="sk-stay" data-stay={s.kind}>
      <span className="ui-sk-stay-name">{s.kind === 'area' ? `${name(s.area)}・還沒選住宿` : '選住哪一區'}</span>
    </button>
  );
}

export function TripSkeleton() {
  const itinerary = useData((s) => s.itinerary);
  const byId = useData((s) => s.byId);
  const areas = useData((s) => s.areas);
  const proposal = useApp((s) => s.proposal);
  const reservations = useShared((s) => s.reservations);
  const [openDate, setOpenDate] = useState<string | null>(null);
  const changes = useMemo(() => {
    if (!proposal) return new Map<string, string>();
    const nameOf = (id: string) => byId.get(id)?.name.zh || byId.get(id)?.name.ja || id;
    return new Map(describeChanges(proposal.changes, nameOf, areaNameIn(areas)).map((l) => [l.date, l.text.split('：').slice(1).join('：')]));
  }, [proposal, byId, areas]);
  if (!itinerary) return null;
  const booked = (placeId: string, date: string) => reservations.some((r) => r.placeId === placeId && r.date === date && r.status === 'booked');
  const rows = skeletonRows({ itinerary, areas, byId, booked });
  const { total, decided } = nightsDecided(itinerary, byId);
  const arrive = flightLine(itinerary, itinerary.days[0]?.date, 'arrive');
  const depart = flightLine(itinerary, itinerary.days.at(-1)?.date, 'depart');
  return (
    <div className="ui-sk" data-testid="trip-skeleton">
      <div className="ui-sk-head">
        <span className="ui-sk-title">整趟</span>
        <span className="ui-sk-count" data-testid="sk-count">
          {total} 晚 · 已決定 {decided} 晚
        </span>
      </div>
      <ol className="ui-sk-list">
        {arrive && (
          <li className="ui-sk-flight">
            <button type="button" onClick={() => commands.selectDay(rows[0].date)} data-testid="sk-flight-arrive">
              <Icon name="plane" size={16} /> {arrive}
            </button>
          </li>
        )}
        {rows.map((r) => {
          const rail = r.rail;
          const railStyle = rail ? ({ '--area': areaColor(areas, rail.area) } as CSSProperties) : undefined;
          const open = openDate === r.date;
          return (
            <li key={r.date} className={`ui-sk-row ${changes.has(r.date) ? 'proposed' : ''}`} data-date={r.date} data-testid="sk-row" data-area={r.nightArea ?? ''}>
              <span className={`ui-sk-rail ${rail ? `${rail.pos} ${rail.area ? '' : 'undecided'}` : 'none'}`} style={railStyle} aria-hidden />
              <button type="button" className="ui-sk-main" onClick={() => commands.selectDay(r.date)} data-overview-day={r.date} data-testid="sk-day">
                <span className={`ui-sk-date ${isRedDay(r.date) ? 'red-day' : ''}`}>
                  {shortDayLabel(r.date)}
                  <small>（{weekdayZh(r.date)}）</small>
                </span>
                <span className="ui-sk-where">
                  <b className={r.where ? '' : 'muted'} data-testid="sk-where">
                    {r.where ?? '還沒決定'}
                  </b>
                  {r.regions.length > 0 && <small data-testid="sk-regions">{r.regions.join(' → ')}</small>}
                  {changes.has(r.date) && (
                    <span className="overview-change" data-testid="overview-change">
                      {changes.get(r.date)}
                    </span>
                  )}
                </span>
              </button>
              <StayCell row={r} areas={areas} open={open} onToggle={() => setOpenDate(open ? null : r.date)} />
              {open && (
                <div className="ui-sk-pick">
                  <AreaPicker date={r.date} current={r.nightArea} onDone={() => setOpenDate(null)} />
                </div>
              )}
            </li>
          );
        })}
        {depart && (
          <li className="ui-sk-flight">
            <button type="button" onClick={() => commands.selectDay(rows.at(-1)!.date)} data-testid="sk-flight-depart">
              <Icon name="plane" size={16} /> {depart}
            </button>
          </li>
        )}
      </ol>
    </div>
  );
}
