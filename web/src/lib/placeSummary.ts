// T44b：這團在乎的重點（interaction-design §18）——卡片的標章、詳情的四格（長輩／小孩／2 月／15 人）、一行費用、一行小提醒。
// 一行時間在 hours.ts 的 hoursLine。都是純函式，資料不夠就回 null，不猜。
// 卡片的標章只用清單層的欄位（assessment.scores、indoor、closures、hours，worker/src/lib/placeLayers.ts）；四格的理由用詳情層。

import type { Closure, Place } from '../data/types.ts';
import { closedDaysLabel } from './hours.ts';
import { TRIP_END, tripDates } from './trip.ts';

/** 這團：15 人，其中 4 位 6～10 歲的小孩（CLAUDE.md） */
export const PARTY = { adults: 11, kids: 4 } as const;

export type FitMark = '◎' | '○' | '△' | '✕';
export type FitTone = 'good' | 'mid' | 'warn' | 'none';

/** 五顆星的分數 → 記號：4、5 ◎，3 ○，2 △，1 ✕ */
export function scoreMark(score: unknown): FitMark | null {
  if (typeof score !== 'number') return null;
  if (score >= 4) return '◎';
  if (score >= 3) return '○';
  if (score >= 2) return '△';
  return '✕';
}

export function markTone(mark: FitMark | null): FitTone {
  return mark === '◎' ? 'good' : mark === '○' ? 'mid' : mark ? 'warn' : 'none';
}

/** 一句話：拿掉括號裡的出處和補充，取到第一個「；」「。」 */
export function shortReason(text: unknown): string | null {
  if (typeof text !== 'string') return null;
  let t = text;
  for (let prev = ''; prev !== t; ) {
    prev = t;
    t = t.replace(/（[^（）]*）|\([^()]*\)/g, '');
  }
  t = (t.split(/[；。\n]/)[0] ?? '').trim().replace(/[，、：:]+$/, '');
  return t || null;
}

// ---------- 旅程期間的休業 ----------

/** 能去玩的日子：第一天到倒數第二天（最後一天中午就搭飛機） */
export function visitDates(): string[] {
  return tripDates().filter((d) => d < TRIP_END);
}

/** 連續的日期併成「2/2～2/5」，其他用頓號接 */
export function dateSpanLabel(dates: string[]): string {
  const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;
  const all = tripDates();
  const spans: string[][] = [];
  for (const d of dates) {
    const last = spans[spans.length - 1];
    if (last && all.indexOf(d) === all.indexOf(last[last.length - 1]) + 1) last.push(d);
    else spans.push([d]);
  }
  return spans.map((s) => (s.length > 1 ? `${md(s[0])}～${md(s[s.length - 1])}` : md(s[0]))).join('、');
}

export interface TripClosure {
  /** 休的日子（能去玩的日子裡） */
  dates: string[];
  /** 能去玩的日子全部休 */
  all: boolean;
  note: string | null;
}

/** 旅程期間碰到的有日期的休業（closures）；沒碰到是 null */
export function tripClosure(closures: Closure[]): TripClosure | null {
  const days = visitDates();
  const hit = days.filter((d) => closures.some((c) => c.from <= d && d <= c.to));
  if (!hit.length) return null;
  const c = closures.find((x) => x.from <= hit[0] && hit[0] <= x.to);
  return { dates: hit, all: hit.length === days.length, note: c?.note ?? null };
}

// ---------- 卡片的標章 ----------

export interface FitBadge {
  label: string;
  tone: 'good' | 'warn';
}

type Ranked = FitBadge & { rank: number };

function scores(p: Place): Record<string, number | null> {
  return (p.assessment?.scores ?? {}) as Record<string, number | null>;
}

/**
 * 卡片上的標章（探索、想去的卡）：從長輩、小孩、室內、二月休挑最好的一個和最差的一個；
 * 只有好的（或只有壞的）就挑兩個。max 是 1 時（前面已經有「已排、候選」）先放最差的。
 */
