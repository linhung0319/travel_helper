// 預約筆記（PLAN T15m 第三輪 §5，T55 改版）：每晚的住宿，加上行程裡接受訂位的餐廳、體驗；一筆一張卡，記「待訂／已訂／不用訂」和一行備註，
// 大家共用。照日期分組，日期標題可以收合（狀態存在這台裝置）。網頁版放在地圖區的視窗（MapPanel）裡，手機版在「我」的整頁預約（mobile/MePage.tsx）；
// 時間軸的 tag（ReservationTag）點了會打開這裡：那天展開、捲到那張卡、閃一下芥子黃。

import { useEffect, useRef, useState } from 'react';
import { nightAreaOf } from '@travel-helper/engine';
import type { ReservationStatus } from '../backend/types.ts';
import type { Place } from '../data/types.ts';
import { appStore } from '../store.ts';
import { commands } from '../appCommands.ts';
import { DESKTOP_QUERY, useData, usePlan, useShared, useUi } from '../hooks.ts';
import {
  cardOpenByDefault,
  dateLine,
  dayOpenByDefault,
  firstLine,
  linkLabel,
  noteDays,
  noteRows,
  reservationFor,
  reservationTags,
  statusCounts,
  type NoteDay,
  type NoteRow,
} from '../lib/reservations.ts';
import { areaColor } from '../lib/areas.ts';
import { placeAreaOf } from '../lib/tripSkeleton.ts';
import { dayLabel, isRedDay } from '../lib/trip.ts';
import { closeMapPanel, openMapPanel } from '../uiStore.ts';
import { AvatarStack, stamp } from './common.tsx';
import { Icon } from './Icon.tsx';
import { shared, sharedStore } from '../appShared.ts';
import { TypeSeal } from '../shared/ui/TypeLabel.tsx';
import { firstTime, readJson, writeJson } from '../lib/onceHint.ts';

const STATUS_LABELS: Record<ReservationStatus, string> = { pending: '待訂', booked: '已訂', skip: '不用訂' };
const STATUSES: ReservationStatus[] = ['pending', 'booked', 'skip'];
type Filter = ReservationStatus | 'all';
const FILTERS: Filter[] = ['pending', 'booked', 'skip', 'all'];
const FILTER_EMPTY: Record<Filter, string> = { pending: '沒有待訂的了。', booked: '還沒有已訂的。', skip: '沒有不用訂的。', all: '行程裡還沒有要預約的。' };

/** 日期標題收合的狀態：只記使用者按過的（date → 展開嗎），其他照預設；存在這台裝置，不同步 */
const DAY_OPEN_KEY = 'th.reservations.dayOpen';

/** 這一列的 id，tag 捲動用 */
const rowKey = (r: NoteRow) => `${r.key.date}|${r.key.placeId}`;

const nameOf = (byId: Map<string, Place>, id: string) => {
  const p = byId.get(id);
  return p ? p.name.zh || p.name.ja : id;
};

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
      placeholder="備註，例如：王小明的名字訂 15 位、18:00"
      aria-label="備註"
      onChange={(e) => setText(e.target.value)}
      onBlur={save}
      onKeyDown={(e) => e.key === 'Enter' && !e.nativeEvent.isComposing && e.keyCode !== 229 && e.currentTarget.blur()}
      data-testid="note-text"
    />
  );
}

/** 電話：顯示號碼（手機點了可以撥），旁邊「複製」 */
function Phone({ phone }: { phone: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    void navigator.clipboard
      ?.writeText(phone)
      .then(() => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => {});
  };
  return (
    <span className="note-phone">
      <a href={`tel:${phone}`} className="ic-text">
        <Icon name="phone" size={16} /> {phone}
      </a>
      <button type="button" className="text-button note-copy" onClick={copy} data-testid="note-copy">
        {copied ? '已複製' : '複製'}
      </button>
    </span>
  );
}

