// 手機版編輯中的「⋯」底部動作面板（第六輪 §2.3、§3.5）：mobileStore.actions 有值就畫，蓋在行程頁最上面（一次只有一層，§3.0）。
// 上方是暗的（m-sheet-dim），點暗處或把面板往下拉就關。最上面一列是這張卡的縮圖和名稱，下面每個動作一列（至少 44px，testid m-action-{id}），
// 動作照 cardActionRun.ts 的 menuItems（順序是 shared/cardActions.ts，surface 'mobile' 多一個「改停留時間」；和網頁版的 ⋯ 選單同一份），組與組之間一條分隔線；「移到{組名}」每組一列。
// 點了交給 runCardAction（components/cardActionRun.ts）；要開子畫面的（標籤、移到第幾天、這晚的方案、改停留時間、調整順序）在同一個面板裡換內容，
// 左上角「‹」回到動作清單。改停留時間是 −／＋（一次 15 分，最少 15 分，照網頁版），旁邊寫現在的停留時間。
// 調整順序是 shared/ui/ReorderPanel.tsx（上移、下移可以連按，面板不關；合併好了才關）。

import { Fragment, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { setStay, type DayPlan, type TimelineEntry } from '@travel-helper/engine';
import { shared } from '../appShared.ts';
import { useData, usePlan, useShared } from '../hooks.ts';
import { dayPlanOf } from '../planStore.ts';
import { cardTime, formatStay } from '../lib/planView.ts';
import { ACTION_ICONS, ACTION_LABELS, type ActionId } from '../shared/cardActions.ts';
import { menuItems, runCardAction, type ActionTarget } from '../components/cardActionRun.ts';
import { Icon, type IconName } from '../components/Icon.tsx';
import { Thumb } from './Thumb.tsx';
import { mobileStore, useMobile, type ActionSheetSpec, type ActionView } from './mobileStore.ts';
import { TagSheet, LodgingPlanSheet } from './TagSheet.tsx';
import { MoveDaySheet } from './MoveDaySheet.tsx';
import { ReorderPanel } from '../shared/ui/ReorderPanel.tsx';

/** 在同一個面板裡換內容的動作 → 子畫面 */
const SUB_VIEWS: Partial<Record<ActionId, Exclude<ActionView, 'list'>>> = {
  tags: 'tags',
  move: 'move',
  'lodging-plan': 'lodging-plan',
  stay: 'stay',
  'free-length': 'stay',
  reorder: 'reorder',
};

/** 往下拉超過這個距離（px）就關 */
const CLOSE_DRAG = 60;

/** 一步加減的分鐘（照網頁版的 −15／＋15） */
const STAY_STEP = 15;

/** 子畫面的標題 */
const VIEW_TITLES: Record<Exclude<ActionView, 'list'>, string> = {
  tags: ACTION_LABELS.tags,
  move: '移到第幾天',
  'lodging-plan': ACTION_LABELS['lodging-plan'],
  stay: ACTION_LABELS.stay,
  reorder: ACTION_LABELS.reorder,
};

/** 子畫面標題前面的圖示 */
const VIEW_ICONS: Record<Exclude<ActionView, 'list'>, IconName> = { tags: 'tag', move: 'calendar-move', 'lodging-plan': 'bed', stay: 'clock', reorder: 'sort' };

/** 子畫面的標題：自由時間的長度是「改時間長度」（ACTION_LABELS），不是改停留時間 */
const viewTitle = (view: Exclude<ActionView, 'list'>, spec: ActionSheetSpec) => (view === 'stay' && spec.ctx.kind === 'free' ? ACTION_LABELS['free-length'] : VIEW_TITLES[view]);

const close = () => mobileStore.getState().closeActions();

/** 這天時間軸上某個項目的那一列（分組裡的也找） */
function entryOf(day: DayPlan | null, itemId: string | undefined): TimelineEntry | null {
  if (!day || !itemId) return null;
  for (const e of day.entries) {
    if (e.itemId === itemId) return e;
    for (const g of e.groups ?? []) {
      const x = g.entries.find((y) => y.itemId === itemId);
      if (x) return x;
    }
  }
  return null;
}

/** 這張卡現在的停留分鐘（引擎算好的）；不知道是 null */
function useStayMinutes(target: ActionTarget): number | null {
  const entry = usePlan((s) => entryOf(dayPlanOf(s.plan, target.date), target.itemId));
  return entry ? cardTime(entry).stay : null;
}

/** ⏱ 改停留時間（自由時間是時間長度）：−／＋ 一次 15 分，旁邊寫現在的停留時間 */
function StaySheet({ target }: { target: ActionTarget }) {
  const minutes = useStayMinutes(target);
  const saving = useShared((s) => s.saving);
  const itemId = target.itemId;
  if (!itemId || minutes == null) return <p className="muted small">這張卡沒有停留時間。</p>;
  const change = (d: number) => {
    const next = Math.max(STAY_STEP, minutes + d);
    void shared.changeItinerary((it) => setStay(it, itemId, next), `停留改成 ${formatStay(next)}`);
  };
  return (
    <div className="m-stay" data-testid="m-stay-sheet">
      <button type="button" className="m-stay-step" aria-label={`少 ${STAY_STEP} 分`} disabled={saving || minutes <= STAY_STEP} onClick={() => change(-STAY_STEP)} data-testid="m-stay-minus">
        −
      </button>
      <span className="m-stay-now" data-testid="m-stay-now">
        {formatStay(minutes)}
      </span>
      <button type="button" className="m-stay-step" aria-label={`多 ${STAY_STEP} 分`} disabled={saving} onClick={() => change(STAY_STEP)} data-testid="m-stay-plus">
        ＋
      </button>
    </div>
  );
}

/** 動作清單：每組之間一條分隔線 */
function ActionList({ spec, onView }: { spec: ActionSheetSpec; onView: (v: Exclude<ActionView, 'list'>) => void }) {
  const stay = useStayMinutes(spec.target);
  const groups = menuItems(spec.ctx, spec.target);
  const run = (id: ActionId, t: ActionTarget) => {
    const view = SUB_VIEWS[id];
    if (view) return onView(view);
    close();
    void runCardAction(id, t, { openTags: () => {}, openMove: () => {}, openLodgingPlan: () => {} });
  };
  return (
    <div className="m-action-list" role="menu" aria-label={`${spec.name} 的動作`}>
      {groups.map((group, gi) => (
        <Fragment key={gi}>
          {gi > 0 && <hr className="m-action-sep" />}
          {group.map((m) => (
            <button
              key={m.key}
              type="button"
              role="menuitem"
              className={`m-action ${m.danger ? 'danger' : ''}`}
              disabled={spec.disabled?.includes(m.id)}
              onClick={() => run(m.id, m.target)}
              data-testid={`m-action-${m.id}`}
              {...(m.group ? { 'data-group': m.group } : {})}
            >
              <Icon name={ACTION_ICONS[m.id]} size={20} />
              <span className="m-ellipsis">{m.text}</span>
              {(m.id === 'stay' || m.id === 'free-length') && stay != null && <small className="m-action-note">{formatStay(stay)}</small>}
            </button>
          ))}
        </Fragment>
      ))}
    </div>
  );
}

/** 子畫面的內容 */
function SubView({ view, spec }: { view: Exclude<ActionView, 'list'>; spec: ActionSheetSpec }) {
  const { target } = spec;
  if (view === 'tags') return target.itemId ? <TagSheet itemId={target.itemId} /> : null;
  if (view === 'lodging-plan') return <LodgingPlanSheet date={target.date} />;
  if (view === 'stay') return <StaySheet target={target} />;
  if (view === 'reorder') return target.itemId ? <ReorderPanel itemId={target.itemId} onDone={close} /> : null;
  return <MoveDaySheet itemId={target.candidateId == null ? target.itemId : undefined} candidateId={target.candidateId} onDone={close} />;
}

/** 往下拉面板就關：跟著手指往下移，放開時超過 CLOSE_DRAG 就關，不然彈回去 */
function useDragToClose(sheetRef: React.RefObject<HTMLElement | null>) {
  const drag = useRef<{ y: number; id: number } | null>(null);
  const onPointerDown = (e: ReactPointerEvent<HTMLElement>) => {
    e.currentTarget.setPointerCapture?.(e.pointerId);
    drag.current = { y: e.clientY, id: e.pointerId };
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLElement>) => {
    const d = drag.current;
    const sheet = sheetRef.current;
    if (!d || !sheet || e.pointerId !== d.id) return;
    sheet.style.transform = `translateY(${Math.max(0, e.clientY - d.y)}px)`;
  };
  const end = (e: ReactPointerEvent<HTMLElement>) => {
    const d = drag.current;
    drag.current = null;
    const sheet = sheetRef.current;
    if (!d || e.pointerId !== d.id) return;
    if (sheet) sheet.style.transform = '';
    if (e.clientY - d.y > CLOSE_DRAG) close();
  };
  return { onPointerDown, onPointerMove, onPointerUp: end, onPointerCancel: end };
}

/** 面板本身（spec 換了就從頭開始：key 是卡片） */
function Sheet({ spec }: { spec: ActionSheetSpec }) {
  const [view, setView] = useState<ActionView>(spec.view ?? 'list');
  const place = useData((s) => (spec.placeId ? s.byId.get(spec.placeId) : undefined));
  const sheetRef = useRef<HTMLElement>(null);
  const drag = useDragToClose(sheetRef);
  return (
    <div className="m-asheet-root">
      <div className="m-sheet-dim" data-testid="m-sheet-dim" onClick={close} aria-hidden />
      <section className="m-sheet m-asheet" ref={sheetRef} role="dialog" aria-label={`${spec.name} 的動作`} data-testid="m-action-sheet" data-view={view}>
        <div className="m-asheet-grab" data-testid="m-action-grab" aria-label="往下拉關掉" {...drag}>
          <span aria-hidden />
        </div>
        {view === 'list' ? (
          <div className="m-asheet-head" data-testid="m-action-head">
            {place ? <Thumb place={place} size={36} /> : <span className="m-thumb m-thumb-square m-thumb-fallback m-asheet-nothumb" aria-hidden data-testid="m-thumb-fallback" />}
            <strong className="m-ellipsis">{spec.name}</strong>
          </div>
        ) : (
          <div className="m-asheet-head" data-testid="m-action-head">
            <button type="button" className="m-back" aria-label="回到動作清單" onClick={() => setView('list')} data-testid="m-sheet-back">
              <Icon name="back" size={20} />
            </button>
            <Icon name={VIEW_ICONS[view]} size={20} />
            <strong className="m-ellipsis">{viewTitle(view, spec)}</strong>
            <span className="m-asheet-sub muted small m-ellipsis">{spec.name}</span>
          </div>
        )}
        <div className="m-asheet-body">{view === 'list' ? <ActionList spec={spec} onView={setView} /> : <SubView view={view} spec={spec} />}</div>
      </section>
    </div>
  );
}

/** 行程頁的動作面板：編輯中才有；換天、結束編輯時 TripPage 會關掉 */
export function ActionSheet() {
  const spec = useMobile((s) => s.actions);
  // 面板開著時按 Esc（接鍵盤）也關
  useEffect(() => {
    if (!spec) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [spec]);
  if (!spec) return null;
  const key = `${spec.ctx.kind}:${spec.target.itemId ?? spec.target.candidateId ?? spec.target.date}`;
  return <Sheet key={key} spec={spec} />;
}