export function fitBadges(p: Place, max = 2): FitBadge[] {
  if (p.type === 'station' || p.origin === 'user' || max <= 0) return [];
  const good: Ranked[] = [];
  const warn: Ranked[] = [];
  const s = scores(p);
  const fit = (key: 'elderFit' | 'kidsFit', name: string, order: number) => {
    const score = s[key];
    const mark = scoreMark(score);
    if (mark === '◎') good.push({ label: `${name} ◎`, tone: 'good', rank: (score as number) * 10 - order });
    else if (mark === '△' || mark === '✕') warn.push({ label: `${name} ${mark}`, tone: 'warn', rank: (mark === '✕' ? 30 : 20) - order });
  };
  fit('elderFit', '長輩', 0);
  fit('kidsFit', '小孩', 1);
  if (p.raw.indoor === true) good.push({ label: '室內', tone: 'good', rank: 45 });
  const closed = tripClosure(p.closures);
  if (closed) warn.push({ label: closed.all ? '二月休' : `${dateSpanLabel(closed.dates)} 休`, tone: 'warn', rank: closed.all ? 50 : 25 });
  good.sort((a, b) => b.rank - a.rank);
  warn.sort((a, b) => b.rank - a.rank);
  const out: Ranked[] = [];
  if (warn[0]) out.push(warn.shift()!);
  if (out.length < max && good[0]) out.unshift(good.shift()!);
  while (out.length < max && (good.length || warn.length)) out.push((good.shift() ?? warn.shift())!);
  return out.slice(0, max).map(({ label, tone }) => ({ label, tone }));
}

// ---------- 詳情的四格 ----------

export interface FitCell {
  key: 'elder' | 'kids' | 'feb' | 'group';
  label: string;
  mark: FitMark | null;
  tone: FitTone;
  /** 一句理由（已經拿掉括號）；沒有資料是 null */
  reason: string | null;
}

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : {});
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null);

function rationale(p: Place, key: string): string | null {
  return shortReason(p.assessment?.rationale?.[key]);
}

function cell(key: FitCell['key'], label: string, mark: FitMark | null, reason: string | null): FitCell {
  return { key, label, mark, tone: markTone(mark), reason };
}

function elderCell(p: Place): FitCell {
  return cell('elder', '長輩', scoreMark(scores(p).elderFit), rationale(p, 'elderFit') ?? shortReason(obj(p.raw.accessibility).note));
}

function kidsCell(p: Place): FitCell {
  const kids = obj(p.raw.kids);
  const s = scores(p).kidsFit;
  if (typeof s === 'number') return cell('kids', '小孩', scoreMark(s), rationale(p, 'kidsFit') ?? shortReason(kids.note));
  // 住宿沒有小孩的分數：只看能不能帶小孩
  const allowed = kids.allowed;
  const mark: FitMark | null = allowed === 'no' ? '✕' : allowed === 'age-limit' ? '△' : allowed === 'yes' ? '○' : null;
  const fallback = allowed === 'no' ? '不接受小孩' : allowed === 'age-limit' ? '有年齡限制' : allowed === 'yes' ? '可以帶小孩' : null;
  return cell('kids', '小孩', mark, shortReason(kids.note) ?? fallback);
}

function febCell(p: Place): FitCell {
  const closed = tripClosure(p.closures);
  if (closed) {
    const why = shortReason(closed.note);
    return cell('feb', '2 月', closed.all ? '✕' : '△', `${closed.all ? '旅程期間都休' : `${dateSpanLabel(closed.dates)} 休`}${why ? `：${why}` : ''}`);
  }
  const weekly = closedDaysLabel(p.hours);
  const s = scores(p).winterFit;
  if (typeof s === 'number') {
    const why = rationale(p, 'winterFit');
    return cell('feb', '2 月', scoreMark(s), [weekly, why].filter(Boolean).join('・') || null);
  }
  // 餐廳、住宿沒有冬天的分數：營業時間知道、旅程期間沒有休業就是照常
  const why = shortReason(p.febNote);
  if (!p.hours) return cell('feb', '2 月', null, why);
  return cell('feb', '2 月', weekly ? '○' : '◎', weekly ?? why ?? '2 月照常營業');
}

