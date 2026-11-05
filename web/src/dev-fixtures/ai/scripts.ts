// 假 AI 的對話腳本（規格 §8）：用關鍵字對應。工具呼叫是真的，回覆從工具結果組，資料變了也不會變成謊話。
// 每個腳本是幾步：每一步看前面的工具結果，回文字和要呼叫的工具；沒有工具就結束這輪。

import type { TurnContext } from '../../ai/types.ts';

export interface ScriptTool {
  name: string;
  input: Record<string, unknown>;
}

export interface StepOut {
  text?: string;
  tools?: ScriptTool[];
}

/* eslint-disable @typescript-eslint/no-explicit-any -- 工具結果是 JSON，腳本只是假資料 */
export interface ScriptEnv {
  text: string;
  context: TurnContext;
  /** 這輪到目前為止，每個工具最後一次的結果 */
  results: Record<string, any>;
}

export interface Script {
  id: string;
  /** 對不到腳本時列出的句子 */
  sample?: string;
  match(env: ScriptEnv): boolean;
  steps: ((env: ScriptEnv) => StepOut)[];
}

const tag = (id: string) => `[[place:${id}]]`;
const tool = (name: string, input: Record<string, unknown> = {}): ScriptTool => ({ name, input });
const replies = (...list: string[]) => tool('suggest_replies', { replies: list });
const chipPlaces = (e: ScriptEnv): string[] => e.context.chips.flatMap((c) => (c.kind === 'place' ? [c.id as string] : []));
const dayChip = (e: ScriptEnv): string | null => (e.context.chips.find((c) => c.kind === 'day')?.date as string | undefined) ?? null;
const listChip = (e: ScriptEnv) => e.context.chips.find((c) => c.kind === 'list') as (Record<string, any> | undefined);

/** 15 人的說法：從資料組，未查就說未查 */
function fit15Sentence(p: any): string {
  const g = p.group;
  const v = g?.fit15;
  const facts = [g?.seats != null ? `有 ${g.seats} 席` : null, g?.buyout ? `包場：${g.buyout}` : null, g?.note ?? null].filter(Boolean).join('；');
  const sub = g?.fitSubgroup === 'yes' ? '分成 4～6 人可以。' : '';
  const name = tag(p.id);
  if (v === 'yes') return `${name} 15 人坐得下${facts ? `（${facts}）` : ''}。${sub}`;
  if (v === 'split') return `${name} 全部坐一起不行、要分桌${facts ? `（${facts}）` : ''}。${sub}`;
  if (v === 'no') return `${name} 坐不下 15 人${facts ? `（${facts}）` : ''}。${sub}`;
  return `${name} 能不能坐 15 人，我們的資料沒有查到，不能說可以或不行，建議打電話問。${sub}`;
}

/** 提議裡有這個點的 add */
const opOf = (ops: any[], place: string) => ops.find((o) => o.op === 'add' && o.place === place);
const PEARL = 'toba-mikimoto-pearl-island';
const draftOf = (e: ScriptEnv) => e.context.draft as { cardId: string; ops: any[]; summary: string } | null;
const aiResultOf = (e: ScriptEnv) => e.context.screen.aiResult as { title: string; ids: string[]; notes: Record<string, string> } | null | undefined;
/** 等決定的卡：提議優先用畫面上的那版 */
const pendingOf = (e: ScriptEnv, tool: string) => e.context.cards.filter((c) => c.tool === tool && c.status === 'pending').at(-1)?.id ?? null;

/** 試算一份操作，再提議（規格 §4.3：完整的清單） */
const proposeSteps = (ops: (e: ScriptEnv) => any[], done: (e: ScriptEnv) => string): Script['steps'] => [
  (e) => ({ tools: [tool('check_changes', { ops: ops(e) })] }),
  (e) => (e.results.check_changes.ok ? { tools: [tool('propose_changes', { ops: ops(e), summary: e.results.check_changes.summary.join('；') })] } : { text: `這個改不了：${e.results.check_changes.error}` }),
  (e) => ({ text: done(e) }),
];

