// 假後端的種子資料（T15m，只在 dev server 用）：幾位家人、一份排了一半的行程、❤️／👎、留言、候選、修改紀錄，
// 畫面一打開就有東西看。資料點 ID 都是 data/ 裡真的點；修改紀錄的 baseValue 是 2026-10-23 的預設值。

import type { Itinerary, ItineraryItem, VisitItem } from '@travel-helper/engine/types';
import type { MockSeed } from '../backend/mock.ts';
import { dayTarget } from '../backend/types.ts';

export const DEV_MEMBERS = [
  { id: 'dev-baba', displayName: '小明爸', pictureUrl: null },
  { id: 'dev-agong', displayName: '阿公', pictureUrl: null },
  { id: 'dev-mama', displayName: '媽媽', pictureUrl: null },
  { id: 'dev-ayi', displayName: '阿姨', pictureUrl: null },
];

const visit = (id: string, places: string | string[], extra: Partial<VisitItem> = {}): VisitItem => ({
  id,
  type: 'visit',
  options: (Array.isArray(places) ? places : [places]).map((place) => ({ place, stayMinutes: null })),
  selected: 0,
  ...extra,
});

const day = (date: string, lodging: string | null, items: ItineraryItem[], note: string | null = null) => ({ date, lodging, lodgingMeals: null, start: null, note, items });

/** 排了一半的行程：有時段備案（2/5 午餐）、分組（2/10）、空檔、沒排的天 */
export function seedItinerary(): Itinerary {
  return {
    format: 'itinerary-v1',
    seq: 30,
    party: { size: 15, elders: 5, kids: 4 },
    days: [
      day('2027-02-02', 'shima-kashikojima-harbor', [
        { id: 'f-1', type: 'flight', direction: 'arrive', airport: 'kansai-airport', depart: '08:20', arrive: '11:55', flightNo: null, people: null, note: '去程第一批' },
        { id: 'f-2', type: 'flight', direction: 'arrive', airport: 'kansai-airport', depart: '09:45', arrive: '13:20', flightNo: null, people: null, note: '去程第二批' },
        // 引擎找不到關西機場到賢島的時刻表，手動指定（data/access/ 的參考時間）
        visit('i-1', 'kashikojima', { travel: { mode: 'train', minutes: 165, note: '南海＋近鐵特急，難波轉乘' } }),
      ]),
      day('2027-02-03', 'shima-kanko-classic', [
        visit('i-2', 'shima-yokoyama-observatory'),
        visit('i-3', 'shima-la-mer', { start: '12:00', meal: 'lunch', note: '已訂位（假的）' }),
      ]),
      day('2027-02-04', 'shima-marusada', [visit('i-4', 'shima-izawanomiya'), visit('i-5', 'shima-daiozaki-lighthouse')]),
      day('2027-02-05', 'toba-kokusai-hotel', [
        // 順序和 T11 的假行程一樣（e2e 用：水族館是第 2 個、漣在這天）
        visit('i-20', 'toba'),
        visit('i-6', 'toba-aquarium'),
        visit('i-7', ['toba-sazanami', 'toba-kazuei'], { meal: 'lunch', note: '漣不能訂位，客滿就去一榮' }),
        visit('i-8', 'toba-mikimoto-pearl-island', { proposedBy: ['dev-mama'] }),
      ]),
      day('2027-02-06', 'toba-osatsu-ohtaya', [
        visit('i-9', 'toba-osatsu-ishigami'),
        visit('i-10', 'toba-hachiman-kamado', { meal: 'lunch', proposedBy: ['dev-baba'] }),
        visit('i-11', 'toba-sea-folk-museum'),
      ]),
      day('2027-02-07', 'futami-oishiya', []),
      day('2027-02-08', 'futami-oishiya', [visit('i-12', 'futami-okitama-jinja'), visit('i-13', 'futami-sea-paradise')]),
      day('2027-02-09', 'ise-momijiken', []),
      day('2027-02-10', 'ise-momijiken', [
        visit('i-14', 'ise-geku'),
        visit('i-15', 'ise-naiku'),
        {
          id: 's-1',
          type: 'split',
          groups: [
            { id: 'g-1', name: '長輩組', size: 7, elders: 5, kids: 0, items: [visit('i-16', 'ise-isuzu-chaya-honten', { options: [{ place: 'ise-isuzu-chaya-honten', stayMinutes: 60 }] })] },
            { id: 'g-2', name: '小孩組', size: 8, elders: 0, kids: 4, items: [visit('i-17', 'ise-akafuku-honten'), visit('i-18', 'ise-tofuan-yamanaka')] },
          ],
          meet: { place: 'ise-oharaimachi', time: '15:00' },
        },
        visit('i-19', 'ise-mukai-sakenomise', { start: '18:00', meal: 'dinner' }),
      ]),
      day('2027-02-11', 'ise-momijiken', []),
      day('2027-02-12', 'kix-nikko', []),
      day('2027-02-13', null, [
        { id: 'f-3', type: 'flight', direction: 'depart', airport: 'kansai-airport', depart: '12:45', arrive: '15:00', flightNo: null, people: null, note: '回程第一批' },
        { id: 'f-4', type: 'flight', direction: 'depart', airport: 'kansai-airport', depart: '12:55', arrive: '15:05', flightNo: null, people: null, note: '回程第二批' },
      ]),
    ],
  };
}

