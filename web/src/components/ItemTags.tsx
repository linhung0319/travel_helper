// 時間軸卡片名稱下面那一排標籤（設計 §2.1）：照 visit.tags 依分組（用餐、誰去、安排）畫小圓角膠囊，預約狀態放最後。
// 編輯中點那一排（有標籤才有；沒有標籤的從 ⋯ 選單的「標籤」加）打開 TagPopover：每組一列、可以多選，點了立刻存、彈窗不關（存檔中按鈕先不能點）。
// 回住宿那張宿的卡用「這晚的方案」（LodgingPlanPopover，三選一、再點取消＝照住宿資料）；照資料時字是淡色。
// 出發那張宿的卡只顯示前一晚的方案（唯讀）。一般模式標籤只看、不能點。分組、互斥、哪種卡有哪幾組寫在 shared/tagOptions.ts。
// 存檔的 toggleVisitTag、pickLodgingPlan 也給手機版的標籤面板（mobile/TagSheet.tsx）用。

import { useRef, type CSSProperties } from 'react';
import { setLodging, setTags, type LodgingMeals, type TagId } from '@travel-helper/engine';
import type { ItineraryDay, VisitItem } from '@travel-helper/engine/types';
import { shared } from '../appShared.ts';
import { useApp, useData, useShared } from '../hooks.ts';
import { findItemRef } from '../lib/planView.ts';
import { shortDayLabel } from '../lib/trip.ts';
import { LODGING_PLANS, TAG_GROUPS, TAG_LABELS, tagGroupsFor, toggleLodgingPlan, toggleTag, type TagCardKind, type TagGroup } from '../shared/tagOptions.ts';
import type { Place } from '../data/types.ts';
import { Popover } from './Popover.tsx';
import { Icon } from './Icon.tsx';
import { ReservationTag } from './Reservations.tsx';

/** 地點類型 → 標籤用的卡片種類（景、餐、站以外都當自訂的點） */
export function tagKindOf(type: Place['type'] | null | undefined): TagCardKind {
  return type === 'spot' || type === 'restaurant' || type === 'station' ? type : 'custom';
}

/** 分組的顏色變數（膠囊、彈窗裡選了的按鈕都用） */
const groupStyle = (g: TagGroup) => ({ '--tag-bg': g.bg, '--tag-fg': g.fg }) as CSSProperties;

const groupOf = (t: TagId) => TAG_GROUPS.find((g) => g.tags.includes(t))!;

/** 切換卡片的一個標籤（網頁版彈窗、手機版面板共用）；用存的當下的行程算，連點兩下也不會用到舊的 */
export function toggleVisitTag(visit: VisitItem, tag: TagId) {
  const on = (visit.tags ?? []).includes(tag);
  void shared.changeItinerary(
    (it) => {
      const ref = findItemRef(it, visit.id);
      const cur = ref?.item.type === 'visit' ? (ref.item.tags ?? []) : [];
      return setTags(it, visit.id, toggleTag(cur, tag));
    },
    on ? `取消${TAG_LABELS[tag]}` : `標成${TAG_LABELS[tag]}`,
  );
}

/** 選這晚的方案（再點選了的那個＝回到照住宿資料）；cur 是畫面上現在的值，只用在存檔的說明 */
export function pickLodgingPlan(date: string, cur: LodgingMeals | null, v: LodgingMeals) {
  const next = toggleLodgingPlan(cur, v);
  void shared.changeItinerary(
    (it) => {
      const d = it.days.find((x) => x.date === date)!;
      return setLodging(it, date, d.lodging, toggleLodgingPlan(d.lodgingMeals ?? null, v));
    },
    `${shortDayLabel(date)} 這晚的方案：${next ? LODGING_PLANS.find((x) => x.value === next)!.label : '照住宿資料'}`,
  );
}

/** 標籤彈窗：每組一列膠囊按鈕（多選；誰去互斥）。點了立刻存，彈窗不關 */
export function TagPopover({ visit, kind, anchor, onClose }: { visit: VisitItem; kind: TagCardKind; anchor: HTMLElement | null; onClose: () => void }) {
  const have = visit.tags ?? [];
  const toggle = (tag: TagId) => toggleVisitTag(visit, tag);
  // 存檔中再點會被擋下來（還在儲存上一個修改）：先不能點（同手機版的 TagSheet）
  const saving = useShared((s) => s.saving);
  return (
    <Popover anchor={anchor} open onClose={onClose} testId="tag-popover">
      <div className="tag-popover" role="menu" aria-label="標籤">
        {tagGroupsFor(kind).map((g) => (
          <div key={g.id} className="tag-popover-group" role="group" aria-label={g.title} style={groupStyle(g)}>
            <span className="tag-popover-title">
              <Icon name={g.icon} size={16} /> {g.title}
            </span>
            <span className="tag-popover-opts">
              {g.tags.map((t) => (
                <button key={t} type="button" role="menuitemcheckbox" aria-checked={have.includes(t)} className={`tag-opt ${have.includes(t) ? 'on' : ''}`} disabled={saving} onClick={() => toggle(t)} data-testid={`tag-opt-${t}`}>
                  {TAG_LABELS[t]}
                </button>
              ))}
            </span>
          </div>
        ))}
      </div>
    </Popover>
  );
}

