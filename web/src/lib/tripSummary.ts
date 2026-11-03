// 行程摘要（T34）：時間軸算好後整理成 engine 的 TripSummary，存進後端給 LINE 機器人讀（Worker 算不出時間，architecture §6）。
// 什麼時候存：手上的行程版本和後端摘要的版本（sync 的 summary）不一樣，而且時間軸是照這一版算的。
// 自己存完行程後一定不一樣，所以會存；別人改的同步進來時，他通常已經存了，就不再存。
// 存檔中、衝突中不存（畫面上的是還沒存成功的行程）。同一版只試一次。

import type { StoreApi } from 'zustand/vanilla';
import { buildTripSummary, type ItineraryPlan, type TripSummary } from '@travel-helper/engine';
import type { Itinerary } from '@travel-helper/engine/types';
import type { Backend } from '../backend/types.ts';
import type { Area, Place } from '../data/types.ts';
import type { DataState } from '../dataStore.ts';
import type { PlanState } from '../planStore.ts';
import type { SharedState } from '../sharedStore.ts';
import { noteRows } from './reservations.ts';

const nameOf = (byId: Map<string, Place>) => (id: string) => {
  const p = byId.get(id);
  return p ? p.name.zh || p.name.ja || id : null;
};

/** 行程＋時間軸 → 摘要；要預約的只留主選和住宿（狀態回覆時再讀最新的）；areas 給每天在哪一區的區名（T45a） */
export function summaryOf(itinerary: Itinerary, plan: ItineraryPlan, byId: Map<string, Place>, areas: Area[] = []): TripSummary {
  const name = nameOf(byId);
  const reservations = noteRows(itinerary, plan, byId, [])
    .filter((r) => r.role !== 'other')
    .map((r) => ({ date: r.key.date, placeId: r.placeId, name: name(r.placeId) ?? r.placeId, time: r.time, endDate: r.endDate }));
  const areaName = (id: string) => {
    const a = areas.find((x) => x.id === id);
    return a ? a.name.zh || a.name.ja || id : id;
  };
  return buildTripSummary({ itinerary, plan, nameOf: name, reservations, areaName, areaOf: (id) => byId.get(id)?.area });
}

export function startSummaryPush(o: { shared: StoreApi<SharedState>; data: StoreApi<DataState>; plan: StoreApi<PlanState>; backend: () => Backend; delayMs?: number }): () => void {
  let planFor: Itinerary | null = null;
  let tried = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;

  function tryPush() {
    timer = null;
    const sh = o.shared.getState();
    const d = o.data.getState();
    const p = o.plan.getState();
    if (sh.saving || sh.conflict || !sh.version || !sh.lastSync) return;
    if (p.status !== 'ready' || !p.plan || !d.itinerary || planFor !== d.itinerary) return;
    if (tried === sh.version || sh.lastSync.summary === sh.version) return;
    tried = sh.version;
    let summary: TripSummary;
    try {
      summary = summaryOf(d.itinerary, p.plan, d.byId, d.areas);
    } catch (e) {
      console.warn('整理行程摘要失敗', e);
      return;
    }
    // 409：行程又被改了，新版的摘要由改的人存
    o.backend()
      .putTripSummary(sh.version, summary)
      .catch((e) => console.warn('存行程摘要失敗', e));
  }

  // 連續改幾次只存最後一次
  const schedule = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(tryPush, o.delayMs ?? 2000);
  };
  const offPlan = o.plan.subscribe(() => {
    // 時間軸在 dataStore 變了的當下同步算好，這時的行程就是它算的那一份
    planFor = o.data.getState().itinerary;
    schedule();
  });
  const offShared = o.shared.subscribe((s, prev) => {
    if (s.version !== prev.version || s.saving !== prev.saving || s.lastSync !== prev.lastSync || s.conflict !== prev.conflict) schedule();
  });
  return () => {
    offPlan();
    offShared();
    if (timer) clearTimeout(timer);
  };
}
