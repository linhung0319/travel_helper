// 想去／不想去（interaction-design §9）：愛心就是「想去」——按了這個點就進「想去」分頁；不想去只在詳情的動作列（shared/ui/PlaceDetail）。每人對每個點一個狀態。
// 想排在哪天用想去卡片上的「加到某天」（沒有「希望哪天」）。卡片、清單、詳情標題的愛心是 shared/ui/VoteHeart.tsx；這裡只有投票的動作。

import { shared } from '../appShared.ts';
import { onWishScreen, showWishTab } from '../appAi.ts';
import type { VoteValue } from '../backend/types.ts';
import { firstTime } from '../lib/onceHint.ts';
import { flyHeart, visibleWishTab } from '../shared/flyHeart.ts';

/**
 * 投票（愛心 VoteHeart、詳情的動作列都走這裡）；value 是 null 時收回。
 * 第一次自己按 ♡：愛心飛進想去，提示一次（§17.4）。已經在想去頁、看不到想去分頁時不提示也不算看過，等下次。
 * hint＝false：順手按的（加到某天），那邊有自己的提示；from：按的那顆愛心，從那裡飛。
 */
export async function castVote(placeId: string, value: VoteValue | null, hint = true, from?: Element | null) {
  // 按下一個或收回：之前的提示收掉
  shared.clearHint();
  const start = from?.getBoundingClientRect() ?? null;
  const r = await shared.vote(placeId, value);
  if (!hint || value !== 'like' || !r.ok || onWishScreen()) return;
  const tab = visibleWishTab();
  if (!tab || !firstTime('th.hint.firstLike')) return;
  if (start) await flyHeart(start, tab);
  shared.notifyHint('已加到想去，家人也看得到', { label: '去看', run: showWishTab });
}