const decideOut = (e: ScriptEnv, done: string) => {
  const r = e.results.decide_card;
  if (r.ok) return { text: done };
  return { text: r.error };
};

export const SCRIPTS: Script[] = [
  // --- 接著改、用說的決定（規格 §3.3、§3.5） ---
  {
    id: 'S25a',
    sample: '（有提議時）再加珍珠島，排在午餐後面',
    match: (e) => !!draftOf(e) && /^再加珍珠島/.test(e.text),
    steps: [
      () => ({ tools: [tool('get_day', { date: '2027-02-04', on: 'draft' }), tool('suggest_position', { placeId: PEARL, date: '2027-02-04', on: 'draft' })] }),
      (e) => ({ tools: [tool('check_changes', { ops: [...draftOf(e)!.ops, { op: 'add', date: '2027-02-04', place: PEARL, index: e.results.suggest_position.index }] })] }),
      (e) => ({ tools: [tool('propose_changes', { ops: [...draftOf(e)!.ops, { op: 'add', date: '2027-02-04', place: PEARL, index: e.results.suggest_position.index }], summary: e.results.check_changes.summary.join('；') })] }),
      () => ({ text: `加好了 ${tag(PEARL)}，看一下時間軸，還可以接著改。` }),
    ],
  },
  {
    id: 'S25b',
    sample: '（有提議時）把珍珠島移到午餐前面',
    match: (e) => !!draftOf(e) && !!opOf(draftOf(e)!.ops, PEARL) && /移到午餐前面/.test(e.text),
    steps: proposeSteps(
      (e) => {
        const ops = draftOf(e)!.ops.map((o) => ({ ...o }));
        const lunch = ops.find((o) => o.tags?.includes('lunch'));
        opOf(ops, PEARL).index = lunch?.index ?? 1;
        return ops;
      },
      (e) => (/採用/.test(e.text) ? '移好了。這版你還沒看過，看一下沒問題再跟我說採用。' : '移好了，看一下時間軸。'),
    ),
  },
  {
    id: 'S26',
    sample: '（改過提議後）剛剛那版比較好',
    match: (e) => /剛剛那版|上一版/.test(e.text) && e.context.cards.some((c) => c.tool === 'propose_changes' && c.status === 'superseded'),
    steps: [
      (e) => ({ tools: [tool('show_again', { cardId: e.context.cards.filter((c) => c.tool === 'propose_changes' && c.status === 'superseded').at(-1)!.id })] }),
      (e) => ({ text: e.results.show_again.ok ? '回到上一版了，地圖和時間軸都換回去。' : e.results.show_again.error }),
    ],
  },
  {
    id: 'S27a',
    sample: '（有提議時）採用',
    match: (e) => /^(採用|就這樣)/.test(e.text) && !!pendingOf(e, 'propose_changes'),
    steps: [
      (e) => ({ tools: [tool('decide_card', { cardId: pendingOf(e, 'propose_changes')!, decision: 'confirm' })] }),
      (e) => decideOut(e, '寫進行程了，要改回去可以按「復原」。'),
    ],
  },
  {
    id: 'S27b',
    sample: '（有提議時）不要了',
    match: (e) => /^不要了/.test(e.text) && !!pendingOf(e, 'propose_changes'),
    steps: [
      (e) => ({ tools: [tool('decide_card', { cardId: pendingOf(e, 'propose_changes')!, decision: 'reject' })] }),
      (e) => decideOut(e, '好，這個提議不要了，行程沒有動。'),
    ],
  },
  {
    id: 'S27c',
    sample: '（有留言草稿時）送出吧',
    match: (e) => /^送出/.test(e.text) && !!pendingOf(e, 'draft_comment'),
    steps: [
      (e) => ({ tools: [tool('decide_card', { cardId: pendingOf(e, 'draft_comment')!, decision: 'confirm' })] }),
      (e) => decideOut(e, '留言送出了。'),
    ],
  },
  // --- 結果集：每次給完整的一組（規格 §3.1） ---
  {
    id: 'S28a',
    sample: '（有 AI 挑的時）再多找幾家',
    match: (e) => !!aiResultOf(e) && /再多找幾家/.test(e.text),
    steps: [
      () => ({ tools: [tool('search_places', { areas: ['toba'], types: ['restaurant'], cuisine: ['浜焼き・貝', '牡蠣', '伊勢海老・高級海鮮'], fit15: ['yes'], limit: 10 })] }),
      (e) => {
        const old = aiResultOf(e)!;
        const more = (e.results.search_places.places as any[]).map((p) => p.id as string).filter((id) => !old.ids.includes(id)).slice(0, 2);
        return { tools: [tool('show_places', { ids: [...old.ids, ...more], title: old.title, notes: { ...old.notes, ...Object.fromEntries(more.map((id) => [id, '新找到的'])) } })] };
      },
      (e) => ({ text: `加到 ${e.results.show_places.ids.length} 家了。` }),
    ],
  },
  {
    id: 'S28b',
    sample: '（有 AI 挑的時）拿掉第二家',
    match: (e) => !!aiResultOf(e) && /拿掉第二家/.test(e.text),
    steps: [
      (e) => {
        const old = aiResultOf(e)!;
        const gone = old.ids[1];
        const { [gone]: _, ...notes } = old.notes;
        return { tools: [tool('show_places', { ids: old.ids.filter((id) => id !== gone), title: old.title, notes })] };
      },
      (e) => ({ text: `拿掉了，剩 ${e.results.show_places.ids.length} 家。` }),
    ],
  },
  {
    id: 'S28c',
    sample: '那伊勢有什麼海鮮',
    match: (e) => /伊勢/.test(e.text) && /海鮮/.test(e.text),
    steps: [
      () => ({ tools: [tool('search_places', { areas: ['ise'], types: ['restaurant'], limit: 3 })] }),
      (e) => ({ tools: [tool('show_places', { ids: e.results.search_places.places.map((p: any) => p.id), title: '伊勢的餐廳' })] }),
      (e) => ({ text: `先看這 ${e.results.show_places.ids.length} 家。剛才鳥羽那幾家，按那則訊息的「再看一次」就回來。` }),
    ],
  },
  {
    id: 'S29a',
    sample: '（有 AI 挑的時）這幾家都按想去',
    match: (e) => !!aiResultOf(e) && /這幾家都按想去/.test(e.text),
    steps: [
      (e) => ({ tools: [tool('vote', { placeIds: aiResultOf(e)!.ids, value: 'like' })] }),
      (e) => ({ text: `按好了 ${e.results.vote.names.length} 家，可以一次復原。` }),
    ],
  },
  {
    id: 'S29b',
    sample: '（有 AI 挑的時）都加到 2/5 候選',
    match: (e) => !!aiResultOf(e) && /都加到 ?2\/5 ?候選/.test(e.text),
    steps: [
      (e) => ({ tools: [tool('add_candidate', { placeIds: aiResultOf(e)!.ids, date: '2027-02-05' })] }),
      () => ({ text: '這幾家放在同一張卡上，決定了就一起加進 2/5 的候選。' }),
    ],
  },
  // --- 篩選（規格 §4.2） ---
  {
    id: 'filter',
    sample: '只看鳥羽的餐廳',
    match: (e) => /只看鳥羽的餐廳/.test(e.text),
    steps: [
      () => ({ tools: [tool('set_filter', { types: ['restaurant'], areas: ['toba'] })] }),
      () => ({ text: '探索只留鳥羽的餐廳了。' }),
    ],
  },
  // --- 指稱（規格 §4.5） ---
  {
    id: 'S30',
    sample: '（點開一張卡）這家 15 人坐得下嗎？／第二家坐得下嗎？',
    match: (e) => /^(這家|第二家)/.test(e.text) && /(坐得下|15 ?人)/.test(e.text),
    steps: [
      (e) => {
        const s = e.context.screen as { detail?: { id: string } | null; selected?: { id: string } | null };
        const id = /^第二家/.test(e.text) ? aiResultOf(e)?.ids[1] : (chipPlaces(e)[0] ?? s.detail?.id ?? s.selected?.id);
        return id ? { tools: [tool('get_place', { ids: [id], sections: ['group'] })] } : { text: '你指的是哪一家？可以點開那張卡，或按「問 AI」帶過來。' };
      },
      (e) => ({ text: fit15Sentence(e.results.get_place.places[0]) }),
    ],
  },
  // --- 手動才有的操作（規格 §4.4） ---
  {
    id: 'S31a',
    sample: '2/5 午餐這次改選一榮',
    match: (e) => /改選一榮/.test(e.text),
    steps: proposeSteps(() => [{ op: 'selectOption', itemId: 'i-7', place: 'toba-kazuei' }], () => `提議把 2/5 午餐的主選換成 ${tag('toba-kazuei')}，決定採用才會改。`),
  },
  {
    id: 'S31b',
    sample: '2/5 午餐備註寫客滿就去漣',
    match: (e) => /備註寫/.test(e.text),
    steps: proposeSteps((e) => [{ op: 'setNote', itemId: 'i-7', note: e.text.split('備註寫')[1] }], () => '提議改 2/5 午餐的備註，決定採用才會改。'),
  },
  {
    id: 'S31c',
    sample: '撤下 2/5 的水族館',
    match: (e) => /撤下/.test(e.text) && /水族館/.test(e.text),
    steps: [
      () => ({ tools: [tool('get_day', { date: '2027-02-05' })] }),
      ...proposeSteps((e) => [{ op: 'withdraw', itemId: (e.results.get_day.entries as any[]).find((x) => x.placeId === 'toba-aquarium').itemId }], () => `提議撤下 ${tag('toba-aquarium')}，採用後它回到 2/5 的候選。`),
    ],
  },
  {
    id: 'S31d',
    sample: '2/5 留 30 分自由時間',
    match: (e) => /自由時間/.test(e.text),
    steps: proposeSteps(() => [{ op: 'addFree', date: '2027-02-05', minutes: 30, index: 2 }], () => '提議在 2/5 留 30 分自由時間，決定採用才會改。'),
  },
  {
    id: 'S31e',
    sample: '把遊覽船從 2/5 候選拿掉，因為太冷',
    match: (e) => /遊覽船/.test(e.text) && /候選拿掉/.test(e.text),
    steps: [
      (e) => ({ tools: [tool('remove_candidate', { placeId: 'toba-bay-cruise-irukajima', date: '2027-02-05', ...(/因為(.+)/.test(e.text) ? { reason: /因為(.+)/.exec(e.text)![1] } : {}) })] }),
      (e) => ({ text: e.results.remove_candidate.ok ? '決定了才會拿掉。' : e.results.remove_candidate.error }),
    ],
  },
  {
    id: 'S31f',
    sample: '把遊覽船的候選從 2/6 移到 2/7',
    match: (e) => /遊覽船/.test(e.text) && /移到 ?2\/7/.test(e.text),
    steps: [
      () => ({ tools: [tool('move_candidate', { placeId: 'toba-bay-cruise-irukajima', date: '2027-02-06', to: '2027-02-07' })] }),
      (e) => ({ text: e.results.move_candidate.ok ? '決定了才會移。' : e.results.move_candidate.error }),
    ],
  },
  // --- 預約 ---
  {
    id: 'S32a',
    sample: '哪幾家還沒訂？',
    match: (e) => /還沒訂/.test(e.text),
    steps: [
      () => ({ tools: [tool('get_reservations', { status: 'pending' })] }),
      (e) => ({ text: e.results.get_reservations.rows.length ? `還有 ${e.results.get_reservations.rows.length} 項沒訂：${(e.results.get_reservations.rows as any[]).slice(0, 5).map((r) => tag(r.placeId)).join('、')}。` : '都訂好了。' }),
    ],
  },
  {
    id: 'S32b',
    sample: '（預約清單上的點）訂好了',
    match: (e) => /訂好了$/.test(e.text),
    steps: [
      () => ({ tools: [tool('get_reservations', {})] }),
      (e) => {
        const name = e.text.replace(/訂好了$/, '').trim();
        const row = (e.results.get_reservations.rows as any[]).find((r) => r.name.includes(name) || name.includes(r.name));
        return row ? { tools: [tool('set_reservation', { date: row.date, placeId: row.placeId, status: 'booked' })] } : { text: `預約清單沒有「${name}」。` };
      },
      () => ({ text: '決定了才會標成已訂。' }),
    ],
  },
  // --- 切畫面 ---
  {
    id: 'S33',
    sample: '打開想去／給我看討論',
    match: (e) => /打開想去|看討論|打開預約|打開快照/.test(e.text),
    steps: [
      (e) => ({ tools: [tool('show_screen', /想去/.test(e.text) ? { tab: 'wish' } : { panel: /討論/.test(e.text) ? 'comments' : /預約/.test(e.text) ? 'reservations' : 'snapshots' })] }),
      () => ({ text: '打開了。' }),
    ],
  },

  // --- 一般 ---
  {
    id: 'S3',
    sample: '漣坐得下 15 人嗎？',
    match: (e) => /漣/.test(e.text) && /(坐|15)/.test(e.text),
    steps: [
      () => ({ tools: [tool('search_places', { text: '漣', types: ['restaurant'], limit: 3 })] }),
      (e) => ({ tools: [tool('get_place', { ids: [e.results.search_places.places[0].id], sections: ['group'] })] }),
      (e) => ({ text: fit15Sentence(e.results.get_place.places[0]), tools: [replies('找能確定坐得下的')] }),
      () => ({}),
    ],
  },
  {
    id: 'S1',
    sample: '鳥羽能坐 15 人的海鮮餐廳',
    match: (e) => /鳥羽/.test(e.text) && /海鮮/.test(e.text),
    steps: [
      () => ({ tools: [tool('search_places', { areas: ['toba'], types: ['restaurant'], cuisine: ['浜焼き・貝', '牡蠣', '伊勢海老・高級海鮮'], fit15: ['yes'], limit: 5 })] }),
      (e) => ({ tools: [tool('get_place', { ids: e.results.search_places.places.slice(0, 3).map((p: any) => p.id), sections: ['group', 'reservation'] })] }),
      (e) => {
        const list = e.results.get_place.places;
        const notes = Object.fromEntries(list.map((p: any) => [p.id, p.group?.seats != null ? `${p.group.seats} 席` : '席數沒有查到']));
        return { tools: [tool('show_places', { ids: list.map((p: any) => p.id), title: '鳥羽能坐 15 人的海鮮', notes })] };
      },
      (e) => ({
        text: `符合的有 ${e.results.search_places.total} 家，先看這 ${e.results.show_places.ids.length} 家：${e.results.show_places.ids.map(tag).join('、')}。`,
        tools: [replies('只看不用爬樓梯的', '排進 2/5 午餐')],
      }),
      () => ({}),
    ],
  },
  {
    id: 'S2',
    sample: '（帶著地點）15 人坐得下嗎？',
    match: (e) => chipPlaces(e).length === 1 && /(坐得下|15 ?人)/.test(e.text),
    steps: [
      (e) => ({ tools: [tool('get_place', { ids: chipPlaces(e), sections: ['group'] })] }),
      (e) => ({ text: fit15Sentence(e.results.get_place.places[0]) }),
    ],
  },
  {
    id: 'S4',
    sample: '（帶著 2 個以上的地點）比較這幾家',
    match: (e) => /比較/.test(e.text) && chipPlaces(e).length >= 2,
    steps: [
      (e) => ({ tools: [tool('get_place', { ids: chipPlaces(e), sections: ['group', 'hours', 'price', 'access'] })] }),
      (e) => ({ tools: [tool('show_places', { ids: chipPlaces(e), title: '比較', lettered: true, notes: Object.fromEntries(e.results.get_place.places.map((p: any) => [p.id, p.group?.fit15 ?? '未查'])) })] }),
      (e) => ({
        text: e.results.get_place.places.map((p: any, i: number) => `${String.fromCharCode(65 + i)}. ${tag(p.id)}：${p.group?.seats != null ? `${p.group.seats} 席` : '席數未查'}`).join('\n'),
      }),
    ],
  },
  {
    id: 'S5',
    sample: '從水族館走到珍珠島多久？',
    match: (e) => /水族館/.test(e.text) && /珍珠島/.test(e.text),
    steps: [
      () => ({ tools: [tool('get_route', { from: 'toba-aquarium', to: 'toba-mikimoto-pearl-island', mode: 'walk', date: '2027-02-05', time: '11:00' })] }),
      (e) => ({ tools: [tool('show_route', { from: 'toba-aquarium', to: 'toba-mikimoto-pearl-island', mode: 'walk', minutes: e.results.get_route.minutes })] }),
      (e) => ({ text: `全員走約 ${e.results.get_route.minutes} 分。路線：${e.results.get_route.mapsUrl}` }),
    ],
  },
  {
    id: 'S6a',
    sample: '幫我跟大家說媽媽膝蓋不好，珍珠島不要爬太多樓梯',
    match: (e) => /跟大家說|幫我留言/.test(e.text),
    steps: [
      () => ({ tools: [tool('draft_comment', { target: 'toba-mikimoto-pearl-island', text: '媽媽膝蓋不好，珍珠島希望不要爬太多樓梯' })] }),
      () => ({ text: '我寫好草稿了，可以改字，按「送出」才會發出去。' }),
    ],
  },
  {
    id: 'S6b',
    sample: '想去水族館',
    match: (e) => /^想去/.test(e.text),
    steps: [
      (e) => ({ tools: [tool('search_places', { text: e.text.replace(/^想去/, ''), limit: 1 })] }),
      (e) => ({ tools: [tool('vote', { placeIds: [e.results.search_places.places[0].id], value: 'like' })] }),
      (e) => ({ text: `幫你按了 ${tag(e.results.search_places.places[0].id)} 想去。` }),
    ],
  },
  {
    id: 'S6c',
    sample: '把遊覽船加到 2/6 的候選',
    match: (e) => /加到.*候選/.test(e.text) && /遊覽船/.test(e.text),
    steps: [
      () => ({ tools: [tool('add_candidate', { placeIds: ['toba-bay-cruise-irukajima'], date: '2027-02-06' })] }),
      () => ({ text: `按「加入」就會把 ${tag('toba-bay-cruise-irukajima')} 放進 2/6 的候選。` }),
    ],
  },
  {
    id: 'S7',
    sample: '大阪屋週三公休',
    match: (e) => /公休/.test(e.text) && /大阪屋/.test(e.text),
    steps: [
      () => ({ tools: [tool('get_place', { ids: ['toba-osakaya'], sections: ['hours'] })] }),
      () => ({ tools: [tool('propose_place_edit', { placeId: 'toba-osakaya', fieldPath: 'closedNote', value: '週三公休', note: '使用者提供' })] }),
      () => ({ text: `要改 ${tag('toba-osakaya')} 的公休資訊，按「確認」才會生效，大家都會看到，也可以復原。` }),
    ],
  },
  {
    id: 'S8',
    sample: '（貼一個 Google Maps 連結）',
    match: (e) => /https?:\/\/\S*(google|goo\.gl)\S*/.test(e.text),
    steps: [
      (e) => ({ tools: [tool('propose_user_place', { link: /https?:\/\/\S+/.exec(e.text)![0] })] }),
      (e) => ({ text: e.results.propose_user_place.ok ? '我打開確認畫面了，對一下位置和名稱，按「加進來」才會存。' : e.results.propose_user_place.error }),
    ],
  },
  {
    id: 'S9',
    sample: '（在探索清單按問 AI）挑 3 家最適合長輩的',
    match: (e) => !!listChip(e) && /挑/.test(e.text),
    steps: [
      (e) => {
        const f = listChip(e)!.filter;
        return { tools: [tool('search_places', { types: f.types, areas: f.areas, regions: f.regions, elderly: true, limit: 3 })] };
      },
      (e) => ({ tools: [tool('show_places', { ids: e.results.search_places.places.map((p: any) => p.id), title: '適合長輩的 3 家' })] }),
      (e) => ({ text: `這 ${e.results.show_places.ids.length} 家評分對長輩比較友善：${e.results.show_places.ids.map(tag).join('、')}。按 ✕ 回到原本的清單。` }),
    ],
  },

  // --- 行程 ---
  {
    id: 'S10',
    sample: '幫我檢查 2/5',
    match: (e) => /檢查/.test(e.text),
    steps: [
      (e) => {
        const date = dayChip(e) ?? '2027-02-05';
        return { tools: [tool('get_day', { date }), tool('get_opinions', { date }), tool('show_day', { date })] };
      },
      (e) => {
        const day = e.results.get_day;
        const disliked = (e.results.get_opinions.places as any[]).filter((p) => p.dislikes.length);
        return {
          text: [
            (() => {
              const act = day.warnings.filter((w: any) => w.level === 'act');
              return act.length ? `有 ${act.length} 個要處理：${act.map((w: any) => w.message).join('；')}` : '引擎沒有發現要處理的問題。';
            })(),
            day.candidates.length ? `候選：${day.candidates.map((c: any) => tag(c.id)).join('、')}。` : '',
            ...disliked.map((p) => `${p.dislikes.join('、')} 不喜歡 ${tag(p.id)}。`),
          ].filter(Boolean).join('\n'),
          tools: [replies('排一個候選進去', '這天太趕的話拿掉什麼？')],
        };
      },
      () => ({}),
    ],
  },
  {
    // 這晚住某區（T45c）：只改區，不選住宿；種子的 2/7 是二見第一晚，改成鳥羽第 3 晚
    id: 'T45c',
    sample: '鳥羽多住一晚',
    match: (e) => /鳥羽/.test(e.text) && /多住一晚/.test(e.text),
    steps: [
      () => ({ tools: [tool('get_trip_overview')] }),
      ...proposeSteps(
        () => [{ op: 'setNightArea', date: '2027-02-07', area: 'toba' }],
        () => '提議 2/7 改住鳥羽（鳥羽變 3 晚、二見剩 1 晚），那晚原本的住宿會清掉。',
      ),
    ],
  },
  {
    id: 'S11',
    sample: '幫我排第 3 天，加午餐',
    match: (e) => /第 ?[3三] ?天/.test(e.text),
    steps: [
      () => ({ tools: [tool('get_day', { date: '2027-02-04' }), tool('get_opinions', { date: '2027-02-04' })] }),
      () => ({ tools: [tool('search_places', { near: { place: 'shima-izawanomiya' }, types: ['restaurant'], openAt: { date: '2027-02-04', time: '12:00' }, fit15: ['yes'], limit: 5 })] }),
      (e) => ({ tools: [tool('suggest_position', { placeId: pickLunch(e), date: '2027-02-04' })] }),
      (e) => ({ tools: [tool('check_changes', { ops: lunchOps(e) })] }),
      (e) => ({ tools: [tool('propose_changes', { ops: lunchOps(e), summary: e.results.check_changes.summary.join('；') })] }),
      (e) => {
        const against = (e.results.get_opinions.places as any[]).filter((p) => p.dislikes.length);
        return {
          text: [`午餐提議 ${tag(pickLunch(e))}，地圖上是虛線，按「採用」才會改行程。`, ...against.map((p) => `提醒：${p.dislikes.join('、')} 不喜歡 ${tag(p.id)}。`)].join('\n'),
          tools: [replies('換一家不要義大利麵的')],
        };
      },
      () => ({}),
    ],
  },
  {
    id: 'S12',
    sample: '2/5 午餐換成大阪屋',
    match: (e) => /午餐換成大阪屋/.test(e.text),
    steps: [
      () => ({ tools: [tool('check_changes', { ops: [{ op: 'replace', itemId: 'i-7', place: 'toba-osakaya' }] })] }),
      (e) => ({ tools: [tool('propose_changes', { ops: [{ op: 'replace', itemId: 'i-7', place: 'toba-osakaya' }], summary: e.results.check_changes.summary.join('；') })] }),
      () => ({ text: `提議把 2/5 的午餐換成 ${tag('toba-osakaya')}，按「採用」才會改行程。` }),
    ],
  },
  {
    id: 'S12b',
    sample: '（提議過期後）請重新提議',
    match: (e) => /重新提議/.test(e.text),
    steps: [
      () => ({ tools: [tool('get_day', { date: '2027-02-05' })] }),
      (e) => {
        const lunch = (e.results.get_day.entries as any[]).find((x) => x.meal?.includes('lunch') && x.itemId);
        if (!lunch) return { text: '2/5 現在沒有午餐這一項了，要加一個嗎？', tools: [replies('2/5 午餐換成大阪屋')] };
        return { tools: [tool('propose_changes', { ops: [{ op: 'replace', itemId: lunch.itemId, place: 'toba-osakaya' }], summary: `2/5：${lunch.name} → 大阪屋 鳥羽店` })] };
      },
      () => ({ text: '照最新的行程重新提議了。' }),
    ],
  },
  {
    id: 'S13',
    sample: '把還沒排的分到各天',
    match: (e) => /分到各天/.test(e.text),
    steps: [
      () => ({ tools: [tool('get_opinions'), tool('get_trip_overview')] }),
      (e) => ({ tools: [tool('check_changes', { ops: wishOps(e) })] }),
      (e) => ({ tools: [tool('propose_changes', { ops: wishOps(e), summary: e.results.check_changes.summary.join('；') })] }),
      (e) => ({ text: `提議動到 ${wishOps(e).length} 個點，日期列標出有改動的天，按「採用」才會改行程。` }),
    ],
  },
  {
    id: 'S14',
    sample: '換一家不要義大利麵的',
    match: (e) => /換一家/.test(e.text),
    steps: [
      () => ({ tools: [tool('search_places', { near: { place: 'shima-izawanomiya' }, types: ['restaurant'], openAt: { date: '2027-02-04', time: '12:00' }, fit15: ['yes'], limit: 5 })] }),
      (e) => ({ tools: [tool('propose_changes', { ops: [{ op: 'add', date: '2027-02-04', place: otherLunch(e), index: 1, tags: ['lunch'] }], summary: '2/4：換一家午餐' })] }),
      (e) => ({ text: `換成 ${tag(otherLunch(e))}，上一個提議不算了。` }),
    ],
  },
];

