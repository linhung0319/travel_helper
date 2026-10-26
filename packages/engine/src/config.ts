// 引擎的規則數字。預設值照 CONVENTIONS §5（T7 訂定），沒有寫在 §5 的照出處註明；
// 都可以用 planItinerary(…, config) 的部分設定覆蓋。

import type { DateString, TimeString } from './types.ts';

export interface EngineConfig {
  trip: { from: DateString; to: DateString };

  walk: {
    /** 基本步速（§5.4） */
    metersPerMinute: number;
    /** 沒有路線距離時，直線距離的繞路係數（T6） */
    detourFactor: number;
    /** 團體係數（§5.4）：全員、分組有長輩或小孩、分組只有大人 */
    factorWhole: number;
    factorSubgroupWithElderOrKid: number;
    factorSubgroupAdults: number;
    /** 單段步行上限（套係數後，§5.4） */
    legMaxWhole: number;
    legMaxSubgroup: number;
    /** 一天累計步行（全員，景點內不算，§5.4） */
    dailyMaxWhole: number;
    /** 走到車站、停留所的最遠直線距離（公尺）；next-bus 的停留所 near 是 500 m 內 */
    accessMaxMeters: number;
  };

  transit: {
    /** 巴士：等車超過這個分鐘就不搭（§5.4 ①） */
    busMaxWait: number;
    /** 巴士：班距這個分鐘以上算「1 小時以上才一班」（§5.4 ①） */
    busMinHeadwayInfrequent: number;
    /** 這個人數以上搭巴士要警告擠不上（路線巴士不能預約） */
    busCrowdSize: number;
    /** 電車、船：等車超過這個分鐘就不搭（改搭計程車）；離島的船不受限制 */
    trainMaxWait: number;
    /** 近鐵轉乘至少幾分（next-train.mjs） */
    minTransfer: number;
    /** 能不能搭特急（要另買特急券） */
    allowExpress: boolean;
    /** 離島的子地區：上島、下島只能搭船 */
    islandRegions: string[];
    /** 一段公共交通最多搭幾程（RAPTOR 的輪數） */
    maxRides: number;
    /** 最多給幾條走法 */
    maxAlternatives: number;
    /** 大阪轉乘表的 walkMin 是 null、或同站換線沒記錄時的分鐘（係數 1） */
    urbanTransferDefault: number;
    /** 停留所、車站之間可以當成步行轉乘的直線距離（公尺） */
    transferMaxMeters: number;
    /** 挑預設走法時，每多一程加的分鐘（只用來挑，不加到時間上） */
    transferPenalty: number;
  };

  taxi: {
    /** 一般計程車、大型計程車能坐幾人（CONVENTIONS「團體」） */
    carCapacity: number;
    jumboCapacity: number;
    /** 行車速度（km/h）、道路繞路係數：沒有 OSRM 開車時間時估算用 */
    kmPerHour: number;
    roadDetour: number;
    /** 叫車、上下車的固定時間（預設 0：和 Google Maps 一樣只算車程） */
    overheadMinutes: number;
    /** 起跳價（data/raw/toba/transport.md：普通車 700 円 1.2 km、ジャンボ 840 円） */
    baseYen: number;
    jumboBaseYen: number;
    baseMeters: number;
    /** 加算：每 stepMeters 加 stepYen。沒查到，null 時不估費用 */
    stepMeters: number | null;
    stepYen: number | null;
    /** 直線超過這個距離（公里）就不建議計程車，改成「交通方式未知」 */
    maxKm: number;
  };

  day: {
    /** 從住宿出發的時間（§5.5：09:30 以後出發） */
    start: TimeString;
    /** 回到住宿：建議在這個區間（§5.5：16:30～17:00），晚於 returnLatest 警告 */
    returnBy: TimeString;
    returnLatest: TimeString;
    /** 一泊二食要在這之前到（interaction-design §2 的例子） */
    dinnerLodgingArriveBy: TimeString;
    /** 全員日主要景點的上限（§5.5） */
    maxMainSpots: number;
    /** 有長輩或小孩時，連續活動這麼久沒有休息（用餐、自由時間）要警告 */
    maxMinutesWithoutRest: number;
    /** 景點內步行這麼久以上算「累」（§5.5） */
    tiringWalkInside: number;
    /** 半天自由時間至少幾分（§5.5） */
    halfDayFreeMinutes: number;
    /** 空著這麼久以上產生「空檔」 */
    idleGapMinutes: number;
  };