function Card({ row, open, onOpen }: { row: NoteRow; open: boolean; onOpen: (open: boolean) => void }) {
  const place = useData((s) => s.byId.get(row.placeId));
  const name = place ? place.name.zh || place.name.ja : row.placeId;
  const attrs = { 'data-testid': 'note-row', 'data-key': rowKey(row), 'data-place': row.placeId, 'data-date': row.date, 'data-status': row.status, 'data-open': open ? 'true' : 'false' };

  // 已訂、不用訂的收成一列：名稱、狀態、備註的第一行；點了展開
  if (!open) {
    const line = firstLine(row.note);
    return (
      <div className={`reservation note-row note-card collapsed st-${row.status}`} {...attrs}>
        <button type="button" className="note-card-line" onClick={() => onOpen(true)} aria-expanded={false} data-testid="note-card-toggle">
          {place && <TypeSeal type={place.type} size="sm" />}
          <span className="note-card-name">{name}</span>
          {line ? <span className="note-card-note muted small">{line}</span> : <span className="note-card-note" />}
          <span className={`badge note-status-badge st-${row.status}`}>{row.status === 'booked' ? '✓ 已訂' : STATUS_LABELS[row.status]}</span>
        </button>
      </div>
    );
  }

  const openDetail = () => {
    const s = appStore.getState();
    // 手機的視窗蓋住整個畫面，詳情開在下面的面板裡看不到：先關掉視窗
    if (!window.matchMedia(DESKTOP_QUERY).matches) closeMapPanel();
    commands.focus(row.placeId);
    s.openDetail(row.placeId);
  };
  const setStatus = (status: ReservationStatus) => {
    if (status === row.status) return;
    // 改了狀態先留著展開，打備註時卡片不會突然收起來
    onOpen(true);
    write(row, { status });
    // 第一次按「已訂」：這只是筆記（§17.6）
    if (status === 'booked' && firstTime('th.hint.firstBooked')) shared.notifyHint('已記下。這只是筆記，網站不會幫你訂');
  };
  const tags = reservationTags(row);
  return (
    <div className={`reservation note-row note-card st-${row.status} role-${row.role}`} {...attrs}>
      <div className="note-card-head">
        {place && <TypeSeal type={place.type} />}
        <button type="button" className="link-button note-card-name" onClick={openDetail}>
          {name}
        </button>
        {row.role === 'other' && <span className="badge">這個時段也可以去</span>}
        <div className="segmented note-status" role="group" aria-label="預約狀態">
          {STATUSES.map((s) => (
            <button key={s} type="button" aria-pressed={row.status === s} onClick={() => setStatus(s)} data-testid={`note-status-${s}`}>
              {STATUS_LABELS[s]}
            </button>
          ))}
        </div>
        {row.status !== 'pending' && (
          <button type="button" className="text-button note-card-fold" onClick={() => onOpen(false)} aria-expanded={true} aria-label="收起" data-testid="note-card-toggle">
            ︿
          </button>
        )}
      </div>
      <p className="small note-when" data-testid="note-when">
        {dateLine(row)}
      </p>
      {row.nightsChanged && <p className="small warn">晚數變了，請確認</p>}
      <div className="reservation-how small">
        {row.phone && <Phone phone={row.phone} />}
        {row.url && place && (
          <a href={row.url} target="_blank" rel="noreferrer" className="ic-text">
            <Icon name="link" size={16} /> {linkLabel(row.url, place)}
          </a>
        )}
        {!row.phone && !row.url && <span className="muted">訂位方式未查</span>}
      </div>
      {tags.length > 0 && (
        <div className="note-tags" data-testid="note-tags">
          {tags.map((t) => (
            <span key={t} className="badge note-tag">
              {t}
            </span>
          ))}
        </div>
      )}
      {row.placeNote && <p className="muted small">{row.placeNote}</p>}
      <NoteInput row={row} />
      {row.updatedBy && (
        <p className="muted small note-by">
          <AvatarStack ids={[row.updatedBy]} /> {stamp(row.updatedAt)} 改的
        </p>
      )}
    </div>
  );
}

