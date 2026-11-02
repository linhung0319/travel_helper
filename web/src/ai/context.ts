// 每次對話自動帶的脈絡（規格 §4.5）：畫面狀態、脈絡晶片，只帶小的東西，其他用工具查。

import { jstNow } from '@travel-helper/engine';
import { filterChips, matchesFilter } from '../lib/filter.ts';
import { inBbox } from '../lib/areas.ts';
import type { AiDeps } from './deps.ts';
import type { ReadTools } from './readTools.ts';
import type { Stage } from './stage.ts';
import type { ChatContext, TurnContext } from './types.ts';

/** 使用者正在看什麼（平台無關） */
export function screenContext(d: AiDeps, stage: Stage): Record<string, unknown> {
  const v = d.commands.getViewState();
  const { view } = d.app.getState();
  const { places, areas } = d.data.getState();
  // 手機的探索、想去有自己的篩選
  const own = stage.screenFilter();
  return {
    looking: stage.screenName(),
    day: v.day,
    dayLabel: v.dayLabel,
    dayStops: v.dayStops,
    planning: v.planning,
    filterLabels: own ? filterChips(own, areas).map((c) => c.label) : v.filterLabels,
    filterCount: own ? places.filter((p) => matchesFilter(p, own)).length : v.filterCount,
    mapBounds: view?.bounds ?? null,
    placesInView: view ? places.filter((p) => inBbox(p.coords, view.bounds)).length : null,
    detail: v.detail,
    // 「這家」：點開的卡、地圖上選的點
    selected: v.selected,
    aiResult: v.aiResult,
    proposal: v.proposal && { dates: v.proposal.dates, summary: v.proposal.summary },
  };
}

function chipContent(c: ChatContext, d: AiDeps, read: ReadTools): Record<string, unknown> {
  switch (c.kind) {
    case 'place': {
      const opinions = read.get_opinions({ placeId: c.id });
      return { ...c, place: read.digest(c.id), opinions: opinions.ok ? opinions : null };
    }
    case 'day':
      return { ...c, day: read.get_day({ date: c.date }) };
    case 'trip':
      return { ...c, trip: read.get_trip_overview() };
    case 'list': {
      const { filter, query, count, source } = c;
      const labels = filterChips(filter, d.data.getState().areas).map((x) => x.label);
      return { kind: 'list', source, filter, query, count, labels, ...(source === 'wish' ? { wishes: read.get_opinions() } : {}) };
    }
  }
}

/** 前面的輪已經帶過完整內容的晶片：只帶晶片本身和 repeated（T36：「某天」晶片約 1.5k tokens，每輪重複會讓對話很快就滿） */
const repeatedChip = (c: ChatContext) => ({ ...c, repeated: true });

export function buildTurnContext(opts: { d: AiDeps; read: ReadTools; stage: Stage; chips: ChatContext[]; sent?: (c: ChatContext) => boolean; screenOff: boolean; decisions: TurnContext['decisions']; draft: TurnContext['draft']; cards: TurnContext['cards']; now?: number }): TurnContext {
  const now = jstNow(opts.now ?? Date.now());
  return {
    // 現在一律是日本時間：旅途中問「今天」「明天」才對得上（T34）
    now: `${now.date}（${now.weekday}）${now.time}`,
    // 使用者把「正在看」拿掉時不帶
    screen: opts.screenOff ? {} : screenContext(opts.d, opts.stage),
    chips: opts.chips.map((c) => (opts.sent?.(c) ? repeatedChip(c) : chipContent(c, opts.d, opts.read))),
    decisions: opts.decisions,
    draft: opts.draft,
    cards: opts.cards,
  };
}
