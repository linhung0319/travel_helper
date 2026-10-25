// 時間軸卡片名稱下面那一排 tag（設計 §7）：用餐（早餐／午餐／晚餐／點心）在前、吃法（全員／分組）在後、預約狀態最後。
// tag 都是使用者自己標的（引擎猜的用餐不顯示）。編輯中點那一排（或 ⋯ 選單的「標用餐」「標吃法」）跳出選單改；一般模式只看。
// 暫時版（第六輪 Task 1）：只求能編譯，每次切換一個標籤；整個重做是 Task 3。

import { useEffect, useRef } from 'react';
import { setTags, type MealKind, type TagId } from '@travel-helper/engine';
import type { VisitItem } from '@travel-helper/engine/types';
import { shared } from '../appShared.ts';
import { useApp, useData } from '../hooks.ts';
import { ReservationTag } from './Reservations.tsx';

export const MEAL_LABELS: Record<MealKind, string> = { breakfast: '早餐', lunch: '午餐', dinner: '晚餐', snack: '點心' };
export const DINING_LABELS: Record<'all' | 'groups', string> = { all: '全員', groups: '分組' };
const MEALS: MealKind[] = ['breakfast', 'lunch', 'dinner', 'snack'];
const DININGS: ('all' | 'groups')[] = ['all', 'groups'];


/** 這張卡片有沒有餐廳（有才能標吃法） */
export function useHasRestaurant(visit: VisitItem | null): boolean {
  return useData((s) => !!visit?.options.some((o) => s.byId.get(o.place)?.type === 'restaurant'));
}

/** 用餐、吃法的選單；選了就存（後面的時間不受影響） */
function TagMenu({ visit, mealTags, onClose }: { visit: VisitItem; mealTags: MealKind[]; onClose: () => void }) {
  const ref = useRef<HTMLSpanElement>(null);
  const hasRestaurant = useHasRestaurant(visit);
  const have = visit.tags ?? [];
  useEffect(() => {
    const close = (e: PointerEvent) => {
      if (!ref.current?.parentElement?.contains(e.target as Node)) onClose();
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [onClose]);
  /** 切換一個標籤（用餐、吃法各只留一個） */
  const toggle = (id: TagId | null, group: readonly string[], label: string) => {
    onClose();
    const on = id != null && have.includes(id);
    const rest = have.filter((t) => !group.includes(t));
    const next = id == null || on ? rest : [...rest, id];
    void shared.changeItinerary((it) => setTags(it, visit.id, next), id == null || on ? `不標${label}` : `標成${id in DINING_LABELS ? DINING_LABELS[id as 'all' | 'groups'] : MEAL_LABELS[id as MealKind]}`);
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
        {MEALS.map((m) => option(MEAL_LABELS[m], mealTags.includes(m), () => toggle(m, MEALS, '用餐'), `tag-meal-${m}`))}
        {option('不標', !mealTags.length, () => toggle(null, MEALS, '用餐'), 'tag-meal-none')}
      </span>
      {hasRestaurant && (
        <span className="tag-menu-group">
          <span className="muted small">吃法</span>
          {DININGS.map((d) => option(DINING_LABELS[d], have.includes(d), () => toggle(d, DININGS, '吃法'), `tag-dining-${d}`))}
          {option('不標', !DININGS.some((d) => have.includes(d)), () => toggle(null, DININGS, '吃法'), 'tag-dining-none')}
        </span>
      )}
    </span>
  );
}

/** 名稱下面的 tag 那一排。open／onOpenChange 由卡片管（⋯ 選單也會打開） */
export function ItemTags({ visit, mealTags, date, placeId, open, onOpenChange }: { visit: VisitItem; mealTags: MealKind[]; date: string; placeId: string | null; open: boolean; onOpenChange: (open: boolean) => void }) {
  const planning = useApp((s) => s.planning);
  const dinings = DININGS.filter((d) => visit.tags?.includes(d));
  const tags = (
    <>
      {mealTags.map((m) => (
        <span key={m} className="badge tag-meal" data-testid="tag-meal">
          {MEAL_LABELS[m]}
        </span>
      ))}
      {dinings.map((d) => (
        <span key={d} className="badge tag-dining" data-testid="tag-dining">
          {DINING_LABELS[d]}
        </span>
      ))}
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
        {!mealTags.length && !dinings.length && <span className="muted small">＋ 標籤</span>}
      </button>
      {reservation}
      {open && <TagMenu visit={visit} mealTags={mealTags} onClose={() => onOpenChange(false)} />}
    </span>
  );
}
