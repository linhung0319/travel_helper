// 網站共用的一份 AI（T16m）：聊天、工具、提議；邏輯在 ai/。畫面（T16m-b、T16m-c）從這裡拿 ai，再用 setScreenSurface 接上平台。
// dev server 用假 AI（dev-fixtures/ai/）和 localStorage；正式 build 呼叫 Worker，聊天紀錄存 D1（T16）。

import { appStore } from './store.ts';
import { dataStore, ensureDetails } from './dataStore.ts';
import { commands } from './appCommands.ts';
import { shared, sharedStore } from './appShared.ts';
import { addPlaceStore } from './addPlaceStore.ts';
import { dataSource } from './data/index.ts';
import { currentEngineData, engineConfig, planStore } from './planStore.ts';
import { openDialog, uiStore } from './uiStore.ts';
import { createLocalChatRepository } from './ai/chatRepository.ts';
import { createChat } from './ai/chat.ts';
import { appSurface, createBaseStage, type ScreenSurface } from './ai/stage.ts';
import { createApiChatRepository } from './ai/apiChatRepository.ts';
import { createWorkerModel } from './ai/workerModel.ts';
import type { ModelClient } from './ai/types.ts';

function browserStorage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** 確認「開始編輯？」：沿用現有的對話框，關掉時看有沒有進入編輯 */
function confirmPlanning(summary: string): Promise<boolean> {
  return new Promise((resolve) => {
    openDialog({ kind: 'planning', ...(summary ? { note: summary } : {}) });
    const off = uiStore.subscribe((s) => {
      if (s.dialog?.kind === 'planning') return;
      off();
      resolve(appStore.getState().planning);
    });
  });
}

// 正式 build 呼叫 Worker；dev server 在 boot 換成假 AI
let model: ModelClient = createWorkerModel({ onLoggedOut: () => location.reload() });
/** dev 選單、Playwright 切換假 AI 的狀態（正式 build 是 null） */
export let fakeSettings: { delayMs: number; usage: 'ok' | 'near' | 'full'; next: 'error' | 'quota' | 'hang' | null } | null = null;

let surface: ScreenSurface = appSurface(appStore);
/** 切到想去分頁（第一次按 ♡ 的提示「去看」） */
export const showWishTab = () => surface.showTab('wish');

/** 平台接上怎麼切畫面（T16m-b、T16m-c） */
export const setScreenSurface = (s: ScreenSurface) => {
  surface = s;
};

export const ai = createChat({
  app: appStore,
  data: dataStore,
  plan: planStore,
  shared,
  commands,
  engine: currentEngineData,
  config: engineConfig,
  source: dataSource,
  details: ensureDetails,
  confirmPlanning,
  repo: import.meta.env.DEV ? createLocalChatRepository({ storage: browserStorage(), memberId: () => sharedStore.getState().me?.id ?? 'guest' }) : createApiChatRepository(),
  // 模型、平台都晚一點才定，這裡包一層
  model: { send: (request, signal) => model.send(request, signal) },
  stage: createBaseStage({
    app: appStore,
    commands,
    surface: {
      showList: () => surface.showList(),
      showTab: (tab) => surface.showTab(tab),
      showPanel: (panel) => surface.showPanel(panel),
      showDay: (day) => surface.showDay(day),
      openPlace: (id) => surface.openPlace(id),
      screenKey: () => surface.screenKey(),
      screenName: () => surface.screenName(),
      filterApplied: (patch, clear) => surface.filterApplied(patch, clear),
      screenFilter: () => surface.screenFilter(),
      afterAdopt: () => surface.afterAdopt(),
      proposalStale: () => surface.proposalStale(),
    },
    startAddPlace: (init) => addPlaceStore.getState().start(init),
  }),
});

/** 啟動時呼叫（資料和登入好了之後，再呼叫也只跑一次）。直接用 import.meta.env.DEV 判斷，假 AI 不會進 dist/ */
let started: Promise<void> | null = null;
export function startAi(): Promise<void> {
  started ??= boot();
  return started;
}

async function boot() {
  if (import.meta.env.DEV) {
    const { createFakeModel } = await import('./dev-fixtures/ai/fakeModel.ts');
    const fake = createFakeModel({ delayMs: 300 });
    model = fake;
    fakeSettings = fake.settings;
  }
  try {
    await ai.init();
  } catch (e) {
    console.error(e);
    ai.store.setState({ error: { code: 'network', message: '聊天紀錄讀不到，請重新整理再試一次' } });
  }
  if (!import.meta.env.DEV && typeof document !== 'undefined') {
    // 另一個分頁、另一台裝置可能接著聊過：切回來時重新抓（規格 §11）
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void ai.refresh().catch(console.error);
    });
  }
}

/** 看提議還是看原本（§16.1、§16.2，兩邊一樣）：按了「編輯」回到真的時間軸才改得到；新的提議出現時看差異 */
export function watchProposalView(): () => void {
  return appStore.subscribe((s, prev) => {
    if (s.planning && !prev.planning && s.proposal) uiStore.setState({ proposalView: 'original' });
    if (s.proposal && !prev.proposal) uiStore.setState({ proposalView: s.planning ? 'original' : 'diff' });
  });
}

/** 平台不接手時（版面換掉）回到預設 */
export const resetScreenSurface = () => setScreenSurface(appSurface(appStore));
