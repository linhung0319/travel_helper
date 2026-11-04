// 小卡片的關鍵標章（interaction-design §4：1～2 個，例如「15 人能坐一起」「需預約」「週二休」）。
// 餐廳的 15 人、住宿的住法和書架小卡的第二行同一個寫法（T66，interaction-design §32）。

import { closedDaysLabel } from './hours.ts';
import type { Place } from '../data/types.ts';
import { SLEEPS_GROUP, WEATHER_LABELS, placeFit15, placeStay, placeWeather } from './filter.ts';
import { LODGING_KIND_LABELS } from './labels.ts';

export interface Badge {
  label: string;
  tone: 'good' | 'warn' | 'info';
}

function get(obj: unknown, ...path: string[]): unknown {
  let v: unknown = obj;
  for (const k of path) v = v && typeof v === 'object' ? (v as Record<string, unknown>)[k] : undefined;
  return v;
}

/** 餐廳 15 人的那句（T66）：能坐一起、要分桌、還沒查（沒寫也算）、坐不下；不是餐廳是 null */
export function fit15Caption(p: Place): Badge | null {
  if (p.type !== 'restaurant') return null;
  const fit = placeFit15(p);
  if (fit === 'yes') return { label: '15 人能坐一起', tone: 'good' };
  if (fit === 'split') return { label: '15 人要分桌', tone: 'info' };
  if (fit === 'no') return { label: '坐不下 15 人', tone: 'warn' };
  return { label: '15 人還沒查', tone: 'info' };
}

const COUNT_ZH = ['', '一', '兩', '三', '四', '五', '六', '七', '八', '九', '十'];

/**
 * 住宿的住法那句（T66）：「旅館 · 全團住得下」「包棟 · 16 人」「包棟 · 8 人 · 要兩棟」「民宿 · 4 間房」「飯店 · 房數不明」。
 * 不是住宿是 null
 */
export function stayCaption(p: Place): Badge | null {
  const stay = placeStay(p);
  if (!stay) return null;
  const g = (p.raw.group as Record<string, unknown> | undefined) ?? {};
  const kind = typeof p.raw.kind === 'string' ? p.raw.kind : null;
  const kindLabel = !kind || kind === 'other' ? '住宿' : (LODGING_KIND_LABELS[kind] ?? '住宿');
  const max = typeof g.maxGuests === 'number' && g.maxGuests > 0 ? g.maxGuests : null;
  if (stay === 'whole') return { label: `包棟 · ${max} 人`, tone: 'good' };
  if (stay === 'hotel') return { label: `${kindLabel} · 全團住得下`, tone: 'good' };
  if (g.wholeRental === true) {
    if (!max) return { label: '包棟 · 人數不明', tone: 'info' };
    const n = Math.ceil(SLEEPS_GROUP / max);
    return { label: `包棟 · ${max} 人 · 要${COUNT_ZH[n] ?? n}棟`, tone: 'info' };
  }
  const rooms = typeof g.totalRooms === 'number' ? g.totalRooms : null;
  return { label: `${kindLabel} · ${rooms === null ? '房數不明' : `${rooms} 間房`}`, tone: 'info' };
}

/** 住宿的餐食那段（書架小卡接在住法後面）：一泊二食、可選、含早餐、不含餐；沒寫是 null */
export function mealsCaption(p: Place): string | null {
  const meals = p.raw.meals;
  if (meals === 'dinner+breakfast') return '一泊二食';
  if (meals === 'varies') return '可選';
  if (meals === 'breakfast') return '含早餐';
  if (meals === 'none') return '不含餐';
  return null;
}

export function placeBadges(p: Place, max = 2): Badge[] {
  const out: Badge[] = [];
  if (p.type === 'restaurant') {
    out.push(fit15Caption(p)!);
    const accepted = get(p.raw, 'reservation', 'accepted');
    if (accepted === 'no') out.push({ label: '不能預約', tone: 'warn' });
    else if (accepted === 'yes' || accepted === 'groups-only') out.push({ label: '可預約', tone: 'info' });
  }
  if (p.type === 'lodging') {
    out.push(stayCaption(p)!);
    const meals = get(p.raw, 'meals');
    if (meals === 'dinner+breakfast') out.push({ label: '一泊二食', tone: 'info' });
    else if (meals === 'none') out.push({ label: '不含餐', tone: 'warn' });
  }
  if (p.type === 'spot') {
    const w = placeWeather(p);
    if (w === 'indoor' || w === 'covered') out.push({ label: WEATHER_LABELS[w], tone: 'info' });
    if (get(p.raw, 'accessibility', 'stairs') === '多') out.push({ label: '階梯多', tone: 'warn' });
  }
  const closed = closedDaysLabel(p.hours);
  if (closed) out.push({ label: closed, tone: 'warn' });
  return out.slice(0, max);
}
