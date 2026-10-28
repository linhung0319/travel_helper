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

/**
 * at：拖進時間軸時指定的位置（不給就插在最順路的位置）；undo：存好後跳出可以復原的提示（同 changeItinerary）；
 * settle：拿掉候選之後、跳提示之前還要做完的事（候選拖進來時拿掉那筆候選）
 */
export async function addPlaceToDay(
  placeId: string,
  date: string,
  at?: { index: number; split?: { id: string; group: string } },
  undo?: { text: string; after?: () => Promise<unknown> },
  settle?: () => Promise<unknown>,
): Promise<Result> {
  const p = dataStore.getState().byId.get(placeId);
  const name = p ? p.name.zh || p.name.ja : placeId;
  // 行程裡不放車站（T29c §8.10）：所有排進行程的入口（候選的 ↑、拖進時間軸、詳情）都走這裡
  if (p?.type === 'station') return { ok: false, error: '車站不能排進行程，只會出現在地圖和交通卡' };
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
  // 存檔要一點時間：存好時還停在按下去那時的那天才跳到排進去的那天，這段時間使用者自己換了天就不拉回去
  const shownDay = appStore.getState().day;
  // 候選在跳「復原」提示之前就拿掉：馬上按復原時，復原的 after 才看得到候選已經不在、加得回去
  const removeCandidates = async () => {
    if (appStore.getState().day === shownDay) appStore.getState().selectDay(date);
    for (const c of shared.store.getState().candidates.filter((x) => x.placeId === placeId && x.day === date)) await shared.removeCandidate(c.id, undefined, true);
    await settle?.();
  };
  const r = await shared.changeItinerary(fn, reason, { ...(undo ? { undo } : {}), settle: removeCandidates });
  return r.ok ? { ok: true } : r;
}
