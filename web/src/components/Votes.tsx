// 想去／不想去（interaction-design §9）：愛心就是「想去」——按了這個點就進「想去」分頁；不想去只在詳情的動作列（shared/ui/PlaceDetail）。每人對每個點一個狀態。
// 想排在哪天用想去卡片上的「加到某天」（沒有「希望哪天」）。卡片、清單、詳情標題的愛心是 shared/ui/VoteHeart.tsx；這裡只有投票的動作。

import { shared } from '../appShared.ts';
import { onWishScreen } from '../appAi.ts';
import type { VoteValue } from '../backend/types.ts';
import { firstTime } from '../lib/onceHint.ts';
import { flyHeart, visibleWishTab } from '../shared/flyHeart.ts';
import { dataStore } from '../dataStore.ts';

/**
 * 投票（愛心 VoteHeart、詳情的動作列都走這裡）；value 是 null 時收回。
 * T76（interaction-design §35.9）：按想去、收回想去都有提示帶「復原」（「已加到想去，家人也看得到」「已收回想去（名稱）」），手機、網頁都有；
 * 復原是把自己的票改回按之前的樣子。第一次自己按 ♡ 時愛心飛進想去分頁（§17.4，看得到想去分頁才飛）。
 * hint＝false：順手按的（加到某天），那邊有自己的提示，這裡不提示；from：按的那顆愛心，從那裡飛。
 */
export async function castVote(placeId: string, value: VoteValue | null, hint = true, from?: Element | null) {
  // 按下一個或收回：之前的提示收掉
  shared.clearHint();
  const start = from?.getBoundingClientRect() ?? null;
  const st = shared.store.getState();
  const before = (st.votes.find((v) => v.placeId === placeId && v.memberId === st.me?.id && !v.deletedAt)?.value ?? null) as VoteValue | null;
  const r = await shared.vote(placeId, value);
  if (!hint || !r.ok) return;
  const liked = value === 'like';
  const unliked = before === 'like' && value !== 'like';
  if (!liked && !unliked) return;
  if (liked && !onWishScreen()) {
    const tab = visibleWishTab();
    if (tab && start && firstTime('th.hint.firstLike')) await flyHeart(start, tab);
  }
  const place = dataStore.getState().byId.get(placeId);
  const name = place ? (place.name.zh || place.name.ja).slice(0, 12) : '';
  const undo = { label: '復原', run: () => void castVote(placeId, before, false) };
  shared.notify(liked ? '已加到想去，家人也看得到' : `已收回想去（${name}）`, undo);
}
