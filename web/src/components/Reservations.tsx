// 預約筆記（PLAN T15m 第三輪 §5）：每晚的住宿，加上行程裡接受訂位的餐廳、體驗；每列記「未訂位／已訂位／不訂位」和一行備註，
// 大家共用。網頁版放在地圖區的視窗（MapPanel）裡，手機版在「我」的整頁預約（mobile/MePage.tsx）；時間軸的 tag（ReservationTag）點了會打開這裡並捲到那一列。

import { useEffect, useRef, useState } from 'react';
import type { ReservationStatus } from '../backend/types.ts';
import { appStore } from '../store.ts';
import { commands } from '../appCommands.ts';
import { DESKTOP_QUERY, useData, usePlan, useShared, useUi } from '../hooks.ts';
import { noteRows, linkLabel, reservationFor, type NoteRow } from '../lib/reservations.ts';
import { dayLabel, isRedDay } from '../lib/trip.ts';
import { closeMapPanel, openMapPanel } from '../uiStore.ts';
import { AvatarStack, stamp } from './common.tsx';
import { Icon } from './Icon.tsx';
import { shared, sharedStore } from '../appShared.ts';
import { Chip } from '../shared/ui/Chip.tsx';

const ROLE_LABELS = { main: '', other: '這個時段也可以去', lodging: '住宿' } as const;
const STATUS_LABELS: Record<ReservationStatus, string> = { pending: '未訂位', booked: '已訂位', skip: '不訂位' };
const STATUSES: ReservationStatus[] = ['pending', 'booked', 'skip'];

/** 這一列的 id，tag 捲動用 */
const rowKey = (r: NoteRow) => `${r.key.date}|${r.key.placeId}`;

/** 「2/5」「2/5～2/8 3 晚」 */
function dateText(r: NoteRow): string {
  const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;
  if (r.role === 'lodging' && r.endDate) return `${md(r.date)}～${md(r.endDate)} ${r.nights} 晚`;
  return md(r.date);
}

/** 寫一個欄位：狀態和備註各自從 store 讀「現在」的紀錄再合併，不用畫面上可能過期的那份 */
function write(row: NoteRow, patch: { status?: ReservationStatus; note?: string | null }) {
  const cur = sharedStore.getState().reservations.find((x) => x.date === row.key.date && x.placeId === row.key.placeId);
  void shared.setReservation({
    date: row.key.date,
    placeId: row.key.placeId,
    status: patch.status ?? cur?.status ?? 'pending',
    note: patch.note !== undefined ? patch.note : (cur?.note ?? null),
    nights: row.nights,
  });
}

/** 備註：離開輸入框或按 Enter 才存 */
function NoteInput({ row }: { row: NoteRow }) {
  const [text, setText] = useState(row.note ?? '');
  useEffect(() => setText(row.note ?? ''), [row.note]);
  const save = () => {
    if (text.trim() === (row.note ?? '')) return;
    write(row, { note: text.trim() || null });
  };
  return (
    <input
      type="text"
      className="note-input"
      value={text}
      placeholder="備註，例如：已用 LINE 訂 18:00"
      aria-label="備註"
      onChange={(e) => setText(e.target.value)}
      onBlur={save}
      onKeyDown={(e) => e.key === 'Enter' && !e.nativeEvent.isComposing && e.keyCode !== 229 && e.currentTarget.blur()}
      data-testid="note-text"
    />
  );
}

