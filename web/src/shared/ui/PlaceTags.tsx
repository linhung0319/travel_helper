// 「自己加」「✓ 已訂」「待訂」的標籤（interaction-design §17.7）：想去和探索的卡、詳情、行程卡。
// 「待訂」只標在需要預約的點（預約筆記裡有的）；不需要預約的什麼都不標。

import { useData, useShared } from '../../hooks.ts';
import { isUserPlace } from '../../lib/addPlace/view.ts';
import { bookingByPlace, noteRows } from '../../lib/reservations.ts';
import type { Itinerary } from '@travel-helper/engine';
import type { Place } from '../../data/types.ts';
import type { Reservation } from '../../backend/types.ts';

// 清單一次畫很多張卡：同一份資料只算一次
let cache: { it: Itinerary | null; byId: Map<string, Place>; reservations: Reservation[]; map: Map<string, 'booked' | 'pending'> } | null = null;

function useBooking(placeId: string): 'booked' | 'pending' | null {
  const it = useData((s) => s.itinerary);
  const byId = useData((s) => s.byId);
  const reservations = useShared((s) => s.reservations);
  if (!cache || cache.it !== it || cache.byId !== byId || cache.reservations !== reservations) {
    cache = { it, byId, reservations, map: bookingByPlace(noteRows(it, null, byId, reservations)) };
  }
  return cache.map.get(placeId) ?? null;
}

export function UserTag() {
  return (
    <span className="badge tag-user" data-testid="tag-user">
      自己加
    </span>
  );
}

/** 行程卡：這個點是自己加的才有 */
export function UserPlaceTag({ placeId }: { placeId: string }) {
  const place = useData((s) => s.byId.get(placeId));
  return place && isUserPlace(place) ? <UserTag /> : null;
}

/** 卡片、詳情的一排標籤；都沒有時不佔位置 */
export function PlaceTags({ place }: { place: Place }) {
  const booking = useBooking(place.id);
  const user = isUserPlace(place);
  if (!user && !booking) return null;
  return (
    <span className="ui-place-tags" data-testid="place-tags">
      {user && <UserTag />}
      {booking === 'booked' && (
        <span className="badge tag-booked" data-testid="tag-booked">
          ✓ 已訂
        </span>
      )}
      {booking === 'pending' && (
        <span className="badge tag-pending" data-testid="tag-pending">
          待訂
        </span>
      )}
    </span>
  );
}
