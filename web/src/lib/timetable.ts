// 車站面板：指定時間前後的班次（上下行）。

import type { StationTimetable, TimetableTrain } from '../data/types.ts';

export function toMinutes(hhmm: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!m) throw new RangeError(`時間格式要是 HH:MM：${hhmm}`);
  return Number(m[1]) * 60 + Number(m[2]);
}

export interface DirectionDepartures {
  direction: string;
  label: string;
  before: TimetableTrain[];
  after: TimetableTrain[];
}

// 方向鍵是時刻表格式的固定值（CONVENTIONS §3「時刻表」、timetables/README.md），不是區域
const DIRECTION_LABELS: Record<string, string> = {
  'for-kashikojima': '往鳥羽・賢島（南下）',
  'for-ise-nakagawa': '往伊勢中川・名古屋・大阪（北上）',
  'for-toba': '往鳥羽',
  'for-taki': '往多氣・松阪・名古屋',
};

export function directionLabel(direction: string): string {
  return DIRECTION_LABELS[direction] ?? direction.replace(/^for-/, '往 ');
}

/** 每個方向：指定時間之前 `nBefore` 班、之後（含同一分鐘）`nAfter` 班 */
export function departuresAround(
  tt: StationTimetable,
  dayType: 'weekday' | 'holiday',
  time: string,
  nBefore = 2,
  nAfter = 4,
): DirectionDepartures[] {
  const t = toMinutes(time);
  return Object.entries(tt.directions).map(([direction, byDay]) => {
    const trains = [...(byDay[dayType] ?? [])].sort((a, b) => toMinutes(a.dep) - toMinutes(b.dep));
    const idx = trains.findIndex((x) => toMinutes(x.dep) >= t);
    const split = idx < 0 ? trains.length : idx;
    return {
      direction,
      label: directionLabel(direction),
      before: trains.slice(Math.max(0, split - nBefore), split),
      after: trains.slice(split, split + nAfter),
    };
  });
}

// 終點站不在 stations.json 裡的（區間外的站），顯示名稱放這裡；不認得的直接顯示 ID
const TERMINUS_NAMES: Record<string, string> = {
  'ise-nakagawa': '伊勢中川',
  shiratsuka: '白塚',
  nabari: '名張',
  'kintetsu-nagoya': '近鐵名古屋',
  myojo: '明星',
  'osaka-uehommachi': '大阪上本町',
  'osaka-namba': '大阪難波',
  kyoto: '京都',
  'jr-nagoya': '名古屋',
  'jr-kameyama': '龜山',
  'jr-matsusaka': '松阪',
  'jr-taki': '多氣',
  'jr-tsu': '津',
  'jr-shingu': '新宮',
  'jr-kii-katsuura': '紀伊勝浦',
};

export function terminusName(id: string, stationNames: Map<string, string>): string {
  return stationNames.get(id) ?? TERMINUS_NAMES[id] ?? id;
}

/** Google Maps 的大眾運輸路線（不帶起點＝從現在位置出發，PLAN §1） */
export function googleTransitUrl([lon, lat]: [number, number]): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}&travelmode=transit`;
}

/** ジョルダン的車站時刻表（用站名查） */
export function jorudanUrl(stationNameJa: string): string {
  return `https://www.jorudan.co.jp/time/eki_${encodeURIComponent(stationNameJa)}.html`;
}
