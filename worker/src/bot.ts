// LINE @ 機器人（T34）：核准的家人群組裡 @ 它，回最新的行程（只有結果：幾點到幾點做什麼、住哪、預約狀態）。只能查，不能改。
// - 完全符合的指令（整趟、2/5、今天、明天、現在、預約、2/5 預約、網址、怎麼用）直接回，不呼叫 AI。
// - 其他問法交給 Haiku 分類（structured output）；回覆的內容一律由程式照摘要排，AI 只有「其他問題」才自己回一兩句。
// - 時間軸是瀏覽器算的，這裡讀瀏覽器存的摘要（trip_summary）；預約狀態讀最新的 reservations。
// - 「現在」一律是日本時間。

import Anthropic from '@anthropic-ai/sdk';
import {
  addDays,
  dayHeading,
  formatDay,
  formatNow,
  formatReservations,
  formatTrip,
  jstNow,
  shortDate,
  tripRange,
  type ReservationStatusText,
  type TripSummary,
} from '@travel-helper/engine';
import type { Env } from './env.ts';
import { addUsage, checkQuota, limitOf } from './api/claude.ts';
import { HttpError } from './lib/http.ts';
import { LINE_REPLY_MAX, LINE_TEXT_MAX } from './lib/line.ts';

/** 機器人的 AI 用量記在 ai_usage 的這個 member_id（每月上限和大家共用） */
export const BOT_USAGE_ID = 'line-bot';
const DEFAULT_BOT_MODEL = 'claude-haiku-5-5';
/** 機器人每天的 AI 上限（美元），可以用 AI_BOT_DAILY_USD 改；Haiku 一次約 US$0.001 */
const DEFAULT_BOT_DAILY_USD = 1;

export type Intent =
  | { type: 'trip' }
  | { type: 'day'; date: string }
  | { type: 'now' }
  | { type: 'reservations'; date: string | null }
  | { type: 'answer'; text: string }
  | { type: 'url' }
  | { type: 'help' };

/** 全形轉半形、拿掉空白和標點 */
export function normalize(text: string): string {
  return text.normalize('NFKC').replace(/[\s?!。.,、，~～:：「」]/g, '');
}

const DATE_RE = /^(\d{1,2})[/月](\d{1,2})[日號号]?$/;

