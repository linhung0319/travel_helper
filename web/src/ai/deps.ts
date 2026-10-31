// AI 的依賴：從外面給（同 createAddPlaceStore），Node 的測試才不用接整個網站；網站共用的一份在 appAi.ts。

import type { StoreApi } from 'zustand/vanilla';
import type { EngineConfig, EngineData } from '@travel-helper/engine';
import type { createCommands } from '../commands.ts';
import type { DataSource } from '../data/source.ts';
import type { DataState } from '../dataStore.ts';
import type { PlanState } from '../planStore.ts';
import type { createShared } from '../sharedStore.ts';
import type { AppStore } from '../store.ts';
import type { Place } from '../data/types.ts';
import type { OpsContext } from './ops.ts';

export interface AiDeps {
  app: StoreApi<AppStore>;
  data: StoreApi<DataState>;
  plan: StoreApi<PlanState>;
  shared: ReturnType<typeof createShared>;
  commands: ReturnType<typeof createCommands>;
  /** 引擎資料（時刻表還沒載入時是 null） */
  engine(): EngineData | null;
  config: EngineConfig;
  source: Pick<DataSource, 'loadTimetable' | 'loadTripInfo'>;
}

export const placeName = (p: Place | undefined, id = '') => (p ? p.name.zh || p.name.ja : id);

export function opsContext(d: Pick<AiDeps, 'data' | 'shared'>): OpsContext {
  const s = d.shared.store.getState();
  return {
    placeType: (id) => d.data.getState().byId.get(id)?.type,
    likesOf: (id) => s.votes.filter((v) => v.placeId === id && v.value === 'like').map((v) => v.memberId),
    me: s.me?.id ?? null,
  };
}
