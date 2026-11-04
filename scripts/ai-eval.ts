// 用真的 Claude API 跑規格 §8 的對話腳本（T16）：工具叫對了沒、話有沒有亂說、花多少錢。會花錢，所以不是 npm test。
// 用法：npm run ai:eval -- --model claude-sonnet-5-5 [--effort medium] [--only S1,S11] [--out 檔案.json]
// 路徑和正式的一樣：瀏覽器的 chat.ts、真的工具和引擎 → Worker 的 /api/claude/messages → Claude API。API key 讀 worker/.env。

import { writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { harness } from '../web/test/aiHarness.ts';
import { createWorkerModel } from '../web/src/ai/workerModel.ts';
import { handle } from '../worker/src/index.ts';
import { freshDb } from '../worker/test/helpers/d1.ts';
import type { Env } from '../worker/src/env.ts';
import { splitReplies } from '../web/src/ai/transcript.ts';
import type { ChatContext, ChatMessage } from '../web/src/ai/types.ts';

const { values: args } = parseArgs({ options: { model: { type: 'string', default: 'claude-sonnet-5-5' }, effort: { type: 'string', default: 'medium' }, only: { type: 'string' }, out: { type: 'string' }, concurrency: { type: 'string', default: '3' } } });
process.loadEnvFile('worker/.env');

type H = Awaited<ReturnType<typeof harness>>;

interface TurnResult {
  tools: string[];
  text: string;
  replies: string[];
  error: string | null;
}

interface Check {
  id: string;
  /** 帶的脈絡晶片 */
  setup?: (h: H) => void | Promise<void>;
  chips?: ChatContext[];
  says: string[];
  /** 最後一句話那輪的檢查；回傳不符合的地方 */
  check: (t: TurnResult, h: H, all: TurnResult[]) => string[];
}

const needs = (t: TurnResult, ...names: string[]) => names.filter((n) => !t.tools.includes(n)).map((n) => `沒有呼叫 ${n}`);
const never = (t: TurnResult, ...names: string[]) => names.filter((n) => t.tools.includes(n)).map((n) => `不該呼叫 ${n}`);
const says = (t: TurnResult, re: RegExp, what: string) => (re.test(t.text) ? [] : [`回答沒有${what}`]);
const notSays = (t: TurnResult, re: RegExp, what: string) => (re.test(t.text) ? [`回答不該${what}`] : []);
const itineraryUntouched = (h: H, before: string) => (JSON.stringify(h.data.getState().itinerary) === before ? [] : ['行程被改了']);

const FIRST_DAY_PLAN = '幫我排 2/4，加午餐';

const CASES: Check[] = [
  { id: 'S1 找地點', says: ['鳥羽能坐 15 人的海鮮餐廳'], check: (t) => [...needs(t, 'search_places', 'show_places'), ...says(t, /\[\[place:/, '用地點標籤')] },
  { id: 'S2 問單點', chips: [{ kind: 'place', id: 'toba-osakaya' }], says: ['15 人坐得下嗎？'], check: (t) => [...needs(t, 'get_place'), ...says(t, /分|不行|不能/, '說要分桌')] },
  { id: 'S3 資料未查', says: ['漣坐得下 15 人嗎？'], check: (t) => [...never(t, 'show_places'), ...says(t, /沒有查到|沒查到|不確定|不知道|打電話/, '說資料沒查到')] },
  // T70 之後地點晶片已經帶分數、人數、座位和大家的意見，夠比較就不用 get_place（T71 實跑：Sonnet 只叫 show_places，比較的內容對）
  { id: 'S4 比較', chips: [{ kind: 'place', id: 'toba-yakigai-iroha' }, { kind: 'place', id: 'toba-hakkai' }, { kind: 'place', id: 'toba-osakaya' }], says: ['比較這 3 家'], check: (t) => [...needs(t, 'show_places'), ...says(t, /15 人/, '講 15 人坐不坐得下')] },
  { id: 'S5 路線', says: ['從水族館走到珍珠島多久？'], check: (t) => [...needs(t, 'get_route'), ...says(t, /分/, '講分鐘'), ...says(t, /google\.[^/]+\/maps/, '附 Google Maps 連結')] },
  { id: 'S6a 寫留言', says: ['幫我跟大家說媽媽膝蓋不好，珍珠島不要爬太多樓梯'], check: (t, h) => [...needs(t, 'draft_comment'), ...(h.cardOf('draft_comment')?.status === 'pending' ? [] : ['草稿卡不是等待中'])] },
  { id: 'S6b 按想去', says: ['我想去鳥羽水族館'], check: (t) => needs(t, 'vote') },
  { id: 'S6c 加候選', says: ['把鳥羽水族館加到 2/6 的候選'], check: (t) => [...needs(t, 'add_candidate'), ...notSays(t, /已經加好|加好了/, '說已經加好')] },
  { id: 'S7 改資料', says: ['鳥羽的大阪屋其實週三公休'], check: (t) => [...needs(t, 'propose_place_edit'), ...notSays(t, /已經改好|已更新|改好了/, '說已經改好')] },
  { id: 'S8 加地點', says: ['幫我加這個地點 https://www.google.com/maps/place/Foo/@34.48,136.84,17z'], check: (t) => needs(t, 'propose_user_place') },
  { id: 'S10 檢查一天', chips: [{ kind: 'day', date: '2027-02-05' }], says: ['幫我檢查這天'], check: (t) => [...says(t, /2\/5|2 月 5|02-05/, '講出是哪一天'), ...never(t, 'propose_changes')] },
  {
    id: 'S11 排一天',
    says: [FIRST_DAY_PLAN],
    check: (t, h) => [...needs(t, 'get_day', 'get_opinions', 'search_places', 'propose_changes'), ...(h.cardOf('propose_changes')?.status === 'pending' ? [] : ['提議卡不是等待中']), ...notSays(t, /已經排好|已經加進|已寫入/, '說已經改好')],
  },
  { id: 'S14 接著改', says: [FIRST_DAY_PLAN, '換一家別的'], check: (t) => needs(t, 'propose_changes') },
  { id: 'S27a 用說的採用', says: [FIRST_DAY_PLAN, '採用'], check: (t, h) => [...needs(t, 'decide_card'), ...(h.cardOf('propose_changes')?.status === 'confirmed' ? [] : ['提議沒有被採用'])] },
  { id: 'S27b 話不明確', says: [FIRST_DAY_PLAN, '好像不錯'], check: (t, h) => [...never(t, 'decide_card'), ...(h.cardOf('propose_changes')?.status === 'pending' ? [] : ['提議不該被決定'])] },
  { id: 'S27c 不要', says: [FIRST_DAY_PLAN, '不要了'], check: (t, h) => [...needs(t, 'decide_card'), ...(h.cardOf('propose_changes')?.status === 'rejected' ? [] : ['提議沒有被拒絕'])] },
  { id: 'S28 再多找幾家', says: ['鳥羽能坐 15 人的海鮮餐廳', '再多找幾家'], check: (t, h) => [...needs(t, 'show_places'), ...((h.lastUse('show_places').input.ids as string[]).length >= 2 ? [] : ['結果集太少'])] },
  { id: 'S30 指稱', setup: (h) => h.app.getState().openDetail('toba-osakaya'), says: ['這家 15 人坐得下嗎？'], check: (t, h) => [...needs(t, 'get_place'), ...(JSON.stringify(h.lastUse('get_place').input).includes('toba-osakaya') ? [] : ['沒有查正在看的那家'])] },
  { id: 'S32 預約', says: ['哪幾家還沒訂？'], check: (t) => needs(t, 'get_reservations') },
  { id: 'S33 切畫面', says: ['打開想去'], check: (t) => needs(t, 'show_screen') },
  // T67：篩選照類型分段的新欄位（住法、晚餐、2 月）
  {
    id: 'T67a 住法晚餐',
    says: ['鳥羽有哪些一間住得下 15 人、一泊二食的住宿？'],
    check: (t, h) => {
      const use = t.tools.includes('set_filter') ? h.lastUse('set_filter') : t.tools.includes('search_places') ? h.lastUse('search_places') : null;
      const input = JSON.stringify(use?.input ?? {});
      return [...(use ? [] : ['沒有呼叫 search_places 或 set_filter']), ...(/"stay"/.test(input) ? [] : ['沒有用 stay']), ...(/"dinner"|included/.test(input) ? [] : ['沒有用 dinner'])];
    },
  },
  {
    id: 'T67b 2 月',
    says: ['志摩有哪些適合 2 月去的景點？'],
    check: (t, h) => {
      const use = t.tools.includes('set_filter') ? h.lastUse('set_filter') : t.tools.includes('search_places') ? h.lastUse('search_places') : null;
      const input = JSON.stringify(use?.input ?? {});
      return [...(use ? [] : ['沒有呼叫 search_places 或 set_filter']), ...(/"winter"/.test(input) ? [] : ['沒有用 winter'])];
    },
  },
  { id: 'X1 做不到的事', says: ['幫我直接打電話訂大阪屋'], check: (t) => [...never(t, 'propose_changes'), ...notSays(t, /訂好了|已經訂/, '說訂好了')] },
  { id: 'X2 時間不自己算', says: ['2/5 會不會太趕？'], check: (t) => [...needs(t, 'get_day'), ...never(t, 'propose_changes')] },
];

/** 快速選項的規則（規格、系統提示） */
function replyProblems(replies: string[]): string[] {
  const out: string[] = [];
  if (replies.length > 4) out.push(`快速選項太多（${replies.length}）`);
  for (const r of replies) {
    if ([...r].length > 22) out.push(`快速選項太長：${r}`);
    if (/^(採用|不要|送出)$/.test(r.trim())) out.push(`快速選項和按鈕重複：${r}`);
    if (/還有.*(問|想)/.test(r)) out.push(`快速選項太空泛：${r}`);
  }
  return out;
}

const db = freshDb();
const env: Env = {
  DB: db as unknown as D1Database,
  DEV_AUTH: '1',
  DEV_MEMBER_ID: 'dev-eval',
  DEV_MEMBER_NAME: 'eval',
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  AI_MODEL: args.model,
  AI_EFFORT: args.effort,
  AI_DAILY_USD: '1000',
  AI_MONTHLY_USD: '1000',
};
const workerFetch = ((url: string, init?: RequestInit) => handle(new Request(`http://localhost${url}`, init), env)) as typeof fetch;

const turnOf = (messages: ChatMessage[], turn: string): TurnResult => {
  const own = messages.filter((m) => m.turn === turn);
  const uses = own.flatMap((m) => m.content.flatMap((b) => (b.type === 'tool_use' ? [b] : [])));
  const split = splitReplies(own.filter((m) => m.role === 'assistant').flatMap((m) => m.content.flatMap((b) => (b.type === 'text' ? [b.text as string] : []))).join('\n'));
  return { tools: uses.map((u) => u.name), text: split.text, replies: split.replies, error: null };
};

async function runCase(c: Check) {
  const h = await harness({ model: createWorkerModel({ fetch: workerFetch, url: '/api/claude/messages' }) });
  const started = Date.now();
  const before = JSON.stringify(h.data.getState().itinerary);
  const all: TurnResult[] = [];
  let problems: string[] = [];
  try {
    await c.setup?.(h);
    if (c.chips) await h.chat.ask(c.chips);
    for (const say of c.says) {
      await h.chat.send(say);
      const s = h.chat.store.getState();
      const last = s.messages.filter((m) => m.role === 'user' && m.content.some((b) => b.type === 'text')).at(-1)!;
      const t = turnOf(s.messages, last.turn);
      t.error = s.error?.message ?? null;
      all.push(t);
    }
    const t = all.at(-1)!;
    problems = [...(t.error ? [`出錯：${t.error}`] : []), ...all.filter((x) => !x.text.trim()).map(() => '回答是空的'), ...all.filter((x) => /\b(Let me|I'll|Already|Now I)\b/.test(x.text)).map(() => '回答有英文的碎念'), ...c.check(t, h, all), ...all.flatMap((x) => replyProblems(x.replies))];
    // 只有用說的採用可以改行程
    if (!c.id.startsWith('S27a')) problems.push(...itineraryUntouched(h, before));
  } catch (e) {
    problems = [`例外：${e instanceof Error ? e.message : String(e)}`];
  } finally {
    h.close();
  }
  return { id: c.id, ok: problems.length === 0, problems, seconds: (Date.now() - started) / 1000, turns: all };
}

const selected = CASES.filter((c) => !args.only || args.only.split(',').includes(c.id.split(' ')[0]));
const results: Awaited<ReturnType<typeof runCase>>[] = [];
let next = 0;
await Promise.all(
  Array.from({ length: Number(args.concurrency) }, async () => {
    while (next < selected.length) {
      const c = selected[next++];
      const r = await runCase(c);
      results.push(r);
      console.log(`${r.ok ? 'PASS' : 'FAIL'} ${r.id}（${r.seconds.toFixed(0)} 秒）${r.ok ? '' : `：${r.problems.join('；')}`}`);
    }
  }),
);
results.sort((a, b) => selected.findIndex((c) => c.id === a.id) - selected.findIndex((c) => c.id === b.id));

const usage = await db.prepare('SELECT SUM(input_tokens) AS input, SUM(output_tokens) AS output, SUM(cache_read_tokens) AS cacheRead, SUM(cache_write_tokens) AS cacheWrite, SUM(cost_micro_usd) AS micro FROM ai_usage').first<Record<string, number>>();
const passed = results.filter((r) => r.ok).length;
const withReplies = results.filter((r) => r.turns.at(-1)?.replies.length).length;
const turns = results.reduce((n, r) => n + r.turns.length, 0);
const summary = { model: args.model, effort: args.effort, passed, total: results.length, turns, usd: (usage?.micro ?? 0) / 1e6, usdPerTurn: (usage?.micro ?? 0) / 1e6 / Math.max(turns, 1), secondsPerCase: results.reduce((n, r) => n + r.seconds, 0) / Math.max(results.length, 1), withReplies, usage };
console.log(JSON.stringify(summary, null, 2));
if (args.out) writeFileSync(args.out, JSON.stringify({ summary, results }, null, 2));
