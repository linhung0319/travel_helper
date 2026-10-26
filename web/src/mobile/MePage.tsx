// 手機版「我」分頁（第六輪 §3.7）：帳號（MeMenu，dev 時可以切換使用者）、💬 討論（整趟留言）、📋 預約、⬇ 下載。
// 討論、預約點了是整頁（MePageView），內容和網頁版地圖區的視窗一樣（Comments、ReservationNotes）。行程頁地圖右上角的小圖示（TripPage）也打開這裡、用同樣的數字。

import { useData, usePlan, useShared } from '../hooks.ts';
import { TRIP_TARGET } from '../backend/types.ts';
import { noteRows } from '../lib/reservations.ts';
import { exportJson } from '../shared/exportJson.ts';
import { MeMenu } from '../components/MeMenu.tsx';
import { Icon } from '../components/Icon.tsx';
import { Comments } from '../components/Wishlist.tsx';
import { useCommentCount } from '../shared/placeLists.ts';
import { ReservationNotes } from '../components/Reservations.tsx';
import { mobileStore, useMobile } from './mobileStore.ts';

/** 整趟還沒訂位的筆數 */
export function usePendingCount(): number {
  const itinerary = useData((s) => s.itinerary);
  const byId = useData((s) => s.byId);
  const plan = usePlan((s) => s.plan);
  const reservations = useShared((s) => s.reservations);
  return noteRows(itinerary, plan, byId, reservations).filter((r) => r.status === 'pending').length;
}

/** 「我」分頁：帳號，加上三列（討論、預約、下載） */
export function MePage() {
  const itinerary = useData((s) => s.itinerary);
  const comments = useCommentCount(TRIP_TARGET);
  const pending = usePendingCount();
  const open = (page: 'comments' | 'reservations') => mobileStore.getState().setPage(page);
  return (
    <div className="m-me" data-testid="m-me">
      <section className="m-me-account">
        <h2 className="m-h2">帳號</h2>
        <MeMenu />
      </section>
      <ul className="m-list">
        <li>
          <button type="button" className="m-row" onClick={() => open('comments')} data-testid="m-me-comments">
            <span className="m-row-icon" aria-hidden>
              <Icon name="chat" size={20} />
            </span>
            <span className="m-row-text">討論（整趟的留言）</span>
            {comments > 0 && <span className="m-count">{comments}</span>}
            <span className="m-row-more" aria-hidden>
              <Icon name="chevron" size={20} />
            </span>
          </button>
        </li>
        <li>
          <button type="button" className="m-row" onClick={() => open('reservations')} data-testid="m-me-reservations">
            <span className="m-row-icon" aria-hidden>
              <Icon name="clipboard" size={20} />
            </span>
            <span className="m-row-text">預約</span>
            {pending > 0 && <span className="m-count warn">{pending} 未訂</span>}
            <span className="m-row-more" aria-hidden>
              <Icon name="chevron" size={20} />
            </span>
          </button>
        </li>
        <li>
          <button type="button" className="m-row" disabled={!itinerary} onClick={exportJson} data-testid="m-me-export">
            <span className="m-row-icon" aria-hidden>
              <Icon name="download" size={20} />
            </span>
            <span className="m-row-text">下載行程 JSON</span>
          </button>
        </li>
      </ul>
    </div>
  );
}

/** 整頁的討論或預約：左上「‹」回到剛才的分頁 */
export function MePageView() {
  const page = useMobile((s) => s.page);
  if (!page) return null;
  const title = page === 'comments' ? '整趟的討論' : '預約';
  return (
    <section className="m-full" data-testid={`m-page-${page}`} aria-label={title}>
      <header className="m-full-head">
        <button type="button" className="m-back" onClick={() => mobileStore.getState().setPage(null)} aria-label="返回" data-testid="m-page-back">
          ‹
        </button>
        <h2 className="m-h2">{title}</h2>
      </header>
      <div className="m-full-body">
        {page === 'comments' ? (
          <Comments target={TRIP_TARGET} label="整趟的討論" placeholder="例如：第一天大家都累，晚餐簡單吃" bare />
        ) : (
          <ReservationNotes scope="trip" date={null} />
        )}
      </div>
    </section>
  );
}
