// 資料點分成清單層和詳情層（T15；architecture §3.3）。純函式：匯入腳本（算好存進 D1）和 dev 的本機資料（web/src/data/local.ts）共用。
//
// 清單層：地圖、清單、篩選、引擎、AI 搜尋、預約清單要的欄位，啟動時讀。
// 詳情層：其他欄位的完整值，閒置時讀。規則只有一條：{ ...清單, ...詳情 } 等於原始資料（只有 extra 例外，見下面的白名單）。
//
// 要讓清單畫面、引擎多讀一個欄位時加在這裡，LAYER_VERSION 加一；重新匯入時內容沒變的點也會重算。
// web/test/placeLayers.test.ts 檢查引擎、篩選、標章、AI 搜尋用清單層和完整資料算出來一樣。

/** 分層規則的版本：改了規則就加一（v4：住宿的 kind、group.totalRooms 進清單層，T66；v5：住宿的 dinnerAccess，篩選的晚餐，T67；v6：priceRange，列的第二行寫價位，T76） */
export const LAYER_VERSION = 6;

/** 整個欄位都放清單層 */
const LIST_WHOLE = [
  'id',
  'type',
  'name',
  'area',
  'region',
  'coords',
  'tier',
  // 住宿的種類：「住」的區段、住法（T66、T75）
  'kind',
  'contexts',
  'tags',
  'cuisine',
  'weather',
  'ratings',
  // 引擎
  'hours',
  'closures',
  'anchors',
  'stayMinutes',
  'nearestStation',
  'meals',
  // 住宿的晚餐：篩選「不含，走路有店／要開車找」（T67）
  'dinnerAccess',
  'checkIn',
  'operator',
  'stationNumber',
  'transfers',
  // AI 搜尋比對名稱
  'googleName',
  'aliases',
  // 預約清單（lib/reservations.ts）
  'reservation',
  'phone',
  // 列的第二行：餐廳的價位第一段、住宿的每人價下限（T76，interaction-design §35.7）
  'priceRange',
] as const;

/** 只放幾個子欄位到清單層；完整的值在詳情層 */
const LIST_PICK: Record<string, readonly string[]> = {
  // maxGuests：住法的包棟一棟、要兩棟（T57、T67）；totalRooms：旅館、飯店 5 間房以上算住得下全團（T66）
  group: ['fit15', 'fitSubgroup', 'confirmed15', 'wholeRental', 'maxGuests', 'totalRooms'],
  kids: ['allowed', 'friendly', 'minAge'],
  accessibility: ['stairs', 'walkInsideMinutes'],
  assessment: ['scores'],
  links: ['official', 'googleMaps'],
};

/**
 * extra 裡給家人和 AI 看的鍵 → 畫面上的名稱（2026-11-01 👤 確認）。
 * 其他鍵（研究用的、座標和來源比對、內部欄位）都在 EXTRA_HIDDEN，不進詳情層，只留在 places_base.data。
 * 新的鍵兩邊都沒有時 npm test 失敗（web/test/placeLayers.test.ts），要決定放哪邊。
 */
export const EXTRA_LABELS: Record<string, string> = {
  // 溫泉、設施
  onsen: '溫泉、大浴場',
  bath: '浴室',
  privateBath: '貸切風呂',
  sauna: '三溫暖',
  kitchen: '廚房',
  towels: '毛巾',
  banquet: '宴會廳',
  bbq: 'BBQ',
  facilities: '設施',
  coinLaundry: '投幣洗衣',
  beach: '海灘',
  fishing: '釣魚',
  activities: '活動',
  // 餐食
  mealsNote: '餐食說明',
  dinner: '晚餐',
  dining: '館內餐廳',
  breakfast: '早餐',
  dinnerLastStart: '晚餐最晚開始',
  dinnerAccessNote: '附近的晚餐',
  dinnerNearby: '附近的晚餐',
  nearbyDinner: '附近的晚餐',
  nonGuestDining: '非住客用餐',
  nonGuestMeals: '非住客用餐',
  nonGuestLunch: '非住客午餐',
  nonGuest: '非住客用餐',
  oysters: '牡蠣',
  allergy: '過敏',
  cafe: '咖啡',
  food: '餐飲',
  restaurantNote: '餐廳',
  // 交通、停車
  parking: '停車',
  stationAccess: '車站交通',
  airportAccess: '機場交通',
  accessNote: '交通',
  luggage: '行李',
  busTransfer: '巴士轉乘',
  meetingPoint: '集合地點',
  returnFerryFromSugashima: '回程船班（菅島）',
  returnFerryFromWagu: '回程船班（和具）',
  returnFerryFromToshi: '回程船班（答志）',
  dayTripPlan: '一日行程範例',
  departures: '出發時間',
  cruiseMinutes: '航程（分鐘）',
  // 住宿規定
  checkIn: '入住',
  checkInNote: '入住',
  checkOutNote: '退房',
  checkInMethod: '入住方式',
  curfew: '門限',
  officialPriceNote: '官網加點價格',
  taxes: '稅',
  cancelPolicy: '取消規定',
  cancel: '取消規定',
  payment: '付款',
  manager: '管理人',
  pets: '寵物',
  earlyVisit: '早朝參拜',
  islandTour: '島內導覽',
  taiwanNote: '台灣旅客注意',
  // 景點內容
  description: '介紹',
  stayNote: '停留時間',
  stayMinutesNote: '停留時間',
  nearby: '附近',
  neighbor: '隔壁',
  schedule: '時間表',
  showTimes: '表演時間',
  islandLoop: '環島',
  fullCourse: '路線',
  islandNote: '島上注意',
  observatories: '展望台',
  highlights: '看點',
  history: '歷史',
  shopsOnRoute: '沿路的店',
  walkIn: '沒有預約時',
  elderNote: '長輩',
  indoorNote: '室內外',
  betsugu: '別宮',
  seawall: '堤防',
  building: '建築',
  maps: '地圖',
  booking: '預約',
  price: '價格',
  takeoutOnly: '以外帶為主',
  seatingNote: '座位',
  note: '備註',
  // 祭典、在地
  setsubunNote: '節分',
  shinondaiko: '神恩太鼓',
  otaue: '御田植式',
  neyako: '寝屋子',
  kusu: '大楠',
  shimenawa: '注連繩',
  goshuin: '御朱印',
  jingu: '神宮',
  sunsetNote: '夕陽',
  vsToba: '和鳥羽水族館比較',
  raftBbqNote: '海上 BBQ',
  elevation: '標高',
};

