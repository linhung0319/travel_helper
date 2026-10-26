// 編輯（interaction-design §6、§11、第五輪設計 §5）：「✏️ 編輯這天」按鈕、進入前確認、時間軸面板最上面的藍條、第一次的提示、閒置自動結束；
// 快照列表與復原、「排進行程」、「移到第 _ 天」（卡片、自己加的候選）、別人改過了的提示。

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { describeChanges, diffItinerary } from '@travel-helper/engine';
import { appStore } from '../store.ts';
import { shared } from '../appShared.ts';
import { backend } from '../backend/index.ts';
import { useApp, useData, useShared, useUi } from '../hooks.ts';
import { closeDialog, openDialog, uiStore } from '../uiStore.ts';
import { DayGrid12 } from '../shared/ui/DayGrid12.tsx';
import { Icon } from './Icon.tsx';
import { Button } from '../shared/ui/Button.tsx';
import { dayLabel, isRedDay, shortDayLabel, tripDates } from '../lib/trip.ts';
import { findItemRef, itemsWithPlace } from '../lib/planView.ts';
import { stopsOn } from '../lib/itinerary.ts';
import type { Snapshot } from '../backend/types.ts';
import { Dialog, MemberName, PlaceChip, stamp } from './common.tsx';
import { dayPanelShowing } from '../lib/editing.ts';
import { addPlaceToDay } from './addToDay.ts';
import { moveCandidateToDay, moveItemToDayAction } from './cardActionRun.ts';

const DATES = tripDates();

/** 日期列上的實心按鈕「編輯」：點了先確認；編輯中不顯示（離開用藍條的「完成」） */
export function PlanningToggle() {
  const planning = useApp((s) => s.planning);
  if (planning) return null;
  return (
    <Button kind="primary" size="sm" icon="pen" data-testid="planning-toggle" onClick={() => openDialog({ kind: 'planning' })}>
      編輯
    </Button>
  );
}

export function PlanningConfirmDialog() {
  const idle = useUi((s) => s.idleMinutes);
  return (
    <Dialog
      title="開始編輯？"
      onClose={closeDialog}
      testId="planning-dialog"
      footer={
        <>
          <button type="button" className="button" onClick={closeDialog}>
            取消
          </button>
          <button
            type="button"
            className="button primary"
            data-testid="planning-confirm"
            onClick={() => {
              appStore.getState().setPlanning(true);
              closeDialog();
            }}
          >
            開始編輯
          </button>
        </>
      }
    >
      <p>進入後可以修改<strong>大家共用的那一份行程</strong>：把這天的候選排進行程、拿掉別人加的候選、刪除、移到別天、換順序、改停留時間、復原快照。</p>
      <ul className="small">
        <li>每次修改前都會自動存一份快照，改錯了可以復原。</li>
        <li>{idle} 分鐘沒有動作會自動結束編輯。</li>
      </ul>
    </Dialog>
  );
}

// 面板上的藍條有沒有捲出畫面（IntersectionObserver 看的）。藍條捲出去時，地圖上方顯示精簡的「編輯中・完成」條。
let barOut = false;
const barListeners = new Set<() => void>();
function setBarOut(v: boolean) {
  if (barOut === v) return;
  barOut = v;
  for (const l of barListeners) l();
}
function subscribeBarOut(l: () => void) {
  barListeners.add(l);
  return () => barListeners.delete(l);
}
const getBarOut = () => barOut;

/** 編輯中但時間軸面板不在畫面上（探索、想去、詳情），或面板上的藍條捲出畫面：浮在地圖上方的精簡藍條，只有「完成」 */
export function EditingStrip() {
  const out = useSyncExternalStore(subscribeBarOut, getBarOut);
  const show = useApp((s) => s.planning && (out || !dayPanelShowing(s)));
  if (!show) return null;
  return (
    <div className="planning-bar planning-strip" data-testid="planning-strip">
      <strong className="ic-text">
        <Icon name="pen" size={16} /> 編輯中
      </strong>
      <span className="planning-bar-actions">
        <button type="button" className="planning-done" data-testid="planning-strip-done" onClick={() => appStore.getState().setPlanning(false)}>
          完成
        </button>
      </span>
    </div>
  );
}

