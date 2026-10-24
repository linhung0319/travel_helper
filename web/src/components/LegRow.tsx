// 兩張卡片中間的交通細列（設計 §8）：一般模式點開看這段的詳細（方式、分鐘、緩衝、計程車台數、每一程的轉乘、
// Google Maps 連結），規劃模式下多一塊設定（方式、分鐘、緩衝、備註）。
// 點開時地圖只畫這一段（commands.drawRoute），轉乘的車站亮起來；收起來就清掉。一次只開一段（uiStore.legOpen）。

import { useEffect, useState } from 'react';
import { getLegTravel, setLegTravel, type Itinerary, type LegTarget, type TimelineEntry, type TravelSpec } from '@travel-helper/engine';
import type { TravelMode } from '@travel-helper/engine/types';
import { commands } from '../appCommands.ts';
import { shared } from '../appShared.ts';
import { useApp, useData, useShared, useUi } from '../hooks.ts';
import { formatDistance, legDetail, legMapsUrl, legTargetOf, legText, rideLines } from '../lib/planView.ts';
import { MODE_ICONS } from '../lib/routing.ts';
import { haversineMeters } from '../lib/geo/distance.ts';
import { uiStore } from '../uiStore.ts';

const MODE_LABELS: Record<TravelMode, string> = { walk: '步行', taxi: '計程車', train: '電車', bus: '巴士', ferry: '船', charter: '包車', car: '自駕', other: '其他' };
/** 按鈕的順序（自動排在最前面） */
const MODE_ORDER: TravelMode[] = ['walk', 'taxi', 'train', 'bus', 'ferry', 'charter', 'car', 'other'];
const BUFFER_STEP = 5;

/** 讀這段已經設定的值；找不到項目（剛被刪掉）時當作沒設定 */
function readSpec(it: Itinerary | null, target: LegTarget | null): TravelSpec | null {
  if (!it || !target) return null;
  try {
    return getLegTravel(it, target);
  } catch {
    return null;
  }
}

/** 規劃模式的設定：改一個欄位，其他欄位照原本的 */
function LegEditor({ target, spec, bufferNow }: { target: LegTarget; spec: TravelSpec | null; bufferNow: number }) {
  const saving = useShared((s) => s.saving);
  const patch = (p: Partial<TravelSpec>) => void shared.changeItinerary((it) => setLegTravel(it, target, { ...(getLegTravel(it, target) ?? {}), ...p }), '調整交通');
  const [minutes, setMinutes] = useState(spec?.minutes != null ? String(spec.minutes) : '');
  const [note, setNote] = useState(spec?.note ?? '');
  const commitMinutes = () => {
    const n = minutes.trim() === '' ? null : Number(minutes);
    if (n != null && !(Number.isFinite(n) && n >= 0)) return setMinutes(spec?.minutes != null ? String(spec.minutes) : '');
    if (n !== (spec?.minutes ?? null)) patch({ minutes: n });
  };
  const commitNote = () => {
    const v = note.trim() === '' ? null : note.trim();
    if (v !== (spec?.note ?? null)) patch({ note: v });
  };
  const adjusted = spec?.bufferMinutes != null;
  const setBuffer = (v: number) => patch({ bufferMinutes: Math.max(0, v) });
  return (
    <div className="leg-edit">
      <div className="leg-edit-row">
        <span className="leg-edit-label">方式</span>
        <span className="leg-modes" role="group" aria-label="交通方式">
          <button type="button" className="chip" aria-pressed={!spec?.mode} disabled={saving} onClick={() => patch({ mode: null })} data-testid="leg-mode" data-mode="auto">
            自動
          </button>
          {MODE_ORDER.map((m) => (
            <button key={m} type="button" className="chip" aria-pressed={spec?.mode === m} disabled={saving} onClick={() => patch({ mode: m })} data-testid="leg-mode" data-mode={m}>
              {MODE_ICONS[m]} {MODE_LABELS[m]}
            </button>
          ))}
        </span>
      </div>
      <div className="leg-edit-row">
        <span className="leg-edit-label">時間</span>
        <input
          type="number"
          min={0}
          inputMode="numeric"
          className="leg-minutes"
          placeholder="自動"
          aria-label="交通分鐘（空白：自動）"
          value={minutes}
          disabled={saving}
          onChange={(e) => setMinutes(e.target.value)}
          onBlur={commitMinutes}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          data-testid="leg-minutes"
        />
        <span className="muted small">分{spec?.minutes == null ? '（自動）' : ''}</span>
      </div>
      <div className="leg-edit-row">
        <span className="leg-edit-label">緩衝</span>
        <button type="button" className="button small" disabled={saving || bufferNow <= 0} onClick={() => setBuffer(bufferNow - BUFFER_STEP)} aria-label="緩衝減 5 分" data-testid="leg-buffer-minus">
          −5
        </button>
        <span>{bufferNow} 分</span>
        <button type="button" className="button small" disabled={saving} onClick={() => setBuffer(bufferNow + BUFFER_STEP)} aria-label="緩衝加 5 分" data-testid="leg-buffer-plus">
          ＋5
        </button>
        <span className="muted small">{adjusted ? '已調整' : '預設'}</span>
        {adjusted && (
          <button type="button" className="button small" disabled={saving} onClick={() => patch({ bufferMinutes: null })}>
            恢復預設
          </button>
        )}
      </div>
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
      </div>
    </div>
  );
}

