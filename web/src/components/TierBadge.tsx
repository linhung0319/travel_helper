import type { Tier } from '../data/types.ts';

export function TierBadge({ tier }: { tier: Tier | null }) {
  if (!tier) return null;
  return <span className={`tier tier-${tier}`}>{tier}</span>;
}
