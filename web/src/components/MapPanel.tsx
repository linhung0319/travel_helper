// 地圖區的彈窗（T15m 第三、四輪，網頁版）：右欄頭像選單的「預約」打開，按 Esc（App.tsx）或 ✕ 關。浮在地圖上的大視窗，四周留地圖（沒有遮罩，點地圖就關）。
// 內容是 ReservationNotes（手機版「我」的整頁也用，見 mobile/MePage.tsx）。標題寫範圍，下面一排切換「這天／整趟」（選「全部」時只有整趟）。討論是另一個彈窗（shared/ui/DiscussionPanel）。

import { useApp, useUi } from '../hooks.ts';
import { dayLabel } from '../lib/trip.ts';
import { closeMapPanel, setMapPanelScope } from '../uiStore.ts';
import { ReservationNotes } from './Reservations.tsx';
import { Icon } from './Icon.tsx';

export function MapPanel() {
  const panel = useUi((s) => s.mapPanel);
  const day = useApp((s) => s.day);
  if (!panel) return null;
  // 選了「全部」時沒有「這天」
  const scope = day === 'all' ? 'trip' : panel.scope;
  const date = scope === 'day' && day !== 'all' ? day : null;
  const title = date ? `${dayLabel(date)}的預約` : '整趟的預約';
  return (
    <section className="map-panel" data-testid="map-panel" data-kind={panel.kind} data-scope={scope} aria-label={title}>
      <header className="map-panel-head">
        <h2>{title}</h2>
        <button type="button" className="text-button" onClick={closeMapPanel} aria-label="關掉" data-testid="map-panel-close">
          <Icon name="close" size={20} />
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
        <ReservationNotes scope={scope} date={date} />
      </div>
    </section>
  );
}
