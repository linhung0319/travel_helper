// AI 測試的環境：真的資料點、真的時刻表、真的引擎、假後端、假 AI；只有呈現是記下來的（平台由 T16m-b、T16m-c 接）。
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createStore } from 'zustand/vanilla';
import { resolveConfig, type KintetsuTimes, type RouteTimetable, type UrbanRoute, type UrbanTransfer } from '@travel-helper/engine';
import { createAppStore } from '../src/store.ts';
import { createCommands } from '../src/commands.ts';
import { createShared } from '../src/sharedStore.ts';
import { createMockBackend } from '../src/backend/mock.ts';
import { devSeed } from '../src/dev-fixtures/seed.ts';
import { normalizeAreas, normalizePlaceList } from '../src/data/normalize.ts';
import { currentEngineData, startPlanner, type PlanState } from '../src/planStore.ts';
import type { DataSource, EngineTimetables } from '../src/data/source.ts';
import type { DataState } from '../src/dataStore.ts';
import { createChat } from '../src/ai/chat.ts';
import { createLocalChatRepository } from '../src/ai/chatRepository.ts';
import { appSurface, createBaseStage, type AddPlaceInit, type ScreenSurface } from '../src/ai/stage.ts';
import { createFakeModel } from '../src/dev-fixtures/ai/fakeModel.ts';
import type { ModelClient } from '../src/ai/types.ts';

const ROOT = join(import.meta.dirname, '..', '..');
const json = (...p: string[]) => JSON.parse(readFileSync(join(ROOT, ...p), 'utf8'));

const AREAS = normalizeAreas(json('data', 'areas.json'));
const PLACES = [
  ...normalizePlaceList(json('data', 'stations.json')),
  ...readdirSync(join(ROOT, 'data', 'areas')).flatMap((a) =>
    readdirSync(join(ROOT, 'data', 'areas', a))
      .filter((f) => f.endsWith('.json'))
      .flatMap((f) => normalizePlaceList(json('data', 'areas', a, f))),
  ),
];

function dirJson(...p: string[]): unknown[] {
  const dir = join(ROOT, ...p);
  return existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => json(...p, f)) : [];
}

const hasStopsTrips = (r: unknown): r is RouteTimetable => !!r && typeof r === 'object' && 'stops' in r && 'trips' in r;
const TIMETABLES: EngineTimetables = {
  kintetsu: json('data', 'timetables', 'kintetsu', '_travel-times.json') as KintetsuTimes,
  routes: [...dirJson('data', 'timetables', 'bus'), ...dirJson('data', 'timetables', 'ferry'), ...dirJson('data', 'timetables', 'jr')].filter(hasStopsTrips),
  urban: readdirSync(join(ROOT, 'data', 'timetables', 'urban')).filter((f) => f.endsWith('.json') && f !== '_transfers.json').map((f) => json('data', 'timetables', 'urban', f) as UrbanRoute),
  urbanTransfers: json('data', 'timetables', 'urban', '_transfers.json') as UrbanTransfer[],
};

export function memoryStorage() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
}

export interface HarnessOptions {
  storage?: ReturnType<typeof memoryStorage>;
  delayMs?: number;
  /** 換成別的模型（scripts/ai-eval.ts 用真的 Claude API）；預設假 AI */
  model?: ModelClient;
  /** 現在的時間（試重新打開網站）；預設真的時間 */
  now?: () => string;
}

export async function harness(opts: HarnessOptions = {}) {
  const backend = createMockBackend(devSeed());
  const data = createStore<DataState>()(() => ({
    status: 'ready',
    error: null,
    areas: AREAS,
    basePlaces: PLACES,
    places: PLACES,
    byId: new Map(PLACES.map((p) => [p.id, p])),
    itinerary: null,
    days: new Map(),
    stationNames: new Map(),
    details: null,
    detailsError: null,
    placeEdits: [],
  }));
  const app = createAppStore();
  const shared = createShared(() => backend, data);
  await shared.load();
  const commands = createCommands(app, data);
  const plan = createStore<PlanState>()(() => ({ status: 'loading', error: null, plan: null }));
  const source: DataSource = {
    loadAreas: async () => AREAS,
    loadPlaceDetails: async () => [],
    loadPlaces: async () => PLACES,
    loadTimetable: async (id) => {
      const p = join(ROOT, 'data', 'timetables', 'kintetsu', `${id}.json`);
      return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null;
    },
    loadEngineTimetables: async () => TIMETABLES,
    loadTripInfo: async (topic) => (topic === 'passes' ? json('data', 'passes.json') : dirJson('data', 'access')),
  };
  const off = startPlanner(data, source, undefined, plan);
  await new Promise<void>((resolve, reject) => {
    const check = () => {
      const s = plan.getState();
      if (s.status === 'ready' && s.plan) resolve();
      else if (s.status === 'error') reject(new Error(s.error ?? 'planner'));
      else setTimeout(check, 5);
    };
    check();
  });
  const added: AddPlaceInit[] = [];
  const surface: ScreenSurface = appSurface(app);
  const stage = createBaseStage({ app, commands, surface, startAddPlace: (init) => added.push(init) });
  const storage = opts.storage ?? memoryStorage();
  const model = createFakeModel({ delayMs: opts.delayMs ?? 0 });
  const repo = createLocalChatRepository({ storage, memberId: () => shared.store.getState().me?.id ?? 'guest' });
  const chat = createChat({
    app,
    data,
    plan,
    shared,
    commands,
    engine: currentEngineData,
    config: resolveConfig(),
    source,
    ...(opts.now ? { now: opts.now } : {}),
    repo,
    model: opts.model ?? model,
    stage,
  });
  await chat.init();

  /** 這段對話裡工具呼叫的名字（照順序） */
  const called = () => chat.store.getState().messages.flatMap((m) => m.content.flatMap((b) => (b.type === 'tool_use' ? [b.name] : [])));
  /** 某個工具最後一次呼叫的 ID */
  const lastUse = (name: string) => {
    const uses = chat.store.getState().messages.flatMap((m) => m.content.flatMap((b) => (b.type === 'tool_use' && b.name === name ? [b] : [])));
    return uses.at(-1)!;
  };
  /** 某個工具最後一次的結果 */
  const lastResult = (name: string) => {
    const id = lastUse(name).id;
    const r = chat.store.getState().messages.flatMap((m) => m.content.flatMap((b) => (b.type === 'tool_result' && b.tool_use_id === id ? [b] : [])))[0];
    return JSON.parse(r.content);
  };
  const cardOf = (name: string) => {
    const id = lastUse(name).id;
    return chat.store.getState().messages.find((m) => m.cards?.[id])?.cards?.[id];
  };
  const reply = () => {
    const last = chat.store.getState().messages.at(-1)!;
    return last.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('');
  };
  /** 這輪所有 AI 說的話 */
  const allText = () => chat.store.getState().messages.filter((m) => m.role === 'assistant').flatMap((m) => m.content.flatMap((b) => (b.type === 'text' ? [b.text] : []))).join('\n');

  return {
    app,
    data,
    plan,
    backend,
    shared,
    commands,
    chat,
    repo,
    model,
    storage,
    added,
    called,
    lastUse,
    lastResult,
    cardOf,
    reply,
    allText,
    close() {
      chat.dispose();
      off();
    },
  };
}
