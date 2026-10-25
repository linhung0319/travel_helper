// web、worker、引擎共用的型別。資料格式以 schema/ 為準，這裡只列程式用得到的欄位。
// T22 先放空殼：資料點的共同欄位；行程的型別由 T14 補上（CONVENTIONS §3「行程」）。

export const PLACE_TYPES = ['station', 'spot', 'lodging', 'restaurant'] as const;
export type PlaceType = (typeof PLACE_TYPES)[number];

/** 區域 ID。區域不寫死（PLAN T11、T12）：清單在執行時從 data/areas.json 讀，加了新區域不用改程式 */
export type AreaId = string;

/** [經度, 緯度] */
export type LonLat = [number, number];

/** YYYY-MM-DD，日本時間（architecture §3.8） */
export type DateString = string;
/** HH:MM，日本時間；過了午夜可以寫 24:30、25:00 */
export type TimeString = string;

export interface LocalizedName {
  ja: string;
  kana?: string | null;
  zh?: string | null;
  en?: string | null;
}

export interface Source {
  type: string;
  url: string;
  retrieved: DateString;
  note?: string | null;
}

/** 資料點的共同欄位；各類別的其他欄位見 schema/<type>.schema.json */
export interface PlaceBase {
  id: string;
  type: PlaceType;
  name: LocalizedName;
  area?: AreaId;
  coords: LonLat;
  sources: Source[];
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// 行程（T14）：格式見 CONVENTIONS §3「行程」。存進資料庫的只有 Itinerary；
// DayPlan 之後的型別是引擎算出來的結果，不存。

export const ITINERARY_FORMAT = 'itinerary-v1';

/** 一群人的組成：全員或分組的一組。檢查用（步行係數、坐不坐得下、不接小孩的店） */
export interface PartyProfile {
  size: number;
  elders: number;
  kids: number;
}

export type MealKind = 'breakfast' | 'lunch' | 'dinner' | 'snack';
export type LodgingMeals = 'dinner+breakfast' | 'breakfast' | 'none';

/** transit：一定搭大眾運輸（電車、巴士、船），班次由引擎挑。train～other 是舊資料的方式，照樣合法、照樣算 */
export const TRAVEL_MODES = ['walk', 'train', 'bus', 'ferry', 'taxi', 'charter', 'car', 'other', 'transit'] as const;
export type TravelMode = (typeof TRAVEL_MODES)[number];

/** visit 的標籤（第六輪）：用餐、誰去、安排；順序就是存的順序 */
export const TAG_IDS = ['breakfast', 'lunch', 'dinner', 'snack', 'all', 'groups', 'must', 'skippable', 'rainplan', 'rest'] as const;
export type TagId = (typeof TAG_IDS)[number];

/**
 * 選定的班次（電車、巴士、船）。id 是第一程的 tripId，depart 是第一程發車，arrive 是最後一程到達；
 * from／to 是選的時候這段起訖的地點 ID：和現在的起訖點不同（換了順序）時引擎當作沒選
 */
export interface TripRef {
  id: string;
  depart: TimeString;
  arrive: TimeString;
  from: string | null;
  to: string | null;
  /** 每一程的 tripId（依序）；沒有＝只指定第一程（id）。後面那程接不上時引擎改成同一對站接得上的最早一班 */
  rides?: string[] | null;
  /** 近鐵兩程時的轉乘站 ID（引擎寫的）；換班次時照這個站組兩程，不重新推轉乘站。其他是 null 或沒有 */
  via?: string | null;
}

/**
 * 使用者指定的交通（從上一站到這一項）。
 * mode 沒寫：方式自動；minutes 是 null：時間照規則算；trip：選定的班次（mode 沒寫或是大眾運輸時用）。
 * 舊資料的 bufferMinutes 忽略
 */
export interface TravelSpec {
  mode?: TravelMode | null;
  minutes?: number | null;
  trip?: TripRef | null;
  note?: string | null;
}

/** 時段備案的一個選項 */
export interface VisitOption {
  place: string;
  /** null：用資料的 stayMinutes，餐廳沒有時用 §5.5 的料理預設 */
  stayMinutes?: number | null;
  note?: string | null;
}

interface ItemBase {
  /** 行程內唯一（建議的 adopted_item_ids 指到這裡） */
  id: string;
  note?: string | null;
}

/** 去一個點（景點、餐廳、住宿、車站、使用者加的點） */
export interface VisitItem extends ItemBase {
  type: 'visit';
  options: VisitOption[];
  /** 目前用哪個選項（引擎只用這個算） */
  selected: number;
  /** 指定開始時間（訂位、表演、船班）；null：到了就開始（沒開門會等到開門） */
  start?: TimeString | null;
  /** 標籤；省略或 [] ＝沒標。用餐標籤決定這張卡算哪一餐，沒標時餐廳在午餐、晚餐時段內自動算那一餐 */
  tags?: TagId[];
  travel?: TravelSpec | null;
  /** 誰提的（建議的作者，member id） */
  proposedBy?: string[];
  addedBy?: string | null;
}

/** 航班：固定項目 */
export interface FlightItem extends ItemBase {
  type: 'flight';
  direction: 'arrive' | 'depart';
  /** 機場的資料點 ID（車站 kansai-airport） */
  airport: string;
  depart: TimeString;
  arrive: TimeString;
  flightNo?: string | null;
  /** 這班的人數；null：不知道 */
  people?: number | null;
  /** 去機場那段（出發航班用）；null：引擎照規則算 */
  travel?: TravelSpec | null;
}

/** 自由時間、休息；place 是 null 時留在上一站 */
export interface FreeItem extends ItemBase {
  type: 'free';
  minutes: number;
  place?: string | null;
  start?: TimeString | null;
  travel?: TravelSpec | null;
}

export type GroupItem = VisitItem | FreeItem;

export interface SplitGroup extends PartyProfile {
  id: string;
  name: string;
  items: GroupItem[];
}

/** 分組行動：各組從上一站出發，在 meet 會合，之後的項目從會合點接著算 */
export interface SplitItem extends ItemBase {
  type: 'split';
  groups: SplitGroup[];
  meet: { place: string; time: TimeString };
}

export type ItineraryItem = VisitItem | FlightItem | FreeItem | SplitItem;

export interface ItineraryDay {
  date: DateString;
  /** 這晚住哪裡；null：還沒排（最後一天是 null） */
  lodging: string | null;
  /** 這晚的方案；null：照住宿資料的 meals */
  lodgingMeals?: LodgingMeals | null;
  /** 這天從哪裡出發；null：前一晚的住宿 */
  start?: string | null;
  note?: string | null;
  /** 回住宿那段；null：引擎照規則算 */
  returnTravel?: TravelSpec | null;
  items: ItineraryItem[];
}

export interface Itinerary {
  format: typeof ITINERARY_FORMAT;
  /** 最後用掉的項目流水號：刪掉的 ID 不再重用（建議的 adopted_item_ids 才不會指錯） */
  seq?: number;
  party: PartyProfile;
  days: ItineraryDay[];
}

// --- 引擎的輸出 -------------------------------------------------------------

export type WarningLevel = 'error' | 'warning' | 'info';

export interface EngineWarning {
  code: string;
  level: WarningLevel;
  message: string;
  date?: DateString;
  itemId?: string;
  groupId?: string;
  placeId?: string;
}

export interface TransitRide {
  mode: 'train' | 'bus' | 'ferry';
  /** 路線或車種，例如「特急（往賢島）」「伊勢鳥羽線」 */
  line: string;
  from: string;
  to: string;
  depart: TimeString;
  arrive: TimeString;
  /** 近鐵的 trainNo、巴士的 trip id */
  tripId?: string | null;
  fareAdult?: number | null;
  /** 巴士、船、JR 的路線時刻表 id（列同一對站的班次用）；近鐵是 null */
  routeId?: string | null;
}

export interface TaxiInfo {
  /** 一般計程車（4 人）的台數 */
  cars: number;
  /** 改用大型計程車（9 人座）的台數 */
  jumboCars: number;
  /** 每台的起跳價；加算費率沒設定時只有起跳價 */
  fareFromYen: number | null;
  /** 每台的估算費用；加算費率沒設定時是 null */
  fareEstimateYen: number | null;
  note: string;
}

export interface Leg {
  mode: TravelMode | 'none' | 'unknown';
  from: string | null;
  to: string | null;
  /** 從上一站出發的時間 */
  depart: TimeString;
  arrive: TimeString;
  minutes: number;
  /** 這段裡走路的分鐘（含到車站、停留所），算一天累計步行用 */
  walkMinutes: number;
  /** 等車的分鐘（含在 minutes 裡） */
  waitMinutes: number;
  rides: TransitRide[];
  /** 大眾運輸：走到第一個上車點的分鐘（已進位）；不是大眾運輸時沒有 */
  walkBefore?: number;
  /** 大眾運輸：最後下車走到終點的分鐘（已進位）；不是大眾運輸時沒有 */
  walkAfter?: number;
  /** 大眾運輸：每一程「走到上車站／轉乘完」的時間，和 rides 等長（第一程＝出發＋walkBefore，之後＝前一程到站＋minTransfer） */
  ready?: TimeString[];
  /** 這段實際用的班次；不是電車、巴士、船時是 null */
  trip?: TripRef | null;
  /** 同一對上下車點的前一班、後一班（規劃模式的 ‹ ›）；沒有是 null */
  prevTrip?: TripRef | null;
  nextTrip?: TripRef | null;
  /** 出發後（加上走到上車點）時刻表裡還有沒有這兩點之間的班次（不管等多久）；false 時規劃模式的「大眾運輸」灰掉 */
  transitAvailable?: boolean;
  taxi?: TaxiInfo | null;
  /** 使用者用 travel 指定的 */
  specified: boolean;
  /** 怎麼算的，例如「步行 osrm」「估算」 */
  basis: string;
}

export type EntryKind = 'start' | 'visit' | 'flight' | 'free' | 'meet' | 'lodging';

export interface TimelineEntry {
  kind: EntryKind;
  itemId: string | null;
  placeId: string | null;
  /** 到這一項的交通；start 是 null */
  travel: Leg | null;
  arrive: TimeString;
  start: TimeString;
  end: TimeString;
  /** 到了之後等的分鐘（等開門、等指定時間） */
  waitMinutes: number;
  /** 引擎猜的那一餐（內部用：休息、分組用餐的判斷） */
  meal?: MealKind | null;
  /** 使用者標的那幾餐（畫面用），照 TAG_IDS 的順序；沒標是 [] */
  mealTags?: MealKind[];
  /** visit 標了「休息」 */
  rest?: boolean;
  groupId?: string | null;
  /** split 的各組 */
  groups?: { id: string; name: string; entries: TimelineEntry[] }[];
}

export type GapKind = 'lodging' | 'idle';

export interface Gap {
  kind: GapKind;
  date: DateString;
  /** 給 UI 的標籤，例如「住宿（未排）」 */
  label: string;
  from: TimeString | null;
  to: TimeString | null;
  /** 建議插在哪兩個項目之間（null：開頭或結尾） */
  afterItemId: string | null;
  beforeItemId: string | null;
}

export interface DayPlan {
  date: DateString;
  entries: TimelineEntry[];
  gaps: Gap[];
  warnings: EngineWarning[];
  stats: {
    /** 全員步行累計（分鐘，景點內不算） */
    walkMinutes: number;
    mainSpots: number;
    /** 回到住宿的時間；沒有住宿是 null */
    returnTime: TimeString | null;
    /** 累的行程（長階梯、景點內步行 60 分以上、船程） */
    tiring: boolean;
    /** 自由時間（分鐘） */
    freeMinutes: number;
  };
}

export interface ItineraryPlan {
  days: DayPlan[];
  /** 整趟的警告（例如連續兩天都累、沒有半天自由時間） */
  warnings: EngineWarning[];
}
