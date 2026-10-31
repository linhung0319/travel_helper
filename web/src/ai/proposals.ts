// 提議（規格 §3.3）：只在自己的畫面，不寫進後端；內容是操作清單，行程變了就重算，套不上就過期。
// 採用：不在編輯中先確認「開始編輯？」，changeItinerary 寫入（先存快照），跳「復原」。

import { createStore, type StoreApi } from 'zustand/vanilla';
import { ItineraryError } from '@travel-helper/engine';
import type { Itinerary } from '@travel-helper/engine/types';
import type { Candidate } from '../backend/types.ts';
import { applyOps, placedByOps, type Op } from './ops.ts';
import { opsContext, type AiDeps } from './deps.ts';

export interface ActiveProposal {
  /** 提議卡（tool_use 的 ID） */
  cardId: string;
  ops: Op[];
  summary: string;
}

export interface ProposalState {
  active: ActiveProposal | null;
}

export type ProposalOutcome = 'confirmed' | 'cancelled' | 'stale' | 'failed';

export interface ProposalDeps extends AiDeps {
  /** 確認「開始編輯？」：使用者按確認回傳 true */
  confirmPlanning(): Promise<boolean>;
  /** 提議卡的狀態變了（被新的取代、過期） */
  onCardChange(cardId: string, status: 'superseded' | 'stale'): void;
}

export interface Proposals {
  store: StoreApi<ProposalState>;
  /** 顯示提議（也用於「在行程上看」：用最新的行程重新檢查）；回傳錯誤訊息（套不上、沒有改動），新的取代舊的 */
  show(cardId: string, ops: Op[], summary: string): string | null;
  /** 採用：用最新的行程重新檢查，寫進行程 */
  adopt(ops: Op[], summary: string): Promise<ProposalOutcome>;
  /** 不要：這張卡的提議正在畫面上就清掉 */
  reject(cardId: string): void;
  /** 畫面上清掉，提議卡還在（切換對話） */
  hide(): void;
  dispose(): void;
}

export function createProposals(d: ProposalDeps): Proposals {
  const store = createStore<ProposalState>()(() => ({ active: null }));
  // 採用中：changeItinerary 先改畫面，不要把這個變動當成別人改的再算一次
  let adopting = false;
  const after = (it: Itinerary, ops: Op[]) => applyOps(it, ops, opsContext(d));

  function draw(ops: Op[], summary: string): string | null {
    const it = d.data.getState().itinerary;
    if (!it) return '還沒有行程';
    try {
      const r = d.commands.showProposal(after(it, ops), { summary });
      return r.ok ? null : r.error;
    } catch (e) {
      if (e instanceof ItineraryError) return e.message;
      throw e;
    }
  }

  function hide() {
    store.setState({ active: null });
    d.commands.clearProposal();
  }

  // 行程變了（同步進來別人的、自己手動改）：差異和警告跟著重算；套不上就過期
  const unsubscribe = d.data.subscribe((s, prev) => {
    const a = store.getState().active;
    if (!a || adopting || s.itinerary === prev.itinerary) return;
    if (draw(a.ops, a.summary)) {
      hide();
      d.onCardChange(a.cardId, 'stale');
    }
  });

  return {
    store,
    show(cardId, ops, summary) {
      const old = store.getState().active;
      const err = draw(ops, summary);
      if (err) return err;
      if (old && old.cardId !== cardId) d.onCardChange(old.cardId, 'superseded');
      store.setState({ active: { cardId, ops, summary } });
      return null;
    },
    async adopt(ops, summary) {
      const app = d.app.getState();
      if (!app.planning && !(await d.confirmPlanning())) return 'cancelled';
      // 可能在確認的時候別人改了行程：套不上就過期
      const it = d.data.getState().itinerary;
      if (!it) return 'failed';
      let dates: string[] = [];
      try {
        const r = d.commands.showProposal(after(it, ops), { summary });
        if (!r.ok) {
          hide();
          return 'stale';
        }
        dates = r.dates;
      } catch (e) {
        if (!(e instanceof ItineraryError)) throw e;
        hide();
        return 'stale';
      }
      // 編輯要選到某一天（選「整趟」會結束編輯）
      if (d.app.getState().day === 'all') d.app.getState().selectDay(dates[0]);
      d.app.getState().setPlanning(true);
      const removed: Candidate[] = [];
      adopting = true;
      const r = await d.shared.changeItinerary((x) => after(x, ops), `採用 AI 的提議：${summary}`, {
        undo: {
          text: '已採用提議',
          after: async () => {
            for (const c of removed) await d.shared.addCandidate(c.placeId, c.day);
          },
        },
        // 排進去的點，那天的候選拿掉（同手動排進行程）
        settle: async () => {
          for (const { place, date } of placedByOps(ops)) {
            for (const c of d.shared.store.getState().candidates.filter((x) => x.placeId === place && x.day === date)) {
              removed.push(c);
              await d.shared.removeCandidate(c.id, undefined, true);
            }
          }
        },
      });
      adopting = false;
      // 存不了（別人先改過、網路）：提議留著，changeItinerary 已經跳提示
      if (!r.ok) return 'failed';
      hide();
      return 'confirmed';
    },
    reject(cardId) {
      if (store.getState().active?.cardId === cardId) hide();
    },
    hide,
    dispose: unsubscribe,
  };
}
