// 工具清單（規格 §4）：查資料、改畫面、提議改動三類。工具不分平台，平台差異都在 stage.ts。
// run 回傳工具結果；要呈現的東西放進 present（一輪回覆結束才生效，使用者動過畫面就不搶，見 chat.ts）；要使用者按的卡片 card.status 是 pending。

import { TRAVEL_MODES, TAG_IDS, type LonLat, type TravelMode } from '@travel-helper/engine/types';
import { ItineraryError } from '@travel-helper/engine';
import type { VoteValue } from '../backend/types.ts';
import type { FocusTarget } from '../commands.ts';
import { extractMapLink, isShortMapLink, parseMapLink } from '../lib/addPlace/mapLink.ts';
import type { UserPlaceType } from '../backend/types.ts';
import { tripDates } from '../lib/trip.ts';
import { applyOps, type Op } from './ops.ts';
import { createReadTools, PLACE_SECTIONS, type ToolOutput } from './readTools.ts';
import { opsContext, placeName, type AiDeps } from './deps.ts';
import type { AddPlaceInit, ScreenTarget, ShowPlaces, ShowRoute } from './stage.ts';
import type { CardState, ToolSchema } from './types.ts';
import { fullPlace } from '../dataStore.ts';

/** 一輪回覆結束時要呈現的東西：「再看一次」用相同的參數再跑一次 */
export type Presentation =
  | { kind: 'places'; input: ShowPlaces }
  | { kind: 'route'; input: ShowRoute }
  | { kind: 'day'; day: string }
  | { kind: 'place'; id: string }
  | { kind: 'map'; target: FocusTarget }
  | { kind: 'filter'; patch: Record<string, string[]>; clear: boolean }
  | { kind: 'add-place'; init: AddPlaceInit }
  | { kind: 'clear' }
  | { kind: 'screen'; target: ScreenTarget }
  | { kind: 'proposal'; ops: Op[]; summary: string };

export interface ToolRun {
  output: ToolOutput;
  /** 這個工具要呈現什麼 */
  present?: Presentation;
  /** 呈現的是別張卡（show_again）：卡片狀態記在那張 */
  presentFor?: string;
  /** 工具呼叫的卡片一開始的狀態 */
  card?: CardState;
}

export interface ToolDef extends ToolSchema {
  kind: 'read' | 'stage' | 'propose' | 'ui';
  run(input: Record<string, unknown>): ToolRun | Promise<ToolRun>;
}

const obj = (properties: Record<string, unknown>, required: string[] = []) => ({ type: 'object', properties, required, additionalProperties: false });
const str = (description?: string) => ({ type: 'string', ...(description ? { description } : {}) });
const strs = (description?: string) => ({ type: 'array', items: { type: 'string' }, ...(description ? { description } : {}) });
const num = (description?: string) => ({ type: 'number', ...(description ? { description } : {}) });
const bool = (description?: string) => ({ type: 'boolean', ...(description ? { description } : {}) });
const place = { description: '資料點 ID 或 [經度, 緯度]' };
const DATE = '日期 YYYY-MM-DD（2027-02-02～2027-02-13）';
const OP = {
  type: 'object',
  description: `行程的一個操作。op：add（date、place，可給 index、start、stayMinutes、tags、note）、remove（itemId）、move（itemId、date、index）、replace（itemId、place）、addOption（itemId、place）、selectOption（itemId、place：切換主選）、removeOption（itemId、place：拿掉一個備選）、setStay（itemId、minutes）、setStart（itemId、start）、setTags（itemId、tags）、setNote（itemId、note）、addFree（date、minutes，可給 index、note：自由時間）、withdraw（itemId：撤下，地點回那天的候選）、setTravel（to、spec）、setLodging（date、lodging、meals）。itemId 從 get_day 來，標 draftOnly 的不能用；tags 可用 ${TAG_IDS.join('、')}`,
  properties: { op: str() },
  required: ['op'],
};

const RESERVATION_STATUSES = ['pending', 'booked', 'skip'];
const SCREEN_TABS = ['explore', 'wish', 'trip'];
const SCREEN_PANELS = ['comments', 'reservations', 'snapshots'];

const fail = (error: string): ToolRun => ({ output: { ok: false, error } });