interface DayGroupProps {
  day: NoteDay;
  /** 這天全部的列裡有幾筆待訂（摘要不照篩選） */
  pending: number;
  open: boolean;
  onOpen: (open: boolean) => void;
  area: { name: string; color: string } | null;
  byId: Map<string, Place>;
  cardOpen: (r: NoteRow) => boolean;
  onCardOpen: (r: NoteRow, open: boolean) => void;
}

/** 日期標題：「▾ 2/3（三）· 志摩 · 3 筆」，右邊這天的摘要；收合時下面一行小字列出這天有哪幾筆 */
function DayGroup({ day, pending, open, onOpen, area, byId, cardOpen, onCardOpen }: DayGroupProps) {
  return (
    <section className={`note-day ${open ? 'open' : 'closed'}`} data-testid="note-day" data-date={day.date} data-open={open ? 'true' : 'false'}>
      <button type="button" className="note-day-head" onClick={() => onOpen(!open)} aria-expanded={open} data-testid="note-day-toggle">
        <span className="note-day-caret" aria-hidden>
          {open ? '▾' : '▸'}
        </span>
        <i className="note-day-dot" style={{ background: area?.color ?? 'var(--soft)' }} aria-hidden />
        <span className="note-day-title">
          <span className={isRedDay(day.date) ? 'red-day' : ''}>{dayLabel(day.date)}</span>
          {area && ` · ${area.name}`} · {day.rows.length} 筆
        </span>
        {pending > 0 ? (
          <span className="note-day-sum pending" data-testid="note-day-sum">
            待訂 {pending}
          </span>
        ) : (
          <span className="note-day-sum done" data-testid="note-day-sum">
            ✓ 都訂好了
          </span>
        )}
      </button>
      {open ? (
        <div className="note-day-cards">
          {day.rows.map((r) => (
            <Card key={rowKey(r)} row={r} open={cardOpen(r)} onOpen={(o) => onCardOpen(r, o)} />
          ))}
        </div>
      ) : (
        <p className="muted small note-day-names" data-testid="note-day-names">
          {day.rows.map((r) => nameOf(byId, r.placeId)).join('、')}
        </p>
      )}
    </section>
  );
}

