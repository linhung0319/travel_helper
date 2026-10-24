// 排進行程（這天候選的 ↑、詳情的「排進行程」）：插在那天最順路的位置（引擎的 bestInsertIndex），
// 「誰提的」記按 ❤️ 的人；住宿是設成那晚住這裡。一個動作只存一次檔、只有一份快照。
// 排進去之後，這個點在那天的候選拿掉。

import { addItem, bestInsertIndex, setLodging, type NewItem } from '@travel-helper/engine';
import type { Itinerary } from '@travel-helper/engine/types';
import { appStore } from '../store.ts';
import { dataStore } from '../dataStore.ts';
import { shared } from '../appShared.ts';
import { currentEngineData } from '../planStore.ts';
import { shortDayLabel } from '../lib/trip.ts';
import type { Result } from '../sharedStore.ts';

/** at：拖進時間軸時指定的位置（不給就插在最順路的位置） */
export async function addPlaceToDay(placeId: string, date: string, at?: { index: number; split?: { id: string; group: string } }): Promise<Result> {
  const p = dataStore.getState().byId.get(placeId);
  const name = p ? p.name.zh || p.name.ja : placeId;
  const s = shared.store.getState();
  let reason: string;
  let fn: (it: Itinerary) => Itinerary;
  if (p?.type === 'lodging') {
    reason = `${shortDayLabel(date)} 住 ${name}`;
    fn = (it) => setLodging(it, date, placeId);
  } else {
    const likes = s.votes.filter((v) => v.placeId === placeId && v.value === 'like').map((v) => v.memberId);
    const item: NewItem = { type: 'visit', options: [{ place: placeId, stayMinutes: null }], addedBy: s.me?.id ?? null, ...(likes.length ? { proposedBy: likes } : {}) };
    reason = `${shortDayLabel(date)}：＋${name}`;
    fn = (it) => {
      if (at) return addItem(it, date, item, at).itinerary;
      const data = currentEngineData();
      // 時刻表還沒載入時排在最後（航班之前）
      const index = data ? bestInsertIndex(it, date, item, data) : undefined;
      return addItem(it, date, item, index == null ? {} : { index }).itinerary;
    };
  }
  const r = await shared.changeItinerary(fn, reason);
  if (r.ok) {
    appStore.getState().selectDay(date);
    for (const c of shared.store.getState().candidates.filter((x) => x.placeId === placeId && x.day === date)) await shared.removeCandidate(c.id, undefined, true);
  }
  return r.ok ? { ok: true } : r;
}