const pickLunch = (e: ScriptEnv): string => e.results.search_places.places[0].id;
/** 換一家（S14）：上一個提議的是第一家，換後面第一家不是義大利麵的 */
const otherLunch = (e: ScriptEnv): string => {
  const rest = (e.results.search_places.places as any[]).slice(1);
  return (rest.find((p) => !/義大利/.test(p.name)) ?? rest[0]).id;
};
const lunchOps = (e: ScriptEnv) => [{ op: 'add', date: '2027-02-04', place: pickLunch(e), index: e.results.suggest_position.index, tags: ['lunch'] }];

/** 想去裡還沒排、也不是候選的點，依序放到有空的幾天（只放景點，住宿、餐廳要另外看） */
function wishOps(e: ScriptEnv) {
  const free = (e.results.get_trip_overview.days as any[]).filter((d) => d.stops.length === 0 && d.date !== '2027-02-13').map((d) => d.date as string);
  const todo = (e.results.get_opinions.wishes as any[]).filter((w) => w.type === 'spot' && !w.scheduledDays.length).slice(0, free.length);
  return todo.map((w, i) => ({ op: 'add', date: free[i], place: w.id }));
}

export function findScript(env: ScriptEnv): Script | null {
  return SCRIPTS.find((s) => s.match(env)) ?? null;
}

/** 對不到腳本時的回覆（S19） */
export function fallbackText(): string {
  return `原型只能回答這幾種問題，可以試試：\n${SCRIPTS.flatMap((s) => (s.sample ? [`・${s.sample}`] : [])).join('\n')}`;
}