function groupCell(p: Place): FitCell {
  const g = obj(p.raw.group);
  if (p.type === 'restaurant') {
    const f = g.fit15;
    const mark: FitMark | null = f === 'yes' ? '◎' : f === 'split' ? '○' : f === 'no' ? '✕' : scoreMark(scores(p).groupFit);
    const fallback = f === 'yes' ? '坐得下 15 人' : f === 'split' ? '15 人要分桌' : f === 'no' ? '坐不下 15 人' : null;
    return cell('group', '15 人', mark, rationale(p, 'groupFit') ?? fallback);
  }
  if (p.type === 'lodging') {
    const max = typeof g.maxGuests === 'number' ? g.maxGuests : null;
    const fallback = g.wholeRental === true && max ? `包棟，最多 ${max} 人` : max ? `最多 ${max} 人` : null;
    return cell('group', '15 人', scoreMark(scores(p).groupFit), rationale(p, 'groupFit') ?? fallback);
  }
  // 景點：只看團體要不要預約
  const r = str(g.reservation);
  const free = r && /不(?:需|用|必)要?(?:事先)?(?:預約)?|免預約|不接受.{0,4}預約/.test(r);
  const need = r && /預約制|(?<![不免])(?:要|需|須|必須)要?(?:事先|先)?(?:電話|打電話)?(?:預約|申請|聯絡|告知)/.test(r);
  const first = shortReason(r);
  if (need) return cell('group', '15 人', '○', first);
  if (free) return cell('group', '15 人', '◎', first && /預約/.test(first) ? first : '團體不用預約');
  return cell('group', '15 人', null, first);
}

/** 詳情簡介的四格；車站、自己加的點沒有 */
export function fitCells(p: Place): FitCell[] {
  if (p.type === 'station' || p.origin === 'user') return [];
  return [elderCell(p), kidsCell(p), febCell(p), groupCell(p)];
}

// ---------- 一行費用 ----------

const NOT_MONEY_UNIT = /^\s*(?:人|名|室|歲|才|分|個|台|月|日|年|時|泊|間|席|則|件|號|班|m|km|%|晚|樓|F)/;

/** 文字裡的金額（円、¥、日圓；後面接「人」「歲」這種的不算） */
export function yenAmounts(text: string): number[] {
  const out: number[] = [];
  const re = /([¥￥])?\s*(\d{1,3}(?:,\d{3})+|\d+)(\s*(?:円|日圓|日元))?/g;
  let m: RegExpExecArray | null;
  let prevMoneyEnd = -10;
  while ((m = re.exec(text))) {
    const n = Number(m[2].replace(/,/g, ''));
    const after = text.slice(m.index + m[0].length);
    const before = text.slice(Math.max(0, m.index - 1), m.index);
    const marked = Boolean(m[1] || m[3]);
    // 「¥1,000～1,999」後面那個沒有記號，但緊接在金額的「～」後面
    const rangeTail = !marked && /[～~]/.test(before) && m.index - prevMoneyEnd <= 2;
    if ((marked || rangeTail || (m[2].includes(',') && !NOT_MONEY_UNIT.test(after))) && !(!m[3] && NOT_MONEY_UNIT.test(after))) {
      out.push(n);
      prevMoneyEnd = m.index + m[0].length;
    }
  }
  return out;
}

const FREE = /免費|無料|不用錢/;

/** 大人的票價：去掉括號（團體價這些）後的第一個金額；寫免費是 0 */
export function adultYen(text: unknown): number | null {
  if (typeof text !== 'string') return null;
  const t = stripParens(text);
  const first = (t.split(/[；;]/)[0] ?? '').trim();
  const a = yenAmounts(first);
  if (a.length) return a[0];
  return FREE.test(first) ? 0 : null;
}

/** 小孩（6～10 歲＝小學生）的票價：先找寫小學生的那一段，沒有就第一段 */
export function childYen(text: unknown): number | null {
  if (typeof text !== 'string') return null;
  const parts = stripParens(text).split(/[；;、]/).map((s) => s.trim()).filter(Boolean);
  const school = parts.find((s) => /小學|小中|小人|兒童|子ども|子供|小孩|6～|6 歲|國中以下|中學生以下|12 歲以下/.test(s) && !/未滿 ?[3-6] ?歲|幼兒|未就學|乳/.test(s));
  const seg = school ?? parts[0];
  if (!seg) return null;
  const a = yenAmounts(seg);
  if (a.length) return a[0];
  return FREE.test(seg) ? 0 : null;
}