/** 今天、明天、2/5 → YYYY-MM-DD；M/D 用旅程那一年（不在旅程裡也回日期，讓回覆說「不在旅程裡」） */
function resolveDate(token: string, today: string, days: string[]): string | null {
  if (token === '今天') return today;
  if (token === '明天') return addDays(today, 1);
  const m = DATE_RE.exec(token);
  if (!m) return null;
  const mo = Number(m[1]);
  const d = Number(m[2]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const year = (days[0] ?? today).slice(0, 4);
  return days.find((x) => Number(x.slice(5, 7)) === mo && Number(x.slice(8, 10)) === d) ?? `${year}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** 「怎麼用」和「說明」「指令」「help」同一個指令；只 @ 不說話也回說明 */
const isHelp = (normalized: string) => !normalized || ['怎麼用', '怎么用', '說明', '指令', 'help'].includes(normalized.toLowerCase());

/** 完全符合的指令；不是指令回 null（交給 AI） */
export function parseCommand(text: string, today: string, days: string[]): Intent | null {
  const t = normalize(text);
  if (isHelp(t)) return { type: 'help' };
  if (t === '整趟') return { type: 'trip' };
  if (t === '網址') return { type: 'url' };
  if (t === '現在' || t === '下一個') return { type: 'now' };
  if (t === '預約') return { type: 'reservations', date: null };
  const r = /^(.+?)的?預約$/.exec(t) ?? /^預約(.+)$/.exec(t);
  if (r) {
    const date = resolveDate(r[1], today, days);
    return date ? { type: 'reservations', date } : null;
  }
  const date = resolveDate(t, today, days);
  return date ? { type: 'day', date } : null;
}

/** 拿掉訊息裡的 @（LINE 的 mention 給的位置是 UTF-16） */
export function stripMentions(text: string, mentionees: { index: number; length: number }[]): string {
  let out = text;
  for (const m of [...mentionees].sort((a, b) => b.index - a.index)) out = out.slice(0, m.index) + out.slice(m.index + m.length);
  return out.trim();
}

/** 長文字切成 LINE 一則放得下的幾則：在空行（兩天之間）切，最多 5 則 */
export function splitMessages(text: string, max = LINE_TEXT_MAX): string[] {
  const out: string[] = [];
  let cur = '';
  for (const part of text.split('\n\n')) {
    const next = cur ? `${cur}\n\n${part}` : part;
    if (next.length <= max) cur = next;
    else {
      if (cur) out.push(cur);
      cur = part.length <= max ? part : part.slice(0, max);
    }
  }
  if (cur) out.push(cur);
  if (out.length > LINE_REPLY_MAX) {
    out.length = LINE_REPLY_MAX;
    out[LINE_REPLY_MAX - 1] = `${out[LINE_REPLY_MAX - 1].slice(0, max - 20)}\n\n（太長了，後面請看網站）`;
  }
  return out;
}

const SYSTEM = `你是一個家族旅遊 LINE 群組裡的行程機器人，只能查行程，不能改。把使用者的話分成一種回覆，回 JSON：
- trip：要整趟的行程。
- day：要某一天的行程。date 填 YYYY-MM-DD；「今天」「明天」「後天」「星期五」照 <now> 換算。
- now：問現在、接下來、下一個是什麼這類跟當下時間有關的。
- reservations：問預約、訂位、訂好了沒。date 填那天的 YYYY-MM-DD，沒說哪天填 null。
- answer：其他關於這趟行程的問題（例如「哪天去伊勢神宮」「2/5 住哪」「幾點要到機場」）。text 用繁體中文一兩句回答，只能根據 <trip> 裡的行程；行程裡沒有就說「行程裡沒有」，不要編時間、地點、店名。
- url：要網站的網址、連結。
- help：跟行程無關，或看不懂。
沒用到的欄位填 null。`;

const SCHEMA = {
  type: 'object',
  properties: {
    type: { type: 'string', enum: ['trip', 'day', 'now', 'reservations', 'answer', 'url', 'help'] },
    date: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    text: { anyOf: [{ type: 'string' }, { type: 'null' }] },
  },
  required: ['type', 'date', 'text'],
  additionalProperties: false,
};

/** 不是指令的問法交給 Haiku 分類。額度用完、出錯都回 null（呼叫的人回說明） */
async function classify(env: Env, db: D1Database, question: string, summary: TripSummary, now: ReturnType<typeof jstNow>): Promise<Intent | null> {
  if (!env.ANTHROPIC_API_KEY) return null;
  try {
    await checkQuota(db, env, BOT_USAGE_ID, limitOf(env.AI_BOT_DAILY_USD, DEFAULT_BOT_DAILY_USD));
  } catch (e) {
    if (e instanceof HttpError) return null;
    throw e;
  }
  const model = env.AI_BOT_MODEL || DEFAULT_BOT_MODEL;
  // reply token 1 分鐘內要用掉：最多重試一次
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, maxRetries: 1, timeout: 25_000, ...(env.ANTHROPIC_BASE_URL ? { baseURL: env.ANTHROPIC_BASE_URL } : {}) });
  try {
    const r = await client.messages.create({
      model,
      max_tokens: 2000,
      output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
      system: SYSTEM,
      messages: [
        {
          role: 'user',
          content: `<now>${now.date}（${now.weekday}）${now.time} 日本時間</now>\n<trip>\n${formatTrip(summary)}\n</trip>\n<question>${question}</question>`,
        },
      ],
    });
    await addUsage(db, BOT_USAGE_ID, model, {
      input: r.usage.input_tokens,
      output: r.usage.output_tokens,
      cacheRead: r.usage.cache_read_input_tokens ?? 0,
      cacheWrite: r.usage.cache_creation_input_tokens ?? 0,
    });
    if (r.stop_reason !== 'end_turn') return null;
    const text = r.content.find((b) => b.type === 'text')?.text;
    const o = text ? (JSON.parse(text) as { type: string; date: string | null; text: string | null }) : null;
    const date = o?.date && /^\d{4}-\d{2}-\d{2}$/.test(o.date) ? o.date : null;
    switch (o?.type) {
      case 'trip':
      case 'now':
      case 'url':
      case 'help':
        return { type: o.type };
      case 'day':
        return date ? { type: 'day', date } : null;
      case 'reservations':
        return { type: 'reservations', date };
      case 'answer':
        return o.text?.trim() ? { type: 'answer', text: o.text.trim().slice(0, 500) } : null;
      default:
        return null;
    }
  } catch (e) {
    console.error('機器人的 AI', e);
    return null;
  }
}

/**
 * 「網址」：網站的網址，加上 LINE 的 openExternalBrowser=1，從 LINE 點開會用手機的預設瀏覽器（不是 LINE 內建的），
 * 可以加到主畫面、登入狀態也比較不會被清掉（architecture §5「要注意的地方」）
 */
export function externalUrl(base: string | undefined): string {
  if (!base) return '網站的網址還沒設定（PUBLIC_BASE_URL），請聯絡管理員';
  return `用瀏覽器打開網站：\n${externalLink(base)}`;
}

function externalLink(base: string): string {
  const u = new URL(base);
  u.searchParams.set('openExternalBrowser', '1');
  return u.toString();
}

/** 「怎麼用」（interaction-design §17.5）：現在是排行程的階段，不舉今天、明天、現在（指令照舊能用） */
export function helpText(base: string | undefined): string {
  return [
    '我們正在一起排 2/2～2/13 的行程，打開網址就能看：',
    '① 在「探索」喜歡的按 ♡',
    '② 點日期看每天排了什麼',
    '③ 有意見按 💬 留言',
    '',
    '在這裡也可以問我：',
    '「整趟」看每天排了哪裡',
    '「2/5」看那天的時間表',
    '「預約」看哪些還沒訂（只是筆記，網站不會幫忙訂）',
    ...(base ? ['', externalLink(base)] : []),
  ].join('\n');
}

/** ISO 時間 → 日本時間的 11/2 14:05 */
function jstStamp(iso: string): string {
  const n = jstNow(Date.parse(iso));
  return `${shortDate(n.date)} ${n.time}`;
}

interface Loaded {
  summary: TripSummary;
  /** 摘要跟不上行程（有人改了行程，還沒有人打開網站算） */
  stale: boolean;
  footer: string;
}

async function load(db: D1Database): Promise<Loaded | null> {
  const row = await db
    .prepare(
      `SELECT s.data, s.version AS summary_version, i.version, i.updated_at, m.display_name
       FROM trip_summary s LEFT JOIN itinerary i ON i.id = 1 LEFT JOIN members m ON m.line_user_id = i.updated_by
       WHERE s.id = 1`,
    )
    .first<{ data: string; summary_version: number; version: number | null; updated_at: string | null; display_name: string | null }>();
  if (!row) return null;
  return {
    summary: JSON.parse(row.data) as TripSummary,
    stale: row.version !== null && row.version !== row.summary_version,
    footer: row.updated_at ? `（${jstStamp(row.updated_at)}${row.display_name ? ` ${row.display_name}` : ''} 更新）` : '',
  };
}

/** 收到一則 @ 機器人的話：回覆的幾則文字 */
export async function botReply(env: Env, db: D1Database, question: string, nowMs = Date.now()): Promise<string[]> {
  const link = env.PUBLIC_BASE_URL ? `\n網站：${env.PUBLIC_BASE_URL}` : '';
  const help = helpText(env.PUBLIC_BASE_URL);
  // 網址、怎麼用不用讀行程（還沒有摘要時也回得出來）
  if (normalize(question) === '網址') return [externalUrl(env.PUBLIC_BASE_URL)];
  if (isHelp(normalize(question))) return [help];
  const loaded = await load(db);
  if (!loaded) return [`行程還沒整理好：請有人打開網站看一次行程。${link}`];
  const { summary, stale, footer } = loaded;
  const now = jstNow(nowMs);
  const days = summary.days.map((d) => d.date);
  const intent = parseCommand(question, now.date, days) ?? (await classify(env, db, question, summary, now)) ?? { type: 'help' as const };
  const notInTrip = (date: string) => `${dayHeading(date)}不在旅程裡（旅程是 ${tripRange(summary)}）`;
  // 行程的回覆最後寫誰什麼時候更新；摘要跟不上時註明
  const withTail = (text: string) => [text, stale ? '（網站上剛改過行程，這份可能還不是最新的）' : '', footer].filter(Boolean).join('\n');

  switch (intent.type) {
    case 'help':
      return [help];
    case 'url':
      return [externalUrl(env.PUBLIC_BASE_URL)];
    case 'answer':
      return [intent.text];
    case 'trip':
      return splitMessages(withTail(formatTrip(summary)));
    case 'day': {
      const day = summary.days.find((d) => d.date === intent.date);
      return [day ? withTail(formatDay(day)) : notInTrip(intent.date)];
    }
    case 'now': {
      const text = formatNow(summary, now);
      return [text ? withTail(text) : `現在不在旅程裡（旅程是 ${tripRange(summary)}）`];
    }
    case 'reservations': {
      if (intent.date && !days.includes(intent.date)) return [notInTrip(intent.date)];
      const r = await db.prepare('SELECT date, place_id, status, note FROM reservations').all<{ date: string; place_id: string; status: ReservationStatusText; note: string | null }>();
      const saved = r.results.map((x) => ({ date: x.date, placeId: x.place_id, status: x.status, note: x.note }));
      return splitMessages(formatReservations(summary, intent.date, saved));
    }
  }
}
