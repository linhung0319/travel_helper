// 等級：細框裡一個 Bodoni 斜體字母（S 是 --indigo 色，其他墨色）。樣式在 ui.css。

import type { Tier } from '../../data/types.ts';

/** 等級標；沒有等級不畫 */
export function TierMark({ tier }: { tier: Tier | null }) {
  if (!tier) return null;
  return (
    <span className={`ui-tier ui-tier-${tier}`} data-tier={tier} aria-label={`等級 ${tier}`}>
      {tier}
    </span>
  );
}