function stripParens(text: string): string {
  let t = text;
  for (let prev = ''; prev !== t; ) {
    prev = t;
    t = t.replace(/（[^（）]*）|\([^()]*\)/g, '');
  }
  return t;
}

const yen = (n: number) => `${n.toLocaleString('ja-JP')} 円`;

export interface PriceLine {
  /** 「大人 2,800 円・小孩 1,600 円」或價位原文的第一段 */
  text: string;
  /** 「這團約 37,200 円」「15 人約 36,000～82,500 円」；算不出來是 null */
  estimate: string | null;
}

/** 詳情的一行費用；什麼都沒有是 null */
export function priceLine(p: Place): PriceLine | null {
  const raw = p.raw;
  const fares = obj(raw.fares);
  if (p.type === 'spot') {
    const adultText = str(fares.adult) ?? str(raw.admission);
    if (!adultText) return null;
    const a = adultYen(adultText);
    const c = childYen(fares.child);
    if (a === 0 && (c === 0 || c === null)) return { text: '免費', estimate: null };
    const parts = [a !== null ? `大人 ${yen(a)}` : shortReason(adultText), c !== null ? `小孩 ${c === 0 ? '免費' : yen(c)}` : null].filter(Boolean);
    const estimate = a !== null && c !== null ? `這團約 ${yen(a * PARTY.adults + c * PARTY.kids)}` : null;
    return parts.length ? { text: parts.join('・'), estimate } : null;
  }
  const range = str(raw.priceRange);
  if (!range) return null;
  const head = shortReason(range) ?? range;
  // 原文已經算好 15 人的（包棟）
  const given = /15 ?人約 ?([\d,]+) ?円/.exec(range);
  const night = p.type === 'lodging' ? '／晚' : '';
  if (given) return { text: head, estimate: `15 人約 ${given[1]} 円${night}` };
  // 一個價位（或一段「～」）、每人的才乘 15；午晚兩段、每棟、每晚的不算
  const amounts = yenAmounts(head);
  const perHouse = /包棟|每棟|每晚|一棟|1 棟|每間|一間/.test(head);
  const twoMeals = /午.*晚|晚.*午|／/.test(head);
  if (perHouse || twoMeals || !amounts.length || amounts.length > 2) return { text: head, estimate: null };
  const size = PARTY.adults + PARTY.kids;
  const [lo, hi] = amounts;
  const est = hi && hi !== lo ? `15 人約 ${(lo * size).toLocaleString('ja-JP')}～${yen(hi * size)}` : `15 人約 ${yen(lo * size)}`;
  return { text: head, estimate: `${est}${/～$/.test(head.trim()) || /起/.test(head) ? ' 起' : ''}${night}` };
}

// ---------- 一行小提醒 ----------

/** 只在講評分可不可靠的缺點（「Google 只有 28 則」）不當小提醒 */
const RATING_ONLY = /^(?:Google|楽天|食べログ|じゃらん|評論|口コミ|心得)[^，、]*(?:\d|分|則|不公開|偏低|少)/;

/** 小提醒：要預約（幾天前）、不能預約，再接缺點的第一句（講評分的跳過） */
export function tipLine(p: Place): string | null {
  const r = obj(p.raw.reservation);
  const con = (p.summary?.cons ?? []).map(shortReason).find((c) => c && !RATING_ONLY.test(c)) ?? null;
  let head: string | null = null;
  if (p.type === 'restaurant' && r.required === true) head = typeof r.leadDays === 'number' ? `要預約（${r.leadDays} 天前）` : '要預約';
  else if (p.type === 'restaurant' && r.accepted === 'no') head = '不能預約';
  if (!head) return con;
  if (!con || con.includes('預約')) return con ?? head;
  return `${head}；${con}`;
}