/** 名稱下面的標籤那一排。open／onOpenChange 由卡片管（⋯ 選單也會打開） */
export function ItemTags({ visit, kind, date, placeId, open, onOpenChange }: { visit: VisitItem; kind: TagCardKind; date: string; placeId: string | null; open: boolean; onOpenChange: (open: boolean) => void }) {
  const planning = useApp((s) => s.planning);
  const anchor = useRef<HTMLSpanElement>(null);
  const tags = (visit.tags ?? []).map((t) => (
    <span key={t} className="badge item-tag" style={groupStyle(groupOf(t))} data-tag={t} data-testid="item-tag">
      {TAG_LABELS[t]}
    </span>
  ));
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
  // 已經有標籤的點標籤那一排打開標籤彈窗；沒有標籤的不畫「＋ 標籤」，從 ⋯ 加（彈窗照樣掛在這一排）
  return (
    <span className="item-tags editable" data-testid="item-tags" ref={anchor}>
      {tags.length > 0 && (
        <button type="button" className="tag-edit" aria-haspopup="menu" aria-expanded={open} aria-label="改標籤" onClick={() => onOpenChange(!open)} data-testid="tag-edit">
          {tags}
        </button>
      )}
      {reservation}
      {open && <TagPopover visit={visit} kind={kind} anchor={anchor.current} onClose={() => onOpenChange(false)} />}
    </span>
  );
}

/** 這晚的方案：lodgingMeals 有填用它（from day），沒填照住宿資料的 meals（from data）；「看方案」、不知道就沒有 */
export function lodgingPlanShown(day: ItineraryDay | undefined, p: Place | undefined): { value: LodgingMeals; label: string; from: 'day' | 'data' } | null {
  const own = day?.lodgingMeals ?? null;
  const value = (own ?? p?.raw.meals ?? null) as LodgingMeals | 'varies' | null;
  const plan = LODGING_PLANS.find((x) => x.value === value);
  return plan ? { value: plan.value, label: plan.label, from: own ? 'day' : 'data' } : null;
}

/** 「這晚的方案」彈窗：三選一，再點選了的那個＝回到照住宿資料（null）。住宿本身不變 */
export function LodgingPlanPopover({ date, anchor, onClose }: { date: string; anchor: HTMLElement | null; onClose: () => void }) {
  const cur = useData((s) => s.itinerary?.days.find((d) => d.date === date)?.lodgingMeals ?? null);
  const pick = (v: LodgingMeals) => pickLodgingPlan(date, cur, v);
  const saving = useShared((s) => s.saving);
  return (
    <Popover anchor={anchor} open onClose={onClose} testId="lodging-plan-popover">
      <div className="tag-popover" role="menu" aria-label="這晚的方案">
        <div className="tag-popover-group tag-lodging-group" role="group" aria-label="這晚的方案">
          <span className="tag-popover-title ic-text">
            <Icon name="bed" size={16} /> 這晚的方案
          </span>
          <span className="tag-popover-opts">
            {LODGING_PLANS.map((x) => (
              <button key={x.value} type="button" role="menuitemradio" aria-checked={cur === x.value} className={`tag-opt ${cur === x.value ? 'on' : ''}`} disabled={saving} onClick={() => pick(x.value)} data-testid={`lodging-plan-${x.value}`}>
                {x.label}
              </button>
            ))}
          </span>
        </div>
      </div>
    </Popover>
  );
}

/**
 * 宿的卡的標籤那一排：這晚的方案＋預約狀態。
 * editable（回住宿那張、編輯中）時點那一排打開 LodgingPlanPopover；出發那張傳前一晚的 day，唯讀、不畫預約
 */
export function LodgingTags({ day, place, reservationDate, editable, open, onOpenChange }: { day: ItineraryDay | undefined; place: Place | undefined; reservationDate: string | null; editable: boolean; open: boolean; onOpenChange: (open: boolean) => void }) {
  const anchor = useRef<HTMLSpanElement>(null);
  const shown = lodgingPlanShown(day, place);
  const tag = shown && (
    <span className={`badge tag-lodging ${shown.from === 'data' ? 'from-data' : ''}`} data-from={shown.from} title={shown.from === 'data' ? '照住宿資料' : undefined} data-testid="lodging-plan-tag">
      {shown.label}
    </span>
  );
  const reservation = place && reservationDate ? <ReservationTag date={reservationDate} placeId={place.id} /> : null;
  if (!editable || !day)
    return (
      <span className="item-tags">
        {tag}
        {reservation}
      </span>
    );
  return (
    <span className="item-tags editable" ref={anchor}>
      {tag && (
        <button type="button" className="tag-edit" aria-haspopup="menu" aria-expanded={open} aria-label="改這晚的方案" onClick={() => onOpenChange(!open)} data-testid="tag-edit">
          {tag}
        </button>
      )}
      {reservation}
      {open && <LodgingPlanPopover date={day.date} anchor={anchor.current} onClose={() => onOpenChange(false)} />}
    </span>
  );
}
