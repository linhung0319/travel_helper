// 開始卡、空的一天要的行程狀態：和聊天的推薦問題同一份（ai/prompts.ts 的 buildStarterInput），兩邊一定一致。

import { useMemo } from 'react';
import { useData, usePlan, useShared } from '../hooks.ts';
import { buildStarterInput, type StarterInput } from '../ai/prompts.ts';

export function useStarterInput(): StarterInput {
  const itinerary = useData((s) => s.itinerary);
  const byId = useData((s) => s.byId);
  const areas = useData((s) => s.areas);
  const plan = usePlan((s) => s.plan);
  const votes = useShared((s) => s.votes);
  return useMemo(() => buildStarterInput({ itinerary, plan, votes, byId, areas, day: null }), [itinerary, plan, votes, byId, areas]);
}