  meals: {
    lunch: [TimeString, TimeString];
    dinner: [TimeString, TimeString];
    /** 餐廳沒有 stayMinutes 時依料理種類的預設（§5.5），找不到用 default */
    stayByCuisine: Record<string, number>;
    defaultStay: number;
  };

  stay: {
    /** 景點、住宿、使用者加的點沒有 stayMinutes 時的預設 */
    spot: number;
    lodging: number;
    station: number;
    userPlace: number;
  };

  flight: {
    /** 落地到出關（入境、領 15 人的行李），access/kix.json 推估 60～75 分 */
    arrivalClearMinutes: number;
    /** 起飛前幾分要到機場 */
    departAtAirportBefore: number;
  };

  /** 日本的國定假日（近鐵跑土休日ダイヤ）；同 scripts/next-train.mjs */
  holidays: DateString[];
}

export const DEFAULT_CONFIG: EngineConfig = {
  trip: { from: '2027-02-02', to: '2027-02-13' },
  walk: {
    metersPerMinute: 80,
    detourFactor: 1.3,
    factorWhole: 1.4,
    factorSubgroupWithElderOrKid: 1.2,
    factorSubgroupAdults: 1.0,
    legMaxWhole: 15,
    legMaxSubgroup: 25,
    dailyMaxWhole: 60,
    accessMaxMeters: 1200,
  },
  transit: {
    busMaxWait: 20,
    busMinHeadwayInfrequent: 60,
    busCrowdSize: 10,
    trainMaxWait: 30,
    minTransfer: 3,
    allowExpress: true,
    islandRegions: ['toshijima', 'sugashima', 'kamishima'],
    maxRides: 4,
    maxAlternatives: 3,
    urbanTransferDefault: 5,
    transferMaxMeters: 300,
    transferPenalty: 10,
  },
  taxi: {
    carCapacity: 4,
    jumboCapacity: 9,
    kmPerHour: 30,
    roadDetour: 1.3,
    overheadMinutes: 0,
    baseYen: 700,
    jumboBaseYen: 840,
    baseMeters: 1200,
    stepMeters: null,
    stepYen: null,
    maxKm: 40,
  },
  day: {
    start: '09:30',
    returnBy: '16:30',
    returnLatest: '17:00',
    dinnerLodgingArriveBy: '17:00',
    maxMainSpots: 2,
    maxMinutesWithoutRest: 180,
    tiringWalkInside: 60,
    halfDayFreeMinutes: 180,
    idleGapMinutes: 60,
  },
  meals: {
    lunch: ['11:00', '13:30'],
    dinner: ['17:30', '19:30'],
    stayByCuisine: {
      '定食・食堂': 45,
      海鮮丼: 45,
      '浜焼き・貝': 75,
      牡蠣: 75,
      '和食・割烹': 90,
      '伊勢海老・高級海鮮': 90,
      '咖啡・甜點': 40,
    },
    defaultStay: 60,
  },
  stay: { spot: 60, lodging: 30, station: 0, userPlace: 60 },
  flight: { arrivalClearMinutes: 75, departAtAirportBefore: 120 },
  holidays: ['2026-11-03', '2026-11-23', '2027-01-01', '2027-01-11', '2027-02-11', '2027-02-23', '2027-03-21', '2027-03-22'],
};

export type ConfigOverride = { [K in keyof EngineConfig]?: Partial<EngineConfig[K]> };

/** 預設值加上部分覆蓋（只合併一層） */
export function resolveConfig(override: ConfigOverride = {}): EngineConfig {
  const out = { ...DEFAULT_CONFIG } as Record<string, unknown>;
  for (const [k, v] of Object.entries(override)) {
    if (v == null) continue;
    const base = (DEFAULT_CONFIG as unknown as Record<string, unknown>)[k];
    out[k] = Array.isArray(v) || typeof base !== 'object' || Array.isArray(base) ? v : { ...(base as object), ...v };
  }
  return out as unknown as EngineConfig;
}