/** date：只列那天（住宿算入住那天）；null 是整趟 */
export function ReservationNotes({ date }: { scope?: 'day' | 'trip'; date: string | null }) {
  const itinerary = useData((s) => s.itinerary);
  const byId = useData((s) => s.byId);
  const areas = useData((s) => s.areas);
  const plan = usePlan((s) => s.plan);
  const reservations = useShared((s) => s.reservations);
  const focus = useUi((s) => s.mapPanel?.focus);
  const [filter, setFilter] = useState<Filter>('all');
  const [dayOpen, setDayOpenState] = useState<Record<string, boolean>>(() => readJson(DAY_OPEN_KEY, {}));
  const [cardOpenOverride, setCardOpenOverride] = useState<Record<string, boolean>>({});
  // 這次打開時動過卡片的日子：按「已訂」讓那天沒有待訂了，也不要整天突然收起來（不存）
  const [touchedDays, setTouchedDays] = useState<Record<string, boolean>>({});
  const listRef = useRef<HTMLDivElement>(null);

  const scoped = noteRows(itinerary, plan, byId, reservations).filter((r) => !date || r.date === date);
  const counts = statusCounts(scoped);
  const pendingOn = new Map(noteDays(scoped).map((d) => [d.date, d.pending]));
  const days = noteDays(scoped.filter((r) => filter === 'all' || r.status === filter));
  const isDayOpen = (d: NoteDay) => dayOpen[d.date] ?? touchedDays[d.date] ?? dayOpenByDefault({ pending: pendingOn.get(d.date) ?? 0 });
  const isCardOpen = (r: NoteRow) => cardOpenOverride[rowKey(r)] ?? cardOpenByDefault(r);
  const allOpen = days.length > 0 && days.every(isDayOpen);

  const setDayOpen = (patch: Record<string, boolean>) =>
    setDayOpenState((cur) => {
      const next = { ...cur, ...patch };
      writeJson(DAY_OPEN_KEY, next);
      return next;
    });

  const areaOn = (d: string) => {
    if (!itinerary) return null;
    const id = nightAreaOf(itinerary, d, placeAreaOf(byId));
    const a = id ? areas.find((x) => x.id === id) : null;
    return a ? { name: a.name.zh || a.name.ja, color: areaColor(areas, a.id) } : null;
  };

  // 從時間軸的 tag 進來：篩選換回全部、那天和那張卡展開，畫好之後再捲過去閃一下
  const openedFor = useRef<unknown>(null);
  const doneFor = useRef<unknown>(null);
  useEffect(() => {
    if (!focus || openedFor.current === focus) return;
    openedFor.current = focus;
    setFilter('all');
    setDayOpen({ [focus.date]: true });
    setCardOpenOverride((cur) => ({ ...cur, [`${focus.date}|${focus.placeId}`]: true }));
  }, [focus]);
  useEffect(() => {
    if (!focus || doneFor.current === focus) return;
    const el = listRef.current?.querySelector<HTMLElement>(`[data-key="${CSS.escape(`${focus.date}|${focus.placeId}`)}"][data-open="true"]`);
    if (!el) return;
    doneFor.current = focus;
    el.scrollIntoView({ block: 'center' });
    el.classList.add('flash');
    window.setTimeout(() => el.classList.remove('flash'), 1600);
  });

  return (
    <div data-testid="reservations-view">
      <p className="note-disclaimer" data-testid="reservation-disclaimer">
        這裡只是大家的筆記。網站不會幫你訂位，要自己打電話或上網訂。訂好了把狀態改成「已訂」，寫一下用誰的名字、幾位，大家就知道了。
      </p>
      <div className="note-toolbar">
        <div className="segmented note-filter" role="group" aria-label="只看" data-testid="note-filter">
          {FILTERS.map((f) => (
            <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)} data-testid={`note-filter-${f}`}>
              {f === 'all' ? '全部' : `${STATUS_LABELS[f]} ${counts[f]}`}
            </button>
          ))}
        </div>
        {days.length > 0 && (
          <button type="button" className="text-button note-fold-all" onClick={() => setDayOpen(Object.fromEntries(days.map((d) => [d.date, !allOpen])))} data-testid="note-fold-all">
            {allOpen ? '全部收合' : '全部展開'}
          </button>
        )}
      </div>
      {days.length === 0 && <p className="muted">{scoped.length === 0 ? FILTER_EMPTY.all : FILTER_EMPTY[filter]}</p>}
      <div className="reservation-list" ref={listRef}>
        {days.map((d) => (
          <DayGroup
            key={d.date}
            day={d}
            pending={pendingOn.get(d.date) ?? 0}
            open={isDayOpen(d)}
            onOpen={(o) => setDayOpen({ [d.date]: o })}
            area={areaOn(d.date)}
            byId={byId}
            cardOpen={isCardOpen}
            onCardOpen={(r, o) => {
              setCardOpenOverride((cur) => ({ ...cur, [rowKey(r)]: o }));
              if (o) setTouchedDays((cur) => ({ ...cur, [r.date]: true }));
            }}
          />
        ))}
      </div>
    </div>
  );
}

/** 時間軸卡片上的預約 tag：待訂紅、已訂抹茶、不用訂不顯示（§17.7）；點了打開預約筆記並捲到那一列 */
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
      className={`badge reservation-tag ${booked ? 'tag-booked' : 'tag-pending'}`}
      onClick={() => openMapPanel('reservations', { focus: { date: row.key.date, placeId: row.key.placeId } })}
      data-testid="reservation-tag"
      data-status={row.status}
    >
      {booked ? '✓ 已訂' : '待訂'}
    </button>
  );
}
