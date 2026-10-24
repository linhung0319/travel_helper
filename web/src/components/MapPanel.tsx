// 地圖區的視窗（T15m 第三輪 §3）：日期列的 💬、📋 打開。電腦版蓋住地圖那一欄（左邊的聊天、右邊的分頁還在，可以一邊看一邊寫）；
// 手機是從上面蓋下來的全螢幕。標題寫範圍，下面一排切換「這天／整趟」（選「全部」時只有整趟）。
// 預約筆記的內容是 ReservationNotes（Reservations.tsx）。

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
  const what = panel.kind === 'comments' ? '留言' : '預約';
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
            label={date ? '這天的留言' : '整趟的留言'}
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
