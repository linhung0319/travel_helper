// 班次表（T29c spec §8.8）要的整理：標題下面那行小字、班距型那一程的內容、時刻表來源那一行。
// 純函式；班次本身是引擎的 rideDepartures，排成格子是 legView 的 departureCells。

import { busDayType, kintetsuDayType, type KintetsuTimes, type RouteTimetable, type TransitRide } from '@travel-helper/engine';
import { isKintetsu, rideShortName } from './legView.ts';
import { dayLabel } from './trip.ts';

/** 路線名裡「（往X）」的 X；沒寫往哪是 null */
const headsign = (line: string) => /（往([^（）]+)）/.exec(line)?.[1] ?? null;

/**
 * 班次表標題下面那行小字（spec §8.8）：「業者或路線・往哪・日期（星期）・HH:MM 到站」，巴士最後加票價。
 * 近鐵只寫「近鐵」（車種寫在格子裡）；其他用短名稱（rideShortName）。readyAt 是走到上車站（轉乘完）的時間
 */
export function timetableSubtitle(ride: TransitRide, date: string, readyAt: string): string {
  const to = headsign(ride.line);
  const parts = [isKintetsu(ride) ? '近鐵' : rideShortName(ride), to ? `往${to}` : null, dayLabel(date), `${readyAt} 到站`];
  if (ride.mode === 'bus' && ride.fareAdult != null) parts.push(`${ride.fareAdult.toLocaleString('en-US')} 円`);
  return parts.filter((p): p is string => !!p).join('・');
}

/** 班距型那一程的班次表內容：「約 15 分一班・首班 05:45／末班 23:02」；查不到的寫「沒查到」（班距查不到寫「班距沒查到」，不寫「約 ? 分」） */
export function headwayText(ride: Pick<TransitRide, 'headwayMin' | 'first' | 'last'>): string {
  const every = ride.headwayMin != null ? `約 ${ride.headwayMin} 分一班` : '班距沒查到';
  return `${every}・首班 ${ride.first ?? '沒查到'}／末班 ${ride.last ?? '沒查到'}`;
}

/** 時刻表檔案裡引擎型別沒列、但原始 JSON 有的欄位 */
type WithSource = { retrieved?: string | null; sources?: { url?: string | null; retrieved?: string | null }[] | null };

const BUS_DAY: Record<ReturnType<typeof busDayType>, string> = { weekday: '平日', saturday: '週六', holiday: '週日、假日' };
const KINTETSU_DAY: Record<ReturnType<typeof kintetsuDayType>, string> = { weekday: '平日', holiday: '週末、假日' };

/**
 * 最下面的時刻表來源：「時刻表來源：三重交通（2026-10-19 取得）・平日」；有網址的給 url。
 * 巴士、船、JR 看 ride.routeId 那個路線檔，近鐵看 _travel-times.json；沒有取得日期也沒有網址回傳 null（不寫）
 */
export function timetableSource(
  ride: Pick<TransitRide, 'mode' | 'routeId'>,
  tt: { kintetsu?: KintetsuTimes | null; routes?: RouteTimetable[] },
  date: string,
  holidays: readonly string[],
): { text: string; url: string | null } | null {
  let who: string;
  let doc: WithSource | null;
  let day: string;
  if (ride.routeId) {
    const route = (tt.routes ?? []).find((r) => r.id === ride.routeId);
    if (!route) return null;
    doc = route as RouteTimetable & WithSource;
    who = route.operator ?? route.name.zh ?? route.name.ja;
    day = BUS_DAY[busDayType(date, holidays)];
  } else if (ride.mode === 'train' && tt.kintetsu) {
    doc = tt.kintetsu as KintetsuTimes & WithSource;
    who = '近鐵';
    day = KINTETSU_DAY[kintetsuDayType(date, holidays)];
  } else return null;
  const src = doc.sources?.find((s) => s.url) ?? null;
  const retrieved = doc.retrieved ?? src?.retrieved ?? null;
  const url = src?.url ?? null;
  if (!retrieved && !url) return null;
  return { text: `時刻表來源：${who}${retrieved ? `（${retrieved} 取得）` : ''}・${day}`, url };
}
