// 等級：小方章（T82 §36.T82）。S 實心靛藍白字、A 靛藍框靛藍字、B 灰框灰字；圓體粗字。
// 列（第二行最前面）、地圖預覽卡是 sm（18 px），詳情名字前是 md（22 px）。樣式在 ui.css（.ui-tier）。

import type { Tier } from '../../data/types.ts';

/** 等級方章；沒有等級不畫 */
export function TierMark({ tier, size = 'sm' }: { tier: Tier | null; size?: 'sm' | 'md' }) {
  if (!tier) return null;
  return (
    <span className={`ui-tier ui-tier-${size} ui-tier-${tier}`} data-tier={tier} aria-label={`等級 ${tier}`}>
      {tier}
    </span>
  );
}