function Row({ row }: { row: NoteRow }) {
  const place = useData((s) => s.byId.get(row.placeId));
  const name = place ? place.name.zh || place.name.ja : row.placeId;
  const open = () => {
    const s = appStore.getState();
    // 手機的視窗蓋住整個畫面，詳情開在下面的面板裡看不到：先關掉視窗
    if (!window.matchMedia(DESKTOP_QUERY).matches) closeMapPanel();
    commands.focus(row.placeId);
    s.openDetail(row.placeId);
  };
  const setStatus = (status: ReservationStatus) => {
    if (status === row.status) return;
    write(row, { status });
  };
  return (
    <div className={`reservation note-row role-${row.role}`} data-testid="note-row" data-key={rowKey(row)} data-place={row.placeId} data-date={row.date} data-status={row.status}>
      <div className="reservation-main">
        <button type="button" className="link-button" onClick={open}>
          {name}
        </button>
        {ROLE_LABELS[row.role] && <span className="badge">{ROLE_LABELS[row.role]}</span>}
        <span className="small">
          {dateText(row)}
          {row.time ? `・${row.time}` : ''}・{row.people} 人
        </span>
      </div>
      {row.nightsChanged && <p className="small warn">晚數變了，請確認</p>}
      <div className="reservation-how small">
        {row.phone && <a href={`tel:${row.phone}`} className="ic-text">
            <Icon name="phone" size={16} /> {row.phone}
          </a>}
        {row.url && place && (
          <a href={row.url} target="_blank" rel="noreferrer" className="ic-text">
            <Icon name="link" size={16} /> {linkLabel(row.url, place)}
          </a>
        )}
        {row.leadDays != null && <span>{row.leadDays} 天前要訂</span>}
        {!row.phone && !row.url && <span className="muted">訂位方式未查</span>}
      </div>
      {row.placeNote && <p className="muted small">{row.placeNote}</p>}
      {row.accepted === 'groups-only' && <p className="small warn">只接受團體預約</p>}
      <div className="segmented note-status" role="group" aria-label="預約狀態">
        {STATUSES.map((s) => (
          <button key={s} type="button" aria-pressed={row.status === s} onClick={() => setStatus(s)} data-testid={`note-status-${s}`}>
            {STATUS_LABELS[s]}
          </button>
        ))}
      </div>
      <NoteInput row={row} />
      {row.updatedBy && (
        <p className="muted small note-by">
          <AvatarStack ids={[row.updatedBy]} /> {stamp(row.updatedAt)} 改的
        </p>
      )}
    </div>
  );
}

/** date：只列那天（住宿算入住那天）；null 是整趟 */
export function ReservationNotes({ date }: { scope?: 'day' | 'trip'; date: string | null }) {
  const itinerary = useData((s) => s.itinerary);
  const byId = useData((s) => s.byId);
  const plan = usePlan((s) => s.plan);
  const reservations = useShared((s) => s.reservations);
  const focus = useUi((s) => s.mapPanel?.focus);
  const [onlyPending, setOnlyPending] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const all = noteRows(itinerary, plan, byId, reservations);
  const rows = all.filter((r) => (!date || r.date === date) && (!onlyPending || r.status === 'pending'));

  // 從時間軸的 tag 進來：先取消「只看未訂位」，再捲到那一列閃一下
  const doneFor = useRef<unknown>(null);
  useEffect(() => {
    if (focus && doneFor.current !== focus) setOnlyPending(false);
  }, [focus]);
  useEffect(() => {
    if (!focus || doneFor.current === focus) return;
    const el = listRef.current?.querySelector<HTMLElement>(`[data-key="${CSS.escape(`${focus.date}|${focus.placeId}`)}"]`);
    if (!el) return;
    doneFor.current = focus;
    el.scrollIntoView({ block: 'center' });
    el.classList.add('flash');
    window.setTimeout(() => el.classList.remove('flash'), 1600);
  }, [focus, rows.length, onlyPending]);

  let lastDate = '';
  return (
    <div data-testid="reservations-view">
      {/* 晶片開關（不用原生勾選框，設計 §2.3） */}
      <div className="only-pending">
        <Chip on={onlyPending} onClick={() => setOnlyPending(!onlyPending)} testId="only-pending">
          只看未訂位
        </Chip>
      </div>
      {rows.length === 0 && <p className="muted">{onlyPending ? '沒有未訂位的了。' : '行程裡還沒有要預約的。'}</p>}
      <div className="reservation-list" ref={listRef}>
        {rows.map((r) => {
          const head = r.date !== lastDate;
          lastDate = r.date;
          return (
            <div key={rowKey(r)}>
              {head && <h4 className={`reservation-day ${isRedDay(r.date) ? 'red-day' : ''}`}>{dayLabel(r.date)}</h4>}
              <Row row={r} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** 時間軸卡片上的預約 tag：未訂位橘、已訂位綠、不訂位不顯示；點了打開預約筆記並捲到那一列 */
export function ReservationTag({ date, placeId }: { date: string; placeId: string }) {
  const itinerary = useData((s) => s.itinerary);
  const byId = useData((s) => s.byId);
  const plan = usePlan((s) => s.plan);
  const reservations = useShared((s) => s.reservations);
  const row = reservationFor(noteRows(itinerary, plan, byId, reservations), date, placeId);
  if (!row || row.status === 'skip') return null;
  const booked = row.status === 'booked';
  return (
    <button
      type="button"
      className={`badge reservation-tag ${booked ? 'tag-booked' : 'badge-warn'}`}
      onClick={() => openMapPanel('reservations', { focus: { date: row.key.date, placeId: row.key.placeId } })}
      data-testid="reservation-tag"
      data-status={row.status}
    >
      {booked ? '已訂位 ✓' : '未訂位'}
    </button>
  );
}
