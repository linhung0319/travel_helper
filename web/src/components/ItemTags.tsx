// 時間軸卡片名稱下面那一排 tag（設計 §7）：用餐（早餐／午餐／晚餐／點心）在前、吃法（全員一起／分開吃）在後、預約狀態最後。
// tag 都是使用者自己標的（引擎猜的用餐不顯示）。規劃模式下點那一排（或 ⋯ 選單的「標用餐」「標吃法」）跳出選單改；一般模式只看。

import { useEffect, useRef } from 'react';
import { setDining, setMeal, type DiningStyle, type MealKind } from '@travel-helper/engine';
import type { VisitItem } from '@travel-helper/engine/types';
import { shared } from '../appShared.ts';
import { useApp, useData } from '../hooks.ts';
import { ReservationTag } from './Reservations.tsx';

export const MEAL_LABELS: Record<MealKind, string> = { breakfast: '早餐', lunch: '午餐', dinner: '晚餐', snack: '點心' };
export const DINING_LABELS: Record<DiningStyle, string> = { together: '全員一起', separate: '分開吃' };
const MEALS: MealKind[] = ['breakfast', 'lunch', 'dinner', 'snack'];
const DININGS: DiningStyle[] = ['together', 'separate'];

/** 這張卡片有沒有餐廳（有才能標吃法） */
export function useHasRestaurant(visit: VisitItem | null): boolean {
  return useData((s) => !!visit?.options.some((o) => s.byId.get(o.place)?.type === 'restaurant'));
}

/** 用餐、吃法的選單；選了就存（後面的時間不受影響） */
function TagMenu({ visit, mealTag, onClose }: { visit: VisitItem; mealTag: MealKind | null; onClose: () => void }) {
  const ref = useRef<HTMLSpanElement>(null);
  const hasRestaurant = useHasRestaurant(visit);
  const dining = visit.dining ?? null;
  useEffect(() => {
    const close = (e: PointerEvent) => {
      if (!ref.current?.parentElement?.contains(e.target as Node)) onClose();
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [onClose]);
  const pickMeal = (m: MealKind | null) => {
    onClose();
    if (m === mealTag) return;
    void shared.changeItinerary((it) => setMeal(it, visit.id, m), m ? `標成${MEAL_LABELS[m]}` : '不標用餐');
  };
  const pickDining = (d: DiningStyle | null) => {
    onClose();
    if (d === dining) return;
    void shared.changeItinerary((it) => setDining(it, visit.id, d), d ? `標成${DINING_LABELS[d]}` : '不標吃法');
  };
  const option = (label: string, on: boolean, onClick: () => void, testId: string) => (
    <button key={label} type="button" role="menuitemradio" aria-checked={on} className={`pill small-pill ${on ? 'on' : ''}`} onClick={onClick} data-testid={testId}>
      {label}
    </button>
  );
  return (
    <span className="menu tag-menu" role="menu" ref={ref} data-testid="tag-menu">
      <span className="tag-menu-group">
        <span className="muted small">用餐</span>
        {MEALS.map((m) => option(MEAL_LABELS[m], mealTag === m, () => pickMeal(m), `tag-meal-${m}`))}
        {option('不標', !mealTag, () => pickMeal(null), 'tag-meal-none')}
      </span>
      {hasRestaurant && (
        <span className="tag-menu-group">
          <span className="muted small">吃法</span>
          {DININGS.map((d) => option(DINING_LABELS[d], dining === d, () => pickDining(d), `tag-dining-${d}`))}
          {option('不標', !dining, () => pickDining(null), 'tag-dining-none')}
        </span>
      )}
    </span>
  );
}

/** 名稱下面的 tag 那一排。open／onOpenChange 由卡片管（⋯ 選單也會打開） */
export function ItemTags({ visit, mealTag, date, placeId, open, onOpenChange }: { visit: VisitItem; mealTag: MealKind | null; date: string; placeId: string | null; open: boolean; onOpenChange: (open: boolean) => void }) {
  const planning = useApp((s) => s.planning);
  const dining = visit.dining ?? null;
  const tags = (
    <>
      {mealTag && (
        <span className="badge tag-meal" data-testid="tag-meal">
          {MEAL_LABELS[mealTag]}
        </span>
      )}
      {dining && (
        <span className="badge tag-dining" data-testid="tag-dining">
          {DINING_LABELS[dining]}
        </span>
      )}
    </>
  );
  const reservation = placeId ? <ReservationTag date={date} placeId={placeId} /> : null;
  if (!planning) {
    // 沒有 tag 時這一排是空的（CSS 的 :empty 藏起來）
    return (
      <span className="item-tags" data-testid="item-tags">
        {tags}
        {reservation}
      </span>
    );
  }
  return (
    <span className="item-tags editable" data-testid="item-tags">
      <button type="button" className="tag-edit" aria-expanded={open} aria-label="改用餐、吃法的標籤" onClick={() => onOpenChange(!open)} data-testid="tag-edit">
        {tags}
        {!mealTag && !dining && <span className="muted small">＋ 標籤</span>}
      </button>
      {reservation}
      {open && <TagMenu visit={visit} mealTag={mealTag} onClose={() => onOpenChange(false)} />}
    </span>
  );
}