/** 時間軸上的一段交通：一行摘要，點開看詳細；date 是這天的日期 */
export function LegRow({ entry, date }: { entry: TimelineEntry; date: string }) {
  const leg = entry.travel;
  const byId = useData((s) => s.byId);
  const itinerary = useData((s) => s.itinerary);
  const planning = useApp((s) => s.planning);
  const target = legTargetOf(entry, date);
  // 每一段交通有自己的 key（起點、會合這類不能改的也可以展開看，但不會開到別段）
  const key = `${date}:${entry.kind === 'lodging' ? 'lodging' : `${entry.kind}:${entry.itemId ?? entry.placeId ?? ''}`}`;
  const open = useUi((s) => s.legOpen) === key;
  const routes = useApp((s) => s.routes);
  const spec = readSpec(itinerary, target);
  // 使用者設定過的（包含分鐘填 0）或有備註的不能藏起來，否則改不回來
  const userSet = !!leg?.specified || !!spec;
  const hidden = !leg || (!userSet && (leg.mode === 'none' || (leg.minutes === 0 && !leg.rides.length)));
  const nameOf = (id: string) => byId.get(id)?.name.zh || byId.get(id)?.name.ja || id;
  const fromId = leg?.from ?? null;
  const toId = leg?.to ?? null;
  const mode: TravelMode = leg && leg.mode !== 'none' && leg.mode !== 'unknown' ? leg.mode : 'other';
  const minutes = leg?.minutes ?? 0;
  const transferKey = leg ? leg.rides.slice(1).map((r) => r.from).join('|') : '';

  // 點開時地圖只畫這一段，轉乘的車站亮起來；收起來（或換成別段、離開）就清掉
  useEffect(() => {
    if (!open || !fromId || !toId) return;
    commands.clearHighlights();
    commands.drawRoute(fromId, toId, mode, { minutes });
    if (transferKey) commands.highlight(transferKey.split('|'));
    return () => void commands.clearHighlights();
  }, [open, fromId, toId, mode, minutes, transferKey]);

  if (hidden || !leg) return null;
  const detail = legDetail(leg);
  const editing = open && planning && !!target;
  const from = fromId ? byId.get(fromId) : undefined;
  const to = toId ? byId.get(toId) : undefined;
  const rides = rideLines(leg, nameOf);
  // 距離：這段畫在地圖上的路線查到了就用（沿道路），否則直線距離
  const drawn = routes.find((r) => r.from.place === fromId && r.to.place === toId && r.meters != null && r.source !== 'pending');
  const straight = from && to ? haversineMeters(from.coords, to.coords) : null;
  const distance = drawn?.meters != null ? (drawn.source === 'straight' ? `${formatDistance(drawn.meters)}（直線）` : formatDistance(drawn.meters)) : straight != null ? `${formatDistance(straight)}（直線）` : null;
  const toggle = () => uiStore.setState({ legOpen: open ? null : key });
  return (
    <li className={`tl-leg mode-${leg.mode} ${open ? 'open' : ''}`} data-testid="tl-leg">
      <span className="tl-leg-line" aria-hidden />
      <div className="tl-leg-body">
        <button type="button" className="tl-leg-text" aria-expanded={open} onClick={toggle}>
          {legText(leg) || '交通 0 分'}
          {detail.length > 0 && <span className="muted small">（{detail.join('、')}）</span>}
          {spec?.note && !editing && (
            <span className="muted small" data-testid="leg-note-text">
              {' '}
              📝 {spec.note}
            </span>
          )}
          <span className="tl-leg-caret" aria-hidden>
            {open ? '▴' : '▾'}
          </span>
        </button>
        {open && (
          <div className="leg-detail" data-testid="leg-detail">
            <div>
              {MODE_ICONS[mode]} {leg.mode === 'unknown' ? '交通未定' : MODE_LABELS[mode]}・交通 {leg.minutes} 分・緩衝 {leg.bufferMinutes} 分
              {distance && `・距離 ${distance}`}
              {leg.taxi && `・${leg.taxi.jumboCars ? `大型 ${leg.taxi.jumboCars} 台或 ` : ''}${leg.taxi.cars} 台`}
            </div>
            {rides.length > 0 && (
              <ul className="leg-rides">
                {rides.map((line, i) => (
                  <li key={i} className={line.startsWith('轉乘') ? 'leg-transfer muted' : ''} data-testid="leg-ride">
                    {line}
                  </li>
                ))}
              </ul>
            )}
            {from && to && (
              <a href={legMapsUrl(from, to, mode)} target="_blank" rel="noreferrer" data-testid="leg-maps">
                在 Google Maps 開路線
              </a>
            )}
            {editing && target && <LegEditor key={JSON.stringify(spec)} target={target} spec={spec} bufferNow={spec?.bufferMinutes ?? leg.bufferMinutes} />}
          </div>
        )}
      </div>
    </li>
  );
}
