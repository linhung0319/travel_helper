// 想去／不想去（interaction-design §9）：愛心就是「想去」——按了這個點就進「想去」分頁；不想去只在詳情的動作列（shared/ui/PlaceDetail）。每人對每個點一個狀態。
// 想排在哪天用想去卡片上的「加到某天」（沒有「希望哪天」）。卡片、清單、詳情標題的愛心是 shared/ui/VoteHeart.tsx；這裡只有投票的動作。

import { shared } from '../appShared.ts';
import type { VoteValue } from '../backend/types.ts';

/** 投票（愛心 VoteHeart、詳情的動作列都走這裡）；value 是 null 時收回 */
export async function castVote(placeId: string, value: VoteValue | null) {
  await shared.vote(placeId, value);
}
