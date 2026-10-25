// 地圖那側的班次表（第五輪 §4）要的整理：預設列哪幾班、等多久的寫法、走到站的提示、時刻表來源那一行。
// 純函式；班次本身是引擎的 rideDepartures，搭不到／搭得到／選定是 planView 的 departureRows。

import { busDayType, kintetsuDayType, toMinutes, type KintetsuTimes, type Leg, type RouteTimetable, type TransitRide } from '@travel-helper/engine';
import { rideReadyAt, type DepartureRow } from './planView.ts';

/** 班次超過幾班才收起來 */
export const TIMETABLE_FOLD = 8;
/** 收起來時列走到站之前幾班、之後幾班 */
const BEFORE = 1;
const AFTER = 4;

/**
 * 班次表預設列哪幾班：不超過 TIMETABLE_FOLD 班全列；超過時列 readyAt 之前 1 班、之後 4 班，
 * 選定的那班不在範圍內時把範圍拉到它。hidden 是沒列出的班數（0＝不用「看全部」）
 */
export function timetableWindow(rows: DepartureRow[], readyAt: string, showAll = false): { rows: DepartureRow[]; hidden: number } {
  if (showAll || rows.length <= TIMETABLE_FOLD) return { rows, hidden: 0 };
  const ready = toMinutes(readyAt);
  let first = rows.findIndex((r) => toMinutes(r.depart) >= ready);
  if (first < 0) first = rows.length;
  let start = Math.max(0, first - BEFORE);
  let end = Math.min(rows.length, first + AFTER);
  const sel = rows.findIndex((r) => r.state === 'selected');
  if (sel >= 0) {
    start = Math.min(start, sel);
    end = Math.max(end, sel + 1);
  }
  return { rows: rows.slice(start, end), hidden: rows.length - (end - start) };
}

/** 一列右邊的字：搭不到、等 N 分（1 小時以上寫成 1小時53分，long 用橘色）、選定的加「・選定」 */
export function departureLabel(row: DepartureRow): { text: string; long: boolean } {
  if (row.wait == null) return { text: row.state === 'selected' ? '搭不到・選定' : '搭不到', long: false };
  const long = row.wait >= 60;
  const wait = `等 ${row.wait} 分`; // 和卡片、下拉一樣寫「等 N 分」；1 小時以上只改顏色（long）
  return { text: row.state === 'selected' ? `${wait}・選定` : wait, long };
}

/**
 * 藍底提示：判斷搭不搭得到用的時間。第一程「走到 川辺：15:15（伊雜宮 15:01 出發）」；
 * 轉乘的那程「宇治山田 轉乘完：12:20（12:15 到站）」。nameOf 把站 ID 換成站名
 */
export function readyHint(leg: Pick<Leg, 'ready' | 'depart' | 'rides'>, rideIndex: number, fromName: string, nameOf: (id: string) => string): string {
  const ride = leg.rides[rideIndex];
  const at = rideReadyAt(leg, rideIndex);
  if (!ride) return at;
  if (rideIndex === 0) return `走到 ${nameOf(ride.from)}：${at}（${fromName} ${leg.depart} 出發）`;
  const prev = leg.rides[rideIndex - 1];
  return `${nameOf(ride.from)} 轉乘完：${at}${prev ? `（${prev.arrive} 到站）` : ''}`;
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
