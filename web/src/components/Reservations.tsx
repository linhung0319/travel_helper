// 「需要預約」的清單（PLAN T15m）：每晚的住宿，加上行程裡接受訂位的餐廳、體驗；附訂位方式和聯絡資訊。

import { useData, usePlan, useShared } from '../hooks.ts';
import { closeDialog } from '../uiStore.ts';
import { METHOD_LABELS } from '../lib/planView.ts';
import { noteRows } from '../lib/reservations.ts';
import { dayLabel } from '../lib/trip.ts';
import { Dialog, PlaceChip } from './common.tsx';

const ROLE_LABELS = { main: '', other: '備案', lodging: '住宿' } as const;

export function ReservationsDialog() {
  const itinerary = useData((s) => s.itinerary);
  const byId = useData((s) => s.byId);
  const plan = usePlan((s) => s.plan);
  const reservations = useShared((s) => s.reservations);
  const rows = noteRows(itinerary, plan, byId, reservations);
  let lastDate = '';
  return (
    <Dialog title={`需要預約（${rows.length}）`} onClose={closeDialog} testId="reservations-dialog">
      <p className="muted small">每晚的住宿，加上行程裡接受訂位的餐廳、體驗（備案也列出來，訂不到主選時用）。時間是目前時間軸算出來的。</p>
      {rows.length === 0 && <p className="muted">行程裡還沒有要預約的。</p>}
      <ol className="reservation-list">
        {rows.map((r, i) => {
          const head = r.date !== lastDate;
          lastDate = r.date;
          return (
            <li key={i} className={`reservation role-${r.role}`} data-testid="reservation">
              {head && <h4>{dayLabel(r.date)}</h4>}
              <div className="reservation-main">
                <PlaceChip id={r.placeId} />
                {ROLE_LABELS[r.role] && <span className="badge">{ROLE_LABELS[r.role]}</span>}
                <span className="small">
                  {r.time ? `${r.time}・` : ''}
                  {r.people} 人
                </span>
              </div>
              <div className="reservation-how small">
                {r.methods.length > 0 && <span>{r.methods.map((m) => METHOD_LABELS[m] ?? m).join('、')}</span>}
                {r.phone && <a href={`tel:${r.phone}`}>📞 {r.phone}</a>}
                {r.url && (
                  <a href={r.url} target="_blank" rel="noreferrer">
                    🔗 訂位頁
                  </a>
                )}
                {r.leadDays != null && <span>{r.leadDays} 天前要訂</span>}
                {!r.methods.length && !r.phone && !r.url && <span className="muted">訂位方式未查</span>}
              </div>
              {r.placeNote && <p className="muted small">{r.placeNote}</p>}
              {r.accepted === 'groups-only' && <p className="small warn">只接受團體預約</p>}
            </li>
          );
        })}
      </ol>
    </Dialog>
  );
}
