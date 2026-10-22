// 小卡片的關鍵標章（interaction-design §4：1～2 個，例如「可容納 15 人」「需預約」「週二休」）。

import { closedDaysLabel } from './hours.ts';
import type { Place } from '../data/types.ts';

export interface Badge {
  label: string;
  tone: 'good' | 'warn' | 'info';
}

function get(obj: unknown, ...path: string[]): unknown {
  let v: unknown = obj;
  for (const k of path) v = v && typeof v === 'object' ? (v as Record<string, unknown>)[k] : undefined;
  return v;
}

export function placeBadges(p: Place, max = 2): Badge[] {
  const out: Badge[] = [];
  const fit15 = get(p.raw, 'group', 'fit15');
  if (p.type === 'restaurant') {
    if (fit15 === 'yes') out.push({ label: '可容納 15 人', tone: 'good' });
    else if (fit15 === 'split') out.push({ label: '15 人要分桌', tone: 'info' });
    const accepted = get(p.raw, 'reservation', 'accepted');
    if (accepted === 'no') out.push({ label: '不能預約', tone: 'warn' });
    else if (accepted === 'yes' || accepted === 'groups-only') out.push({ label: '可預約', tone: 'info' });
  }
  if (p.type === 'lodging') {
    if (get(p.raw, 'group', 'wholeRental') === true) out.push({ label: '包棟', tone: 'good' });
    const meals = get(p.raw, 'meals');
    if (meals === 'dinner+breakfast') out.push({ label: '一泊二食', tone: 'info' });
    else if (meals === 'none') out.push({ label: '不含餐', tone: 'warn' });
  }
  if (p.type === 'spot') {
    if (get(p.raw, 'indoor') === true) out.push({ label: '室內', tone: 'info' });
    if (get(p.raw, 'accessibility', 'stairs') === '多') out.push({ label: '階梯多', tone: 'warn' });
  }
  const closed = closedDaysLabel(p.hours);
  if (closed) out.push({ label: closed, tone: 'warn' });
  return out.slice(0, max);
}
