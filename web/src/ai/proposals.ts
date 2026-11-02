// 提議（規格 §3.3）：只在自己的畫面，不寫進後端；內容是操作清單，行程變了就重算，套不上就過期。
// 採用：按了就是決定，直接用 changeItinerary 寫入（先存快照），跳「復原」；不進編輯模式（T39，interaction-design §16.1）。本來就在編輯中的留在編輯中。

import { createStore, type StoreApi } from 'zustand/vanilla';
import { ItineraryError } from '@travel-helper/engine';
import type { Itinerary } from '@travel-helper/engine/types';
import type { Candidate } from '../backend/types.ts';
import { applyOps, placedByOps, withdrawnByOps, type Op } from './ops.ts';
import { opsContext, placeName, type AiDeps } from './deps.ts';
import { untagged } from './transcript.ts';

export interface ActiveProposal {
  /** 提議卡（tool_use 的 ID） */
  cardId: string;
  ops: Op[];
  summary: string;
}

export interface ProposalState {
  active: ActiveProposal | null;
}

export type ProposalOutcome = 'confirmed' | 'stale' | 'failed';

export interface ProposalDeps extends AiDeps {
  /** 提議卡的狀態變了（被新的取代、過期、採用後按了復原） */
  onCardChange(cardId: string, status: 'superseded' | 'stale' | 'undone'): void;
}

export interface Proposals {
  store: StoreApi<ProposalState>;
  /** 顯示提議（也用於「在行程上看」：用最新的行程重新檢查）；回傳錯誤訊息（套不上、沒有改動），新的取代舊的 */
  show(cardId: string, ops: Op[], summary: string): string | null;
  /** 採用：用最新的行程重新檢查，寫進行程 */
  adopt(cardId: string, ops: Op[], summary: string): Promise<ProposalOutcome>;
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
  const plain = (text: string) => untagged(text, (id) => placeName(d.data.getState().byId.get(id), id));

  function draw(ops: Op[], summary: string): string | null {
    const it = d.data.getState().itinerary;
    if (!it) return '還沒有行程';
    try {
      const r = d.commands.showProposal(after(it, ops), { summary: plain(summary) });
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
    async adopt(cardId, ops, summary) {
      // 可能別人剛改了行程：套不上就過期
      const it = d.data.getState().itinerary;
      if (!it) return 'failed';
      let dates: string[] = [];
      try {
        const r = d.commands.showProposal(after(it, ops), { summary: plain(summary) });
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
      // 看整趟時跳到改的那天，看得到結果
      if (d.app.getState().day === 'all') d.app.getState().selectDay(dates[0]);
      const removed: Candidate[] = [];
      const added: number[] = [];
      const withdrawn = withdrawnByOps(it, ops);
      adopting = true;
      const r = await d.shared.changeItinerary((x) => after(x, ops), `採用 AI 的提議：${summary}`, {
        undo: {
          text: '已採用提議',
          after: async () => {
            for (const c of removed) await d.shared.addCandidate(c.placeId, c.day);
            for (const id of added) await d.shared.removeCandidate(id, undefined, true);
            d.onCardChange(cardId, 'undone');
          },
        },
        settle: async () => {
          // 排進去的點，那天的候選拿掉（同手動排進行程）
          for (const { place, date } of placedByOps(ops)) {
            for (const c of d.shared.store.getState().candidates.filter((x) => x.placeId === place && x.day === date)) {
              removed.push(c);
              await d.shared.removeCandidate(c.id, undefined, true);
            }
          }
          // 撤下的回候選（同手動的撤下）；那天已經有的不動，復原時也不刪
          for (const { place, date } of withdrawn) {
            const c = await d.shared.ensureCandidate(place, date);
            if (c.ok && c.value.created) added.push(c.value.id);
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
