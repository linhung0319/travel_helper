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
import type { AddPlaceInit, ShowPlaces, ShowRoute } from './stage.ts';
import type { CardState, ToolSchema } from './types.ts';

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
  | { kind: 'proposal'; ops: Op[]; summary: string };

export interface ToolRun {
  output: ToolOutput;
  /** 這個工具要呈現什麼 */
  present?: Presentation;
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
  description: `行程的一個操作。op：add（date、place，可給 index、start、stayMinutes、tags、note）、remove（itemId）、move（itemId、date、index）、replace（itemId、place）、addOption（itemId、place）、setStay（itemId、minutes）、setStart（itemId、start）、setTags（itemId、tags）、setTravel（to、spec）、setLodging（date、lodging、meals）。itemId 從 get_day 來；tags 可用 ${TAG_IDS.join('、')}`,
  properties: { op: str() },
  required: ['op'],
};

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
    { name: 'get_day', kind: 'read', description: '引擎算好的一天：每項時間、交通、空檔、警告、候選。回答時間問題一定要用這裡的數字，不要自己算。', input_schema: obj({ date: str(DATE) }, ['date']), run: ro(read.get_day) },
    { name: 'get_trip_overview', kind: 'read', description: '整趟的摘要：每天去哪、住哪、警告數、候選數。', input_schema: obj({}), run: ro(read.get_trip_overview) },
    {
      name: 'check_changes',
      kind: 'read',
      description: '試算行程的改動：回傳差異和新出現、消失的警告，畫面不動。提議前先用它試。',
      input_schema: obj({ ops: { type: 'array', items: OP } }, ['ops']),
      run: ro(read.check_changes),
    },
    { name: 'suggest_position', kind: 'read', description: '一個點排進某天最順路的位置（index）和排進後的警告。', input_schema: obj({ placeId: str(), date: str(DATE) }, ['placeId', 'date']), run: ro(read.suggest_position) },
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

    // --- 改畫面 ---
    {
      name: 'show_places',
      kind: 'stage',
      description: '給使用者看挑過的一組點：地圖標出來，清單只列這幾個，每個點可以附一行理由。比較時 lettered=true，地圖標 A、B、C，文字用 A、B、C 對應。',
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
      name: 'suggest_replies',
      kind: 'ui',
      description: '在回覆下面放 2～4 個快速選項（少打字），點了當成使用者的訊息送出。先問一個問題、給幾個選項，不要一次問一長串。',
      input_schema: obj({ replies: strs() }, ['replies']),
      run: () => ({ output: { ok: true } }),
    },

    // --- 提議改動：使用者按了才寫 ---
    {
      name: 'propose_changes',
      kind: 'propose',
      description: '提議改行程：地圖畫虛線、時間軸顯示差異、聊天室有提議卡。**這還沒有寫進行程**，使用者按「採用」才寫（不在編輯中也可以提議）。用 check_changes 試過再提議，summary 寫「2/4：＋某某午餐」這種摘要。',
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
      description: '把一個點加到某天的候選（大家看得到）：使用者按「加入」才加。',
      input_schema: obj({ placeId: str(), date: str(DATE) }, ['placeId', 'date']),
      run(input) {
        if (!byId().has(input.placeId as string)) return fail(`找不到資料點 ${input.placeId}`);
        if (!hasDay(input.date)) return fail(`date 要是 ${tripDates()[0]}～${tripDates().at(-1)}`);
        return { output: { ok: true, status: '已顯示卡片，等使用者按加入' }, card: { status: 'pending' } };
      },
    },
    {
      name: 'propose_place_edit',
      kind: 'propose',
      description: '提議修改資料點的欄位（例如「這家週三公休」）：卡片顯示舊值和新值，使用者按「確認」才生效，有紀錄、可以復原。note 寫資料從哪裡來。fieldPath 例如 closedNote、hours、group.maxReservation。',
      input_schema: obj({ placeId: str(), fieldPath: str(), value: {}, note: str() }, ['placeId', 'fieldPath', 'value']),
      run(input) {
        const p = byId().get(input.placeId as string);
        if (!p) return fail(`找不到資料點 ${input.placeId}`);
        if (typeof input.fieldPath !== 'string' || !input.fieldPath || input.fieldPath === 'id') return fail('fieldPath 不對');
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
      description: '幫使用者按想去（like）或不喜歡（dislike）；null 是收回。只影響自己，所以直接做，訊息裡有「復原」。',
      input_schema: obj({ placeId: str(), value: { enum: ['like', 'dislike', null] } }, ['placeId', 'value']),
      async run(input) {
        const id = input.placeId as string;
        const p = byId().get(id);
        if (!p) return fail(`找不到資料點 ${id}`);
        const s = d.shared.store.getState();
        const previous = s.votes.find((v) => v.placeId === id && v.memberId === s.me?.id)?.value ?? null;
        const value = input.value as VoteValue | null;
        const r = await d.shared.vote(id, value);
        if (!r.ok) return fail(r.error);
        return { output: { ok: true, name: placeName(p), value }, card: { status: 'confirmed', previous } };
      },
    },
  ];
}
