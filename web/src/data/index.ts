// 目前用的資料來源。dev server 讀本機的 data/（local.ts），正式 build 讀 API 和 /static/（api.ts）。
// local.ts 要包在 import.meta.env.DEV 裡，build 時整段拿掉，資料點、時刻表才不會進 /assets/（那裡不用登入就讀得到，T15）。
import { apiSource } from './api.ts';
import type { DataSource } from './source.ts';

async function pick(): Promise<DataSource> {
  if (import.meta.env.DEV) return (await import('./local.ts')).localSource;
  return apiSource;
}

let chosen: Promise<DataSource> | null = null;
const source = () => (chosen ??= pick());

export const dataSource: DataSource = {
  loadAreas: () => source().then((s) => s.loadAreas()),
  loadPlaces: () => source().then((s) => s.loadPlaces()),
  loadPlaceDetails: () => source().then((s) => s.loadPlaceDetails()),
  loadTimetable: (stationId) => source().then((s) => s.loadTimetable(stationId)),
  loadEngineTimetables: () => source().then((s) => s.loadEngineTimetables()),
  loadTripInfo: (topic) => source().then((s) => s.loadTripInfo(topic)),
};
export type { DataSource };