/** 只有航班的行程（dev 選單的「重設：只有航班」） */
export function emptyItinerary(): Itinerary {
  const it = seedItinerary();
  return { ...it, days: it.days.map((d) => ({ ...d, lodging: null, items: d.items.filter((x) => x.type === 'flight') })) };
}

const at = (d: string, t: string) => `2026-${d}T${t}:00.000Z`;

export function devSeed(kind: 'full' | 'flights-only' = 'full'): MockSeed {
  const full = kind === 'full';
  return {
    members: DEV_MEMBERS,
    me: 'dev-baba',
    itinerary: full ? seedItinerary() : emptyItinerary(),
    // ❤️ 就是想去；原本建議的文字變成留言、建議的日期變成那天的候選；「這天想輕鬆一點」變成那天的留言
    votes: full
      ? [
          ...['dev-agong', 'dev-mama', 'dev-ayi', 'dev-baba'].map((m) => ({ placeId: 'toba-aquarium', memberId: m, value: 'like' as const })),
          { placeId: 'toba-mikimoto-pearl-island', memberId: 'dev-mama', value: 'like' },
          { placeId: 'toba-mikimoto-pearl-island', memberId: 'dev-ayi', value: 'like' },
          { placeId: 'ise-naiku', memberId: 'dev-agong', value: 'like' },
          { placeId: 'ise-naiku', memberId: 'dev-mama', value: 'like' },
          { placeId: 'shima-daiozaki-lighthouse', memberId: 'dev-agong', value: 'dislike' },
          { placeId: 'toba-hachiman-kamado', memberId: 'dev-ayi', value: 'like' },
          { placeId: 'toba-hachiman-kamado', memberId: 'dev-baba', value: 'like' },
          { placeId: 'ise-tofuya', memberId: 'dev-agong', value: 'like' },
          { placeId: 'shima-yokoyama-observatory', memberId: 'dev-ayi', value: 'like' },
          { placeId: 'shima-daiozaki-lighthouse', memberId: 'dev-ayi', value: 'like' },
          { placeId: 'toba-bay-cruise-irukajima', memberId: 'dev-mama', value: 'like' },
          { placeId: 'toba-bay-cruise-irukajima', memberId: 'dev-ayi', value: 'like' },
          { placeId: 'toba-bay-cruise-irukajima', memberId: 'dev-baba', value: 'like' },
          { placeId: 'toba-observatory-pearl-road', memberId: 'dev-agong', value: 'like' },
          { placeId: 'toba-yakigai-iroha', memberId: 'dev-baba', value: 'like' },
          { placeId: 'toba-yakigai-iroha', memberId: 'dev-ayi', value: 'like' },
          { placeId: 'toba-osakaya', memberId: 'dev-ayi', value: 'like' },
          { placeId: 'toba-osakaya', memberId: 'dev-mama', value: 'dislike' },
        ]
      : [],
    comments: full
      ? [
          { target: 'toba-aquarium', text: '想看海象表演，早上去人比較少', kind: 'normal', author: 'dev-agong', createdAt: at('10-18', '01:20') },
          { target: 'toba-mikimoto-pearl-island', text: '珍珠島的海女表演一定要看。我膝蓋不好，希望不要爬太多樓梯', kind: 'normal', author: 'dev-mama', createdAt: at('10-18', '02:05') },
          { target: 'toba-hachiman-kamado', text: '海女小屋吃烤海鮮，小孩應該會喜歡', kind: 'normal', author: 'dev-baba', createdAt: at('10-19', '05:00') },
          { target: 'ise-tofuya', text: '內宮附近的豆腐料理，可以訂位，長輩吃得慣', kind: 'normal', author: 'dev-agong', createdAt: at('10-20', '00:40') },
          { target: 'ise-naiku', text: '一定要去參拜', kind: 'normal', author: 'dev-agong', createdAt: at('10-20', '00:45') },
          { target: 'shima-daiozaki-lighthouse', text: '坡太陡，走不上去', kind: 'normal', author: 'dev-agong', createdAt: at('10-20', '01:00') },
          { target: 'toba-bay-cruise-irukajima', text: '小孩想看海豚，船上有廁所嗎？', kind: 'normal', author: 'dev-mama', createdAt: at('10-21', '01:10') },
          { target: 'toba-bay-cruise-irukajima', text: '2 月有班，50 分鐘一圈，長輩可以坐著', kind: 'normal', author: 'dev-baba', createdAt: at('10-21', '03:30') },
          { target: 'toba-osakaya', text: '上次去覺得太貴', kind: 'normal', author: 'dev-mama', createdAt: at('10-21', '04:00') },
          { target: dayTarget('2027-02-07'), text: '這天想輕鬆一點，下午在旅館泡湯', kind: 'normal', author: 'dev-mama', createdAt: at('10-20', '02:15') },
          { target: dayTarget('2027-02-07'), text: '好，這天只排上午，下午留給旅館', kind: 'planner', author: 'dev-baba', createdAt: at('10-20', '13:00') },
          { target: 'toba-osakaya', text: '（2/6 的候選）上次太貴，這次先不去', kind: 'decline', author: 'dev-baba', createdAt: at('10-21', '05:00') },
          { target: 'shima-yokoyama-observatory', text: '展望台要早上去，下午逆光拍不好', kind: 'normal', author: 'dev-ayi', createdAt: at('10-21', '06:45') },
        ]
      : [],
    // 原本建議裡選的日期（已經排進行程的不算）
    candidates: full
      ? [
          { placeId: 'toba-bay-cruise-irukajima', day: '2027-02-05', addedBy: 'dev-mama', createdAt: at('10-21', '01:10') },
          { placeId: 'toba-osakaya', day: '2027-02-05', addedBy: 'dev-ayi', createdAt: at('10-21', '03:00') },
          { placeId: 'toba-observatory-pearl-road', day: '2027-02-06', addedBy: 'dev-agong', createdAt: at('10-20', '00:30') },
          { placeId: 'toba-yakigai-iroha', day: '2027-02-06', addedBy: 'dev-baba', createdAt: at('10-20', '00:35') },
          { placeId: 'ise-tofuya', day: '2027-02-10', addedBy: 'dev-agong', createdAt: at('10-20', '00:40') },
          { placeId: 'shima-yokoyama-observatory', day: '2027-02-03', addedBy: 'dev-ayi', createdAt: at('10-21', '06:45') },
        ]
      : [],
    edits: full
      ? [
          {
            placeId: 'toba-kazuei',
            fieldPath: 'group.fit15',
            value: 'yes',
            baseValue: 'split',
            baseMissing: false,
            note: '打電話問過，2 樓座敷可以 15 人一起坐',
            author: 'dev-baba',
            createdAt: at('10-21', '09:00'),
          },
          {
            placeId: 'toba-sazanami',
            fieldPath: 'closedNote',
            value: '週二、週三公休（2027 年 2 月起）',
            baseValue: '週二公休（逢國定假日營業，另擇日補休）',
            baseMissing: false,
            note: '店家 IG 公告',
            author: 'dev-mama',
            createdAt: at('10-22', '02:30'),
          },
        ]
      : [],
  };
}