/**
 * 編輯中，時間軸面板最上面的藍條：說明、儲存狀態、快照、完成（白底）。
 * 兩邊同一個樣子（§6.3）：墨色底，「編輯 2/3（三）」、快照、完成；compact（手機）不寫「第 N 版」
 */
export function PlanningBar({ title, className = '', compact = false }: { title?: string; className?: string; compact?: boolean } = {}) {
  const planning = useApp((s) => s.planning);
  const saving = useShared((s) => s.saving);
  const version = useShared((s) => s.version);
  // callback ref：編輯條出現時開始看它在不在畫面上，拿掉時停止並當作「在」（交給 dayPanelShowing 判斷）
  const watch = useCallback((el: HTMLDivElement | null) => {
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([e]) => setBarOut(!e.isIntersecting));
    io.observe(el);
    return () => {
      io.disconnect();
      setBarOut(false);
    };
  }, []);
  if (!planning) return null;
  return (
    <div className={`planning-bar ${className}`} data-testid="planning-bar" ref={watch}>
      <strong className="ic-text">
        <Icon name="pen" size={16} /> {title ?? '編輯中・改了會自動存，大家都看得到'}
      </strong>
      {!compact && <span className="planning-bar-status">{saving ? '儲存中…' : `第 ${version} 版`}</span>}
      <span className="planning-bar-actions">
        <button type="button" className="text-button" onClick={() => openDialog({ kind: 'snapshots' })} data-testid="snapshots-button">
          <Icon name="history" size={16} /> 快照
        </button>
        <button type="button" className="planning-done" data-testid="planning-done" onClick={() => appStore.getState().setPlanning(false)}>
          完成
        </button>
      </span>
    </div>
  );
}

const HINT_KEY = 'th-edit-hint-seen';

function hintSeen(): boolean {
  try {
    return localStorage.getItem(HINT_KEY) === '1';
  } catch {
    return false;
  }
}

/** 第一次進編輯：時間軸上方一行提示，✕ 關掉後記在 localStorage（讀寫失敗就當沒看過，下次再顯示） */
export function EditHint() {
  const planning = useApp((s) => s.planning);
  const [seen, setSeen] = useState(hintSeen);
  if (!planning || seen) return null;
  return (
    <p className="edit-hint small" data-testid="edit-hint">
      <span>拖 ⋮⋮ 調整順序；交通那行按「改」改方式、班次</span>
      <button
        type="button"
        className="text-button"
        aria-label="關掉提示"
        data-testid="edit-hint-close"
        onClick={() => {
          setSeen(true);
          try {
            localStorage.setItem(HINT_KEY, '1');
          } catch {
            // 存不了就算了
          }
        }}
      >
        <Icon name="close" size={16} />
      </button>
    </p>
  );
}

/** 別人改過了（存檔回 409）：重新載入才能再改（architecture §3.6） */
export function ConflictBar() {
  const conflict = useShared((s) => s.conflict);
  const [busy, setBusy] = useState(false);
  if (!conflict) return null;
  return (
    <div className="conflict-bar" role="alert" data-testid="conflict-bar">
      <span className="ic-text">
        <Icon name="warn" size={16} /> 別人剛改過行程，你這次的修改沒有存。重新載入最新的行程後再改。
      </span>
      <button
        type="button"
        className="button primary"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          await shared.reloadItinerary();
          setBusy(false);
        }}
      >
        重新載入
      </button>
    </div>
  );
}

/** 編輯閒置自動結束（interaction-design §6） */
export function usePlanningIdle() {
  const planning = useApp((s) => s.planning);
  const minutes = useUi((s) => s.idleMinutes);
  useEffect(() => {
    if (!planning) return;
    let last = Date.now();
    const touch = () => (last = Date.now());
    const events = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const;
    events.forEach((e) => window.addEventListener(e, touch, { passive: true }));
    const timer = window.setInterval(() => {
      if (Date.now() - last < minutes * 60_000) return;
      appStore.getState().setPlanning(false);
      shared.store.setState({ toast: { seq: Date.now(), kind: 'ok', text: `${minutes} 分鐘沒有動作，已結束編輯` } });
    }, 5_000);
    return () => {
      events.forEach((e) => window.removeEventListener(e, touch));
      window.clearInterval(timer);
    };
  }, [planning, minutes]);
}