export const EXTRA_HIDDEN: ReadonlySet<string> = new Set([
  // 研究用
  'conflicts',
  'rakutenVacancy',
  'dossierFacts',
  'addedBy',
  'existence',
  'parkRestaurants',
  // 座標、來源比對
  'coordsNote',
  'osmNote',
  'irukajimaNote',
  'irukajimaCoords',
  'kirigaki',
  'shimonoFactory',
  'googleAlt',
  'googleOther',
  'googleNote',
  'googleMapsNote',
  'googleMapsOld',
  'googleStatus',
  'googleClosed',
  'googleTenkuNoPost',
  'googleDistanceMeters',
  'addressGoogle',
  // 內部欄位、其他
  'kind',
  'lodgingId',
  'tabelogGenre',
  'tabelogOldName',
  'tabelogHours',
  'igHashtag',
  'x',
  'sameAddress',
  'license',
  'registration',
  'movedFrom',
  'formerName',
  'builtYear',
  'fax',
  'phoneNote',
  'operator',
  'ferryTimetable',
]);

type Rec = Record<string, unknown>;
const isObject = (x: unknown): x is Rec => typeof x === 'object' && x !== null && !Array.isArray(x);

/** dinnerAccessNote 裡的工作註記（「OSRM，scripts/…，日期」「T7f（…）」）：給人看的時候去掉，data/ 不動 */
export function cleanDinnerNote(s: string): string {
  return s
    .replace(/（(?:([^（）]*?)；)?(?:OSRM，)?scripts\/[^（）]*）/g, (_, kept: string | undefined) => (kept ? `（${kept}）` : ''))
    .replace(/T\d+[a-z]?（[^（）]*OSRM[^（）]*）/g, '')
    .replace(/，OSRM 吸附[^（）]*/g, '')
    .trim();
}

function visibleExtra(extra: Rec): Rec {
  const out: Rec = {};
  for (const [k, v] of Object.entries(extra)) {
    if (!(k in EXTRA_LABELS) || v === null || v === undefined) continue;
    out[k] = k === 'dinnerAccessNote' && typeof v === 'string' ? cleanDinnerNote(v) : v;
  }
  return out;
}

/** 清單層 */
export function listLayer(r: Rec): Rec {
  const out: Rec = {};
  for (const k of LIST_WHOLE) if (k in r) out[k] = r[k];
  for (const [k, sub] of Object.entries(LIST_PICK)) {
    const v = r[k];
    if (!isObject(v)) continue;
    const picked: Rec = {};
    for (const s of sub) if (s in v) picked[s] = v[s];
    out[k] = picked;
  }
  if (Array.isArray(r.photos)) out.photos = r.photos.filter(isObject).map((p) => ({ url: p.url }));
  return out;
}

/** 詳情層：id，加上沒有整個放進清單層的欄位的完整值 */
export function detailLayer(r: Rec): Rec {
  const list = listLayer(r);
  const out: Rec = { id: r.id };
  for (const [k, v] of Object.entries(r)) {
    if (k === 'extra') {
      if (isObject(v)) {
        const e = visibleExtra(v);
        if (Object.keys(e).length) out.extra = e;
      }
      continue;
    }
    if (k in list && JSON.stringify(list[k]) === JSON.stringify(v)) continue;
    out[k] = v;
  }
  return out;
}
