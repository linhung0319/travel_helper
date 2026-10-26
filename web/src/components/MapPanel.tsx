// 地圖區的彈窗（T15m 第三、四輪，網頁版）：右欄頭像選單的「討論」「預約」打開，按 Esc（App.tsx）或 ✕ 關。浮在地圖上的大視窗，四周留地圖（沒有遮罩，點地圖就關）。
// 內容是 Comments、ReservationNotes（手機版「我」的整頁也用這兩個，見 mobile/MePage.tsx）。標題寫範圍，下面一排切換「這天／整趟」（選「全部」時只有整趟）。

import { useApp, useUi } from '../hooks.ts';
import { dayTarget, TRIP_TARGET } from '../backend/types.ts';
import { dayLabel } from '../lib/trip.ts';
import { closeMapPanel, setMapPanelScope } from '../uiStore.ts';
import { Comments } from './Wishlist.tsx';
import { ReservationNotes } from './Reservations.tsx';

export function MapPanel() {
  const panel = useUi((s) => s.mapPanel);
  const day = useApp((s) => s.day);
  if (!panel) return null;
  // 選了「全部」時沒有「這天」
  const scope = day === 'all' ? 'trip' : panel.scope;
  const date = scope === 'day' && day !== 'all' ? day : null;
  const what = panel.kind === 'comments' ? '討論' : '預約';
  const title = date ? `${dayLabel(date)}的${what}` : `整趟的${what}`;
  return (
    <section className="map-panel" data-testid="map-panel" data-kind={panel.kind} data-scope={scope} aria-label={title}>
      <header className="map-panel-head">
        <h2>{title}</h2>
        <button type="button" className="text-button" onClick={closeMapPanel} aria-label="關掉" data-testid="map-panel-close">
          ✕
        </button>
      </header>
      <div className="segmented map-panel-scope" role="group" aria-label="範圍" data-testid="map-panel-scope">
        {day !== 'all' && (
          <button type="button" aria-pressed={scope === 'day'} onClick={() => setMapPanelScope('day')} data-scope="day">
            這天
          </button>
        )}
        <button type="button" aria-pressed={scope === 'trip'} onClick={() => setMapPanelScope('trip')} data-scope="trip">
          整趟
        </button>
      </div>
      <div className="map-panel-body">
        {panel.kind === 'comments' ? (
          <Comments
            key={date ?? TRIP_TARGET}
            target={date ? dayTarget(date) : TRIP_TARGET}
            label={date ? '這天的討論' : '整趟的討論'}
            placeholder={date ? '例如：這天想輕鬆一點，下午在旅館泡湯' : '例如：第一天大家都累，晚餐簡單吃'}
            open
          />
        ) : (
          <ReservationNotes scope={scope} date={date} />
        )}
      </div>
    </section>
  );
}