export function SnapshotsDialog() {
  const snapshots = useShared((s) => s.snapshots);
  const version = useShared((s) => s.version);
  const updatedBy = useShared((s) => s.updatedBy);
  const updatedAt = useShared((s) => s.updatedAt);
  const planning = useApp((s) => s.planning);
  const itinerary = useData((s) => s.itinerary);
  const byId = useData((s) => s.byId);
  const [open, setOpen] = useState<{ id: number; snap: Snapshot | null } | null>(null);
  const [confirm, setConfirm] = useState<number | null>(null);
  const nameOf = (id: string) => byId.get(id)?.name.zh || byId.get(id)?.name.ja || id;
  const expand = async (id: number) => {
    if (open?.id === id) return setOpen(null);
    setOpen({ id, snap: null });
    setOpen({ id, snap: await backend().getSnapshot(id) });
  };
  return (
    <Dialog title="快照" onClose={closeDialog} testId="snapshots-dialog">
      <p className="small">
        目前是第 {version} 版（<MemberName id={updatedBy} />・{stamp(updatedAt)}）。每次修改前會自動存一份。
      </p>
      {!planning && <p className="muted small">要復原，請先開始編輯。</p>}
      {snapshots.length === 0 && <p className="muted">還沒有快照。</p>}
      <ol className="snapshot-list">
        {snapshots.map((s) => {
          const changes = open?.id === s.id && open.snap && itinerary ? describeChanges(diffItinerary(itinerary, open.snap.data), { nameOf }) : null;
          return (
            <li key={s.id} className="snapshot" data-testid="snapshot">
              <div className="snapshot-head">
                <span>
                  <strong>#{s.id}</strong>・第 {s.version} 版
                </span>
                <span className="muted small">
                  <MemberName id={s.createdBy} /> 修改前・{stamp(s.createdAt)}
                </span>
              </div>
              {s.reason && <p className="small">之後的修改：{s.reason}</p>}
              <div className="snapshot-actions">
                <button type="button" className="text-button" onClick={() => void expand(s.id)}>
                  {open?.id === s.id ? '收起' : '和現在比'}
                </button>
                {planning && confirm !== s.id && (
                  <button type="button" className="text-button" onClick={() => setConfirm(s.id)} data-testid="snapshot-restore">
                    <Icon name="undo" size={16} /> 復原到這一版
                  </button>
                )}
                {planning && confirm === s.id && (
                  <>
                    <span className="small">確定復原？（現在的版本也會存成快照）</span>
                    <button
                      type="button"
                      className="text-button danger"
                      data-testid="snapshot-restore-confirm"
                      onClick={async () => {
                        const r = await shared.restoreSnapshot(s.id);
                        if (r.ok) closeDialog();
                      }}
                    >
                      復原
                    </button>
                    <button type="button" className="text-button" onClick={() => setConfirm(null)}>
                      取消
                    </button>
                  </>
                )}
              </div>
              {open?.id === s.id && (
                <div className="snapshot-diff small">
                  {!open.snap && <span className="muted">讀取中…</span>}
                  {changes && changes.length === 0 && <span className="muted">和現在一樣。</span>}
                  {changes && changes.length > 0 && (
                    <>
                      <span className="muted">復原的話：</span>
                      <ul>
                        {changes.map((c) => (
                          <li key={c}>{c}</li>
                        ))}
                      </ul>
                    </>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </Dialog>
  );
}

/** 排進行程（詳情面板的「📅 排進行程」）：選哪一天，插在那天最順路的位置；住宿是設成那晚住這裡 */
export function AddToDayDialog({ placeId, day: initialDay }: { placeId: string; day?: string }) {
  const byId = useData((s) => s.byId);
  const p = byId.get(placeId);
  const itinerary = useData((s) => s.itinerary);
  const selectedDay = useApp((s) => s.day);
  const candidates = useShared((s) => s.candidates);
  const candDays = new Set(candidates.filter((c) => c.placeId === placeId).map((c) => c.day));
  const [day, setDay] = useState(initialDay ?? (selectedDay !== 'all' ? selectedDay : ([...candDays].sort()[0] ?? DATES[0])));
  const [busy, setBusy] = useState(false);
  if (!p || !itinerary) return null;
  const lodging = p.type === 'lodging';
  const already = itemsWithPlace(itinerary, placeId);
  const name = p.name.zh || p.name.ja;
  const submit = async () => {
    setBusy(true);
    const r = await addPlaceToDay(placeId, day);
    if (r.ok) closeDialog();
    setBusy(false);
  };
  return (
    <Dialog
      title={lodging ? `設成住宿：${name}` : `排進行程：${name}`}
      onClose={closeDialog}
      testId="add-dialog"
      footer={
        <>
          <button type="button" className="button" onClick={closeDialog}>
            取消
          </button>
          <button type="button" className="button primary" disabled={busy} onClick={() => void submit()} data-testid="add-submit">
            {busy ? '儲存中…' : lodging ? '設成這晚的住宿' : '排進去'}
          </button>
        </>
      }
    >
      {already.length > 0 && <p className="small warn">已經排在 {already.map((r) => shortDayLabel(r.date)).join('、')}。</p>}
      <div className="field">
        <span className="field-label">{lodging ? '哪一晚' : '哪一天（插在那天最順路的位置）'}</span>
        <div className="day-picker">
          {DATES.map((d) => {
            const dayData = itinerary.days.find((x) => x.date === d);
            const count = stopsOn(itinerary, d).filter((s) => s.kind !== 'lodging' && s.kind !== 'flight').length;
            const lodge = dayData?.lodging ? byId.get(dayData.lodging) : null;
            const lodgeName = lodge ? lodge.name.zh || lodge.name.ja : (dayData?.lodging ?? null);
            return (
              <button key={d} type="button" className={`day-pick ${d === day ? 'on' : ''} ${isRedDay(d) ? 'red-day' : ''}`} aria-pressed={d === day} onClick={() => setDay(d)} data-pick-day={d}>
                <span>
                  {dayLabel(d)}
                  {candDays.has(d) ? '・候選' : ''}
                </span>
                <span className="muted small">{lodging ? (lodgeName ? `住 ${lodgeName}` : '還沒排住宿') : `${count} 個點`}</span>
              </button>
            );
          })}
        </div>
      </div>
    </Dialog>
  );
}

/** 手動選單的「移到第 _ 天」：放到那天的最後、留在這天，跳可以復原的提示（moveItemToDayAction，手機版同一個） */
export function MoveDialog({ itemId }: { itemId: string }) {
  const itinerary = useData((s) => s.itinerary);
  const ref = findItemRef(itinerary, itemId);
  const [busy, setBusy] = useState(false);
  if (!ref) return null;
  const place = ref.item.type === 'visit' ? ref.item.options[ref.item.selected]?.place : null;
  const move = async (date: string) => {
    setBusy(true);
    const ok = await moveItemToDayAction(itemId, date);
    setBusy(false);
    if (ok) closeDialog();
  };
  return (
    <Dialog title="移到第幾天" onClose={closeDialog} testId="move-dialog">
      {place && (
        <p>
          <PlaceChip id={place} />（現在在 {shortDayLabel(ref.date)}
          {ref.split ? `・${ref.split.groupName}，移過去會變成全員一起` : ''}）
        </p>
      )}
      <DayGrid12 mode="single" picked={[]} current={ref.date} disabled={busy} onChange={([d]) => void move(d)} />
      <p className="muted small">放在那天的最後，順序可以再調。</p>
    </Dialog>
  );
}

/** 候選「⋯」的「移到第幾天」（只有自己加的）：在那天加成候選、這天的拿掉（moveCandidateToDay，手機版同一個） */
export function MoveCandidateDialog({ candidateId }: { candidateId: number }) {
  const c = useShared((s) => s.candidates.find((x) => x.id === candidateId));
  const [busy, setBusy] = useState(false);
  if (!c) return null;
  const move = async (date: string) => {
    setBusy(true);
    const ok = await moveCandidateToDay(c.id, date);
    setBusy(false);
    if (ok) closeDialog();
  };
  return (
    <Dialog title="移到第幾天" onClose={closeDialog} testId="move-dialog">
      <p>
        <PlaceChip id={c.placeId} />（現在是 {shortDayLabel(c.day)} 的候選）
      </p>
      <DayGrid12 mode="single" picked={[]} current={c.day} disabled={busy} onChange={([d]) => void move(d)} />
      <p className="muted small">變成那天的候選。</p>
    </Dialog>
  );
}

/** dev 選單也用：把閒置時間改短 */
export const setIdleMinutes = (idleMinutes: number) => uiStore.setState({ idleMinutes });
