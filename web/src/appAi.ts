// 網站共用的一份 AI（T16m）：聊天、工具、提議；邏輯在 ai/。畫面（T16m-b、T16m-c）從這裡拿 ai，再用 setScreenSurface 接上平台。
// dev server 用假 AI（dev-fixtures/ai/）；正式 build 先用「還沒接上」的版本，T16 換成呼叫 Worker。

import { appStore } from './store.ts';
import { dataStore } from './dataStore.ts';
import { commands } from './appCommands.ts';
import { shared, sharedStore } from './appShared.ts';
import { addPlaceStore } from './addPlaceStore.ts';
import { dataSource } from './data/index.ts';
import { currentEngineData, engineConfig, planStore } from './planStore.ts';
import { openDialog, uiStore } from './uiStore.ts';
import { createLocalChatRepository } from './ai/chatRepository.ts';
import { createChat } from './ai/chat.ts';
import { appSurface, createBaseStage, type ScreenSurface } from './ai/stage.ts';
import { ModelError, type ModelClient } from './ai/types.ts';

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

const offlineModel: ModelClient = {
  // eslint-disable-next-line require-yield -- 還沒接上：第一步就丟錯誤
  async *send() {
    throw new ModelError('other', 'AI 還沒接上（T16）');
  },
};

let model: ModelClient = offlineModel;
/** dev 選單、Playwright 切換假 AI 的狀態（正式 build 是 null） */
export let fakeSettings: { delayMs: number; usage: 'ok' | 'near' | 'full'; next: 'error' | 'quota' | 'hang' | null } | null = null;

let surface: ScreenSurface = appSurface(appStore);
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
  confirmPlanning,
  repo: createLocalChatRepository({ storage: browserStorage(), memberId: () => sharedStore.getState().me?.id ?? 'guest' }),
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
  await ai.init();
}

/** 平台不接手時（版面換掉）回到預設 */
export const resetScreenSurface = () => setScreenSurface(appSurface(appStore));