export function createTools(d: AiDeps): ToolDef[] {
  const read = createReadTools(d);
  const byId = () => d.data.getState().byId;
  const ro = (fn: (input: never) => ToolOutput | Promise<ToolOutput>) => async (input: Record<string, unknown>): Promise<ToolRun> => ({ output: await fn(input as never) });
  const hasDay = (date: unknown) => typeof date === 'string' && tripDates().includes(date);

  return [
    // --- 查資料 ---
    {
      name: 'search_places',
      kind: 'read',
      description: '找地點。名稱可以有錯字、中日文混雜。回傳精簡清單和總數；unknownExcluded 是因為資料沒查到而沒列出的筆數，要照實告訴使用者。要細節再用 get_place。',
      input_schema: obj({
        text: str('名稱（中文、日文、別名）'),
        types: strs('spot、restaurant、lodging、station'),
        areas: strs('區域 ID'),
        regions: strs('子地區 ID'),
        cuisine: strs('料理類型，例如 牡蠣、壽司'),
        near: obj({ place: str('資料點 ID'), coords: { type: 'array', items: num() }, walkMinutes: num('全員步行最多幾分') }),
        inView: bool('只找目前地圖畫面裡的'),
        openAt: obj({ date: str(DATE), time: str('HH:MM') }, ['date', 'time']),
        fit15: strs('yes（能坐 15 人）、split（要分桌）、no、unknown'),
        fitSubgroup: bool('4～6 人分組坐得下'),
        elderly: bool('適合長輩'),
        kids: bool('適合小孩'),
        reservable: bool('可以預約'),
        votes: strs('popular（大家想去的）、mine（我按想去的）'),
        sort: str('recommend、rating、likes、distance'),
        limit: num('最多幾筆（預設 10，上限 30）'),
      }),
      run: ro(read.search_places),
    },
    {
      name: 'get_place',
      kind: 'read',
      description: `地點的細節。只回要的分區（${PLACE_SECTIONS.join('、')}）。值是 null 表示資料沒寫，要回答「不知道」，不可以說成沒有。一次最多 6 個點。`,
      input_schema: obj({ ids: strs('資料點 ID'), sections: strs('要哪些分區') }, ['ids']),
      run: ro(read.get_place),
    },
    { name: 'get_day', kind: 'read', description: '引擎算好的一天：每項時間、交通、空檔、警告、候選。回答時間問題一定要用這裡的數字，不要自己算。on=draft 看的是目前提議後的行程（接著改提議時用）。', input_schema: obj({ date: str(DATE), on: { enum: ['draft'] } }, ['date']), run: ro(read.get_day) },
    { name: 'get_trip_overview', kind: 'read', description: '整趟的摘要：每天去哪、住哪、警告數、候選數。', input_schema: obj({}), run: ro(read.get_trip_overview) },
    {
      name: 'check_changes',
      kind: 'read',
      description: '試算行程的改動：回傳差異和新出現、消失的警告，畫面不動。提議前先用它試。',
      input_schema: obj({ ops: { type: 'array', items: OP } }, ['ops']),
      run: async (input) => ({ output: read.check_changes(input as never) }),
    },
    { name: 'suggest_position', kind: 'read', description: '一個點排進某天最順路的位置（index）和排進後的警告。on=draft 算的是目前提議後的行程（接著改提議時用）。', input_schema: obj({ placeId: str(), date: str(DATE), on: { enum: ['draft'] } }, ['placeId', 'date']), run: ro(read.suggest_position) },
    {
      name: 'get_route',
      kind: 'read',
      description: '兩點之間怎麼走：方式、分鐘、班次、轉乘、錯過的話、Google Maps 連結。分鐘已照全員的步行速度算。回答時附上連結，實際班次請使用者在 app 確認。',
      input_schema: obj({ from: place, to: place, mode: str(`可省略（自動）；${TRAVEL_MODES.join('、')}`), date: str(DATE), time: str('出發時間 HH:MM') }, ['from', 'to']),
      run: ro(read.get_route),
    },
    {
      name: 'get_timetable',
      kind: 'read',
      description: '時刻表。station：近鐵、JR 車站的資料點 ID；route：巴士、船的路線 ID 或名稱。',
      input_schema: obj({ station: str(), route: str(), date: str(DATE), after: str('從幾點開始 HH:MM') }, ['date']),
      run: ro(read.get_timetable),
    },
    {
      name: 'get_opinions',
      kind: 'read',
      description: '家人的意見：誰想去、誰不喜歡、候選在哪天、留言。給 placeId 或 date；都不給是整趟想去清單的摘要。提議前要先看，有人不喜歡要講。',
      input_schema: obj({ placeId: str(), date: str(DATE) }),
      run: ro(read.get_opinions),
    },
    { name: 'get_trip_info', kind: 'read', description: '旅程的參考資料。topic：passes（近鐵票券）、airport（關西機場交通）、party（人數）。', input_schema: obj({ topic: str() }, ['topic']), run: ro(read.get_trip_info) },
    { name: 'get_reservations', kind: 'read', description: '要預約的項目（同預約清單）：哪天、哪個點、狀態（pending 未訂、booked 已訂、skip 不用訂）、備註。住宿的 date 是入住那晚。', input_schema: obj({ date: str(DATE), status: { enum: RESERVATION_STATUSES } }), run: ro(read.get_reservations) },

    // --- 改畫面 ---
    {
      name: 'show_places',
      kind: 'stage',
      description: '給使用者看挑過的一組點：地圖標出來，清單只列這幾個，每個點可以附一行理由。比較時 lettered=true，地圖標 A、B、C，文字用 A、B、C 對應。畫面上永遠只有一組，每次給完整的一組：使用者要多找幾家、拿掉某家，就把調整後的整組和理由再給一次（現在的在 context.screen.aiResult）；問別的事才給全新的一組。',
      input_schema: obj({ ids: strs(), title: str('使用者看得懂的標題'), notes: { type: 'object', additionalProperties: { type: 'string' }, description: '資料點 ID → 一行理由' }, lettered: bool() }, ['ids', 'title']),
      run(input) {
        const i = input as unknown as ShowPlaces;
        if (!Array.isArray(i.ids) || !i.ids.length) return fail('ids 要是資料點 ID 的陣列');
        if (typeof i.title !== 'string' || !i.title.trim()) return fail('要有 title');
        const ids = i.ids.filter((id) => byId().has(id));
        const unknown = i.ids.filter((id) => !byId().has(id));
        if (!ids.length) return fail(`找不到資料點 ${unknown.join('、')}`);
        return { output: { ok: true, ids, ...(unknown.length ? { unknown } : {}) }, present: { kind: 'places', input: { ...i, ids } }, card: {} };
      },
    },
    {
      name: 'show_route',
      kind: 'stage',
      description: '在地圖上畫一條路線。分鐘用 get_route 查到的。',
      input_schema: obj({ from: place, to: place, mode: str(TRAVEL_MODES.join('、')), minutes: num(), label: str() }, ['from', 'to', 'mode']),
      run(input) {
        const i = input as unknown as ShowRoute;
        if (!TRAVEL_MODES.includes(i.mode as TravelMode)) return fail(`mode 要是 ${TRAVEL_MODES.join('、')}`);
        for (const e of [i.from, i.to]) {
          if (typeof e === 'string' ? !byId().has(e) : !(Array.isArray(e) && e.length === 2)) return fail(`找不到 ${JSON.stringify(e)}`);
        }
        return { output: { ok: true }, present: { kind: 'route', input: i }, card: {} };
      },
    },
    {
      name: 'show_day',
      kind: 'stage',
      description: '切到某一天（或 all＝整趟），地圖框住那天。',
      input_schema: obj({ date: str(`${DATE} 或 all`) }, ['date']),
      run(input) {
        const day = input.date as string;
        if (day !== 'all' && !hasDay(day)) return fail(`date 要是 all 或 ${tripDates()[0]}～${tripDates().at(-1)}`);
        return { output: { ok: true }, present: { kind: 'day', day }, card: {} };
      },
    },
    {
      name: 'open_place',
      kind: 'stage',
      description: '打開一個點的詳情。',
      input_schema: obj({ id: str() }, ['id']),
      run(input) {
        const id = input.id as string;
        if (!byId().has(id)) return fail(`找不到資料點 ${id}`);
        return { output: { ok: true }, present: { kind: 'place', id }, card: {} };
      },
    },
    {
      name: 'move_map',
      kind: 'stage',
      description: '移動地圖。給其中一種：ids、area、region、bbox、center（可加 zoom）。',
      input_schema: obj({ ids: strs(), area: str(), region: str(), bbox: { type: 'array', items: num() }, center: { type: 'array', items: num() }, zoom: num() }),
      run(input) {
        const i = input as { ids?: string[]; area?: string; region?: string; bbox?: [number, number, number, number]; center?: LonLat; zoom?: number };
        const { areas } = d.data.getState();
        let target: FocusTarget | null = null;
        if (i.ids?.length) {
          if (!i.ids.some((id) => byId().has(id))) return fail(`找不到資料點 ${i.ids.join('、')}`);
          target = i.ids;
        } else if (i.area) {
          if (!areas.some((a) => a.id === i.area)) return fail(`沒有區域 ${i.area}（可用：${areas.map((a) => a.id).join('、')}）`);
          target = { area: i.area };
        } else if (i.region) {
          if (!areas.some((a) => a.regions?.some((r) => r.id === i.region))) return fail(`沒有子地區 ${i.region}`);
          target = { region: i.region };
        } else if (i.bbox) target = { bbox: i.bbox };
        else if (i.center) target = { center: i.center, ...(i.zoom != null ? { zoom: i.zoom } : {}) };
        if (!target) return fail('要給 ids、area、region、bbox 或 center');
        return { output: { ok: true }, present: { kind: 'map', target }, card: {} };
      },
    },
    {
      name: 'set_filter',
      kind: 'stage',
      description: '套用探索的篩選（使用者看得到、可以自己取消）。給的那幾項整個取代；clear=true 先全部清掉。項目：areas、regions、types、contexts、tiers、fit15、votes。條件表達不出來時改用 show_places。',
      input_schema: obj({ areas: strs(), regions: strs(), types: strs(), contexts: strs(), tiers: strs(), fit15: strs(), votes: strs(), clear: bool() }),
      run(input) {
        const { clear, ...patch } = input as Record<string, string[]> & { clear?: boolean };
        const err = d.commands.checkFilter(patch as never);
        if (err) return fail(err);
        return { output: { ok: true }, present: { kind: 'filter', patch, clear: !!clear }, card: {} };
      },
    },
    { name: 'clear_view', kind: 'stage', description: '清掉畫面上 AI 的結果集、路線。', input_schema: obj({}), run: () => ({ output: { ok: true }, present: { kind: 'clear' }, card: {} }) },
    {
      name: 'show_screen',
      kind: 'stage',
      description: '切分頁（tab：explore 探索、wish 想去、trip 行程）或打開面板（panel：comments 討論、reservations 預約、snapshots 快照）。給其中一個。還原快照要使用者自己在快照視窗按。',
      input_schema: obj({ tab: { enum: SCREEN_TABS }, panel: { enum: SCREEN_PANELS } }),
      run(input) {
        const { tab, panel } = input as { tab?: string; panel?: string };
        if (!!tab === !!panel) return fail('tab、panel 要給其中一個');
        if (tab && !SCREEN_TABS.includes(tab)) return fail(`tab 要是 ${SCREEN_TABS.join('、')}`);
        if (panel && !SCREEN_PANELS.includes(panel)) return fail(`panel 要是 ${SCREEN_PANELS.join('、')}`);
        return { output: { ok: true }, present: { kind: 'screen', target: (tab ? { tab } : { panel }) as ScreenTarget }, card: {} };
      },
    },
    {
      name: 'suggest_replies',
      kind: 'ui',
      description: '在回覆下面放 2～4 個快速選項（少打字），點了當成使用者的訊息送出。先問一個問題、給幾個選項，不要一次問一長串。',
      input_schema: obj({ replies: strs() }, ['replies']),
      run: () => ({ output: { ok: true } }),
    },

    // --- 提議改動：使用者決定了才寫（按，或明確用說的，見 decide_card） ---
    {
      name: 'propose_changes',
      kind: 'propose',
      description: '提議改行程：地圖畫虛線、時間軸顯示差異、聊天室有提議卡。**這還沒有寫進行程**，使用者決定採用才寫（不在編輯中也可以提議）。每次都給**從確定的行程算起的完整操作清單**，取代上一版，不是疊加：接著改時，照 context.draft.ops 調整後整份再給一次。用 check_changes 試過再提議，summary 寫「2/4：＋某某午餐」這種摘要。',
      input_schema: obj({ ops: { type: 'array', items: OP }, summary: str() }, ['ops', 'summary']),
      run(input) {
        const ops = input.ops as Op[];
        const it = d.data.getState().itinerary;
        if (!it) return fail('還沒有行程');
        try {
          applyOps(it, ops, opsContext(d));
        } catch (e) {
          if (e instanceof ItineraryError) return fail(e.message);
          throw e;
        }
        return { output: { ok: true, status: '已顯示提議，等使用者決定' }, present: { kind: 'proposal', ops, summary: String(input.summary ?? '') }, card: { status: 'pending' } };
      },
    },
    {
      name: 'draft_comment',
      kind: 'propose',
      description: '幫使用者寫留言的草稿：使用者可以改字，按「送出」才用使用者的名字發出。聊天紀錄只有自己看得到，所以理由要寫進留言（例如「媽媽膝蓋不好，希望不要爬樓梯」）。target：資料點 ID、day:<日期>、trip（整趟）。',
      input_schema: obj({ target: str(), text: str() }, ['target', 'text']),
      run(input) {
        const target = input.target as string;
        const ok = target === 'trip' || (target?.startsWith('day:') && hasDay(target.slice(4))) || byId().has(target);
        if (!ok) return fail(`target 要是資料點 ID、day:<日期> 或 trip：${target}`);
        if (typeof input.text !== 'string' || !input.text.trim()) return fail('text 不能是空的');
        return { output: { ok: true, status: '已顯示草稿，等使用者送出' }, card: { status: 'pending' } };
      },
    },
    {
      name: 'add_candidate',
      kind: 'propose',
      description: '把一個或多個點加到某天的候選（大家看得到）：同一張卡，使用者決定了才一起加。',
      input_schema: obj({ placeIds: strs(), date: str(DATE) }, ['placeIds', 'date']),
      run(input) {
        const ids = input.placeIds as string[];
        if (!Array.isArray(ids) || !ids.length) return fail('placeIds 要是資料點 ID 的陣列');
        const unknown = ids.filter((id) => !byId().has(id));
        if (unknown.length) return fail(`找不到資料點 ${unknown.join('、')}`);
        if (!hasDay(input.date)) return fail(`date 要是 ${tripDates()[0]}～${tripDates().at(-1)}`);
        return { output: { ok: true, status: '已顯示卡片，等使用者決定' }, card: { status: 'pending' } };
      },
    },
    {
      name: 'remove_candidate',
      kind: 'propose',
      description: '把一個點從某天的候選拿掉：使用者決定了才拿。別人加的一定要給 reason，會變成那個點的一則不採用留言。',
      input_schema: obj({ placeId: str(), date: str(DATE), reason: str() }, ['placeId', 'date']),
      run(input) {
        const s = d.shared.store.getState();
        const c = s.candidates.find((x) => x.placeId === input.placeId && x.day === input.date);
        if (!c) return fail('那天的候選沒有這個點');
        if (c.addedBy !== s.me?.id && !String(input.reason ?? '').trim()) return fail('這是別人加的候選，要請使用者說理由');
        return { output: { ok: true, status: '已顯示卡片，等使用者決定' }, card: { status: 'pending' } };
      },
    },
    {
      name: 'move_candidate',
      kind: 'propose',
      description: '把使用者自己加的候選移到別天：使用者決定了才移。別人加的不能移。',
      input_schema: obj({ placeId: str(), date: str(DATE), to: str(DATE) }, ['placeId', 'date', 'to']),
      run(input) {
        const s = d.shared.store.getState();
        const c = s.candidates.find((x) => x.placeId === input.placeId && x.day === input.date);
        if (!c) return fail('那天的候選沒有這個點');
        if (c.addedBy !== s.me?.id) return fail('別人加的候選不能移');
        if (!hasDay(input.to) || input.to === input.date) return fail('to 要是旅程裡的另一天');
        return { output: { ok: true, status: '已顯示卡片，等使用者決定' }, card: { status: 'pending' } };
      },
    },
    {
      name: 'set_reservation',
      kind: 'propose',
      description: '更新預約清單的一項（大家看得到）：status 是 pending 未訂、booked 已訂、skip 不用訂；使用者決定了才改。date、placeId 照 get_reservations。note 沒給就留原本的。',
      input_schema: obj({ date: str(DATE), placeId: str(), status: { enum: RESERVATION_STATUSES }, note: str() }, ['date', 'placeId', 'status']),
      run(input) {
        if (!RESERVATION_STATUSES.includes(input.status as string)) return fail(`status 要是 ${RESERVATION_STATUSES.join('、')}`);
        if (!read.reservationRows().some((r) => r.date === input.date && r.placeId === input.placeId)) return fail('預約清單沒有這一項：先用 get_reservations 查（住宿的 date 是入住那晚）');
        return { output: { ok: true, status: '已顯示卡片，等使用者決定' }, card: { status: 'pending' } };
      },
    },
    {
      name: 'propose_place_edit',
      kind: 'propose',
      description: '提議修改資料點的欄位（例如「這家週三公休」）：卡片顯示舊值和新值，使用者按「確認」才生效，有紀錄、可以復原。note 寫資料從哪裡來。fieldPath 例如 closedNote、hours、group.maxReservation。',
      input_schema: obj({ placeId: str(), fieldPath: str(), value: {}, note: str() }, ['placeId', 'fieldPath', 'value']),
      async run(input) {
        if (!byId().get(input.placeId as string)) return fail(`找不到資料點 ${input.placeId}`);
        if (typeof input.fieldPath !== 'string' || !input.fieldPath || input.fieldPath === 'id') return fail('fieldPath 不對');
        // 舊值可能在詳情層：讀不到就不提議（不能把「還沒讀到」當成原本是空的）
        try {
          await d.details?.();
        } catch {
          return fail('詳細資料暫時讀不到（網路問題），請使用者稍後再試');
        }
        const p = fullPlace(d.data.getState(), input.placeId as string)!;
        const before = input.fieldPath.split('.').reduce<unknown>((x, k) => (x && typeof x === 'object' ? (x as Record<string, unknown>)[k] : undefined), p.raw);
        return { output: { ok: true, status: '已顯示卡片，等使用者確認', before: before ?? null }, card: { status: 'pending' } };
      },
    },
    {
      name: 'propose_user_place',
      kind: 'propose',
      description: '使用者想加一個我們沒有的地點：打開確認畫面，使用者按了才存。給 link（Google Maps 連結）或 coords；name、type（spot、restaurant、lodging）、note 可省略。不要自己猜位置。',
      input_schema: obj({ link: str(), name: str(), coords: { type: 'array', items: num() }, type: str(), note: str() }),
      run(input) {
        const url = typeof input.link === 'string' ? extractMapLink(input.link) : null;
        if (url && isShortMapLink(url)) return fail('這種短網址要連上伺服器才能讀；請使用者貼完整網址，或在地圖上指位置');
        const parsed = url ? parseMapLink(url) : null;
        const coords = (input.coords as LonLat | undefined) ?? parsed?.coords ?? null;
        if (!coords) return fail('連結裡讀不到位置：請使用者貼完整網址，或在地圖上指位置');
        const name = (input.name as string | undefined) ?? parsed?.name ?? '';
        const type = input.type as UserPlaceType | undefined;
        return {
          output: { ok: true, status: '已打開確認畫面', name, coords },
          present: { kind: 'add-place', init: { via: 'ai', coords, name, ...(type ? { type } : {}), note: (input.note as string | undefined) ?? '', link: url } },
          card: {},
        };
      },
    },
    {
      name: 'vote',
      kind: 'propose',
      description: '幫使用者按想去（like）或不喜歡（dislike），一次可以多個點；null 是收回。只影響自己，所以直接做，訊息裡有一顆「復原」還原這些點。',
      input_schema: obj({ placeIds: strs(), value: { enum: ['like', 'dislike', null] } }, ['placeIds', 'value']),
      async run(input) {
        const ids = input.placeIds as string[];
        if (!Array.isArray(ids) || !ids.length) return fail('placeIds 要是資料點 ID 的陣列');
        const unknown = ids.filter((id) => !byId().has(id));
        if (unknown.length) return fail(`找不到資料點 ${unknown.join('、')}`);
        const s = d.shared.store.getState();
        const value = input.value as VoteValue | null;
        const previous: NonNullable<CardState['previous']> = {};
        for (const id of ids) {
          const before = s.votes.find((v) => v.placeId === id && v.memberId === s.me?.id)?.value ?? null;
          const r = await d.shared.vote(id, value);
          if (!r.ok) {
            // 前面按好的退回去：不留下做一半的結果
            for (const [done, v] of Object.entries(previous)) await d.shared.vote(done, v);
            return fail(r.error);
          }
          previous[id] = before;
        }
        return { output: { ok: true, names: ids.map((id) => placeName(byId().get(id), id)), value }, card: { status: 'confirmed', previous } };
      },
    },
  ];
}
