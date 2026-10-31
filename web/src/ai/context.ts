// 每次對話自動帶的脈絡（規格 §4.5）：畫面狀態、脈絡晶片，只帶小的東西，其他用工具查。

import { filterChips } from '../lib/filter.ts';
import { inBbox } from '../lib/areas.ts';
import type { AiDeps } from './deps.ts';
import type { ReadTools } from './readTools.ts';
import type { Stage } from './stage.ts';
import type { ChatContext, TurnContext } from './types.ts';

/** 使用者正在看什麼（平台無關） */
export function screenContext(d: AiDeps, stage: Stage): Record<string, unknown> {
  const v = d.commands.getViewState();
  const { view } = d.app.getState();
  const { places } = d.data.getState();
  return {
    looking: stage.screenName(),
    day: v.day,
    dayLabel: v.dayLabel,
    dayStops: v.dayStops,
    planning: v.planning,
    filterLabels: v.filterLabels,
    filterCount: v.filterCount,
    mapBounds: view?.bounds ?? null,
    placesInView: view ? places.filter((p) => inBbox(p.coords, view.bounds)).length : null,
    selection: v.selection,
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

export function buildTurnContext(opts: { d: AiDeps; read: ReadTools; stage: Stage; chips: ChatContext[]; screenOff: boolean; decisions: TurnContext['decisions']; draft: TurnContext['draft']; cards: TurnContext['cards'] }): TurnContext {
  return {
    // 使用者把「正在看」拿掉時不帶
    screen: opts.screenOff ? {} : screenContext(opts.d, opts.stage),
    chips: opts.chips.map((c) => chipContent(c, opts.d, opts.read)),
    decisions: opts.decisions,
    draft: opts.draft,
    cards: opts.cards,
  };
}
