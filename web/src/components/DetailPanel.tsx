// 資料點的詳情。網頁版：DetailPanel（右欄或浮在地圖上），版面是 shared/ui/PlaceDetail（兩邊共用的照片、動作列、四個分頁）。
// 各分頁裡的區塊抽成可以單獨 import 的元件（PlaceIntro、PlaceFacts、PlaceReviews、NearbySection、LinksSection、SourcesSection），PlaceDetail 排版面。
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { appStore, type DetailFrom } from '../store.ts';
import { commands } from '../appCommands.ts';
import { useApp, useData } from '../hooks.ts';
import { displayName } from '../data/normalize.ts';
import { TYPE_LABELS, CONTEXT_LABELS } from '../lib/filter.ts';
import { DAY_ROWS, closureOn, formatRanges, rowForDate } from '../lib/hours.ts';
import {
  CONFIDENCE_LABELS,
  FIT15_LABELS,
  FIT_SUBGROUP_LABELS,
  KIDS_ALLOWED_LABELS,
  KIDS_FRIENDLY_LABELS,
  LINK_LABELS,
  MEALS_LABELS,
  METHOD_LABELS,
  RESERVATION_LABELS,
  SCORE_LABELS,
  SEATING_LABELS,
  label,
} from '../lib/labels.ts';
import { nearbyPlaces } from '../lib/nearby.ts';
import { dayLabel, shortDayLabel } from '../lib/trip.ts';
import { TypeSeal } from '../shared/ui/TypeLabel.tsx';
import { Icon } from './Icon.tsx';
import { placeBadges } from '../lib/badges.ts';
import type { Place } from '../data/types.ts';
import { StationTimetablePanel } from './StationTimetable.tsx';
import { EditedMark, editedOf } from './EditHistory.tsx';
import { AskAiBox } from './AskAiBox.tsx';
import { itemsWithPlace } from '../lib/planView.ts';
import { PlaceDetail } from '../shared/ui/PlaceDetail.tsx';

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : {});
const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : typeof v === 'number' ? String(v) : null);
const yesNo = (v: unknown): string | null => (v === true ? '有' : v === false ? '沒有' : null);

/** 一列「名稱：內容」；內容是空的就不顯示 */
type Edited = ReturnType<typeof editedOf>;

function Row({ k, v, edited }: { k: string; v: ReactNode; edited?: Edited }) {
  if (v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0)) return null;
  return (
    <div className="row">
      <dt>{k}</dt>
      <dd>
        {v}
        {edited && <EditedMark {...edited} />}
      </dd>
    </div>
  );
}

function Section({ title, children, edited }: { title: string; children: ReactNode; edited?: Edited }) {
  return (
    <section className="detail-section">
      <h3>
        {title}
        {edited && <EditedMark {...edited} />}
      </h3>
      {children}
    </section>
  );
}

function ScoreBars({ place }: { place: Place }) {
  const a = place.assessment;
  if (!a) return null;
  return (
    <div className="scores">
      {Object.entries(a.scores).map(([key, score]) => {
        const why = a.rationale?.[key];
        return (
          <details key={key} className="score" title={why ?? undefined}>
            <summary>
              <span className="score-label">{SCORE_LABELS[key] ?? key}</span>
              <span className="score-bar" aria-label={score == null ? '資料不足' : `${score} / 5`}>
                <span style={{ width: `${((score ?? 0) / 5) * 100}%` }} />
              </span>
              <span className="score-num">{score ?? '—'}</span>
            </summary>
            {why && <p className="score-why">{why}</p>}
          </details>
        );
      })}
      {a.confidence && <p className="muted small">評分{CONFIDENCE_LABELS[a.confidence]}（{a.assessed ?? '日期不明'}）</p>}
    </div>
  );
}

function HoursTable({ place, date }: { place: Place; date: string | null }) {
  const h = place.hours;
  const highlight = h && date ? rowForDate(h, date) : null;
  const closure = date ? closureOn(place.closures, date) : null;
  return (
    <>
      {h ? (
        <table className="hours">
          <tbody>
            {DAY_ROWS.filter((r) => r.key !== 'holiday' || h.holiday !== undefined).map((r) => (
              <tr key={r.key} className={r.key === highlight ? 'today' : undefined}>
                <th>{r.label}</th>
                <td>{h.always ? '全天開放' : formatRanges(h[r.key])}</td>
                {r.key === highlight && <td className="today-mark">{dayLabel(date!)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="muted">營業時間不明</p>
      )}
      {closure && <p className="warn ic-text">
          <Icon name="warn" size={16} /> {dayLabel(date!)} 休業：{closure.note ?? `${closure.from}～${closure.to}`}
        </p>}
      <dl>
        <Row k="最後入場" v={Array.isArray(h?.lastEntry) ? h!.lastEntry.filter(Boolean).join('、') : text(h?.lastEntry)} />
        <Row k="說明" v={text(h?.note)} />
        <Row k="公休" v={place.closedNote} edited={editedOf(place, 'closedNote')} />
        <Row k="2 月" v={place.febNote} edited={editedOf(place, 'febNote')} />
        <Row k="休業期間" v={place.closures.map((c) => `${c.from}～${c.to}${c.note ? `（${c.note}）` : ''}`).join('；') || null} />
      </dl>
    </>
  );
}

function GroupSection({ place }: { place: Place }) {
  const g = obj(place.raw.group);
  const r = obj(place.raw.reservation);
  const methods = Array.isArray(r.methods) ? (r.methods as string[]).map((m) => METHOD_LABELS[m] ?? m).join('、') : null;
  return (
    <Section title="團體" edited={editedOf(place, 'group', 'reservation')}>
      <dl>
        {place.type === 'restaurant' && (
          <>
            <Row k="全員 15 人" v={label(FIT15_LABELS, g.fit15)} edited={editedOf(place, 'group.fit15')} />
            <Row k="分組 4～6 人" v={label(FIT_SUBGROUP_LABELS, g.fitSubgroup)} />
            <Row k="席數" v={text(g.seats)} />
            <Row k="最多預約" v={g.maxReservation != null ? `${g.maxReservation} 人` : null} />
            <Row k="包廂" v={yesNo(g.privateRoom)} />
            <Row k="包場" v={text(g.buyout)} />
            <Row k="團體套餐" v={text(g.groupMenu)} />
            <Row k="電話確認" v={g.confirmed15 ? `${text(obj(g.confirmed15).date)}：${text(obj(g.confirmed15).note) ?? ''}` : null} />
            <Row k="依據" v={text(g.source)} />
          </>
        )}
        {place.type === 'lodging' && (
          <>
            <Row k="房間數" v={text(g.totalRooms)} />
            <Row k="房型" v={Array.isArray(g.roomTypes) ? (g.roomTypes as string[]).join('；') : null} />
            <Row k="最多人數" v={text(g.maxGuests)} />
            <Row k="包棟" v={yesNo(g.wholeRental)} />
            <Row k="接送車" v={g.pickupCapacity != null ? `一次 ${g.pickupCapacity} 人` : null} />
          </>
        )}
        {place.type === 'spot' && (
          <>
            <Row k="預約" v={text(g.reservation)} />
            <Row k="聯絡" v={text(obj(g.contact).phone)} />
          </>
        )}
        <Row k="備註" v={text(g.note)} />
      </dl>
      {(place.type !== 'spot' || Object.keys(r).length > 0) && (
        <>
          <h4>預約方式</h4>
          <dl>
            <Row k="預約" v={label(RESERVATION_LABELS, r.accepted)} />
            <Row k="方式" v={methods} />
            <Row k="電話" v={text(r.phone) && <a href={`tel:${text(r.phone)}`}>{text(r.phone)}</a>} />
            <Row
              k="網路"
              v={
                text(r.url) && (
                  <a href={text(r.url)!} target="_blank" rel="noreferrer">
                    訂位頁
                  </a>
                )
              }
            />
            <Row k="語言" v={text(r.language)} />
            <Row k="幾天前" v={r.leadDays != null ? `${r.leadDays} 天前` : null} />
            <Row k="團體" v={text(r.groupNote)} />
            <Row k="備註" v={text(r.note)} />
          </dl>
        </>
      )}
    </Section>
  );
}

function ElderKidsSection({ place }: { place: Place }) {
  const acc = obj(place.raw.accessibility);
  const kids = obj(place.raw.kids);
  const seating = Array.isArray(place.raw.seating) ? (place.raw.seating as string[]).map((s) => SEATING_LABELS[s] ?? s).join('、') : null;
  if (place.type === 'station') {
    return (
      <Section title="長輩、行李">
        <dl>
          <Row k="無障礙" v={text(place.raw.accessibility)} />
          <Row k="置物櫃" v={text(place.raw.coinLockers)} />
        </dl>
      </Section>
    );
  }
  return (
    <Section title="長輩、小孩" edited={editedOf(place, 'accessibility', 'kids')}>
      <dl>
        <Row k="座位" v={seating} />
        <Row k="內部步行" v={acc.walkInsideMinutes != null ? `約 ${acc.walkInsideMinutes} 分` : null} />
        <Row k="階梯" v={text(acc.stairs)} />
        <Row k="坡道" v={text(acc.slope)} />
        <Row k="休息處" v={yesNo(acc.restAreas)} />
        <Row k="廁所" v={yesNo(acc.toilets)} />
        <Row k="電梯" v={yesNo(acc.elevator)} />
        <Row k="床" v={text(acc.beds)} />
        <Row k="無障礙" v={text(acc.barrierFree)} />
        <Row k="長輩備註" v={text(acc.note)} />
        <Row k="小孩" v={typeof place.raw.kids === 'string' ? place.raw.kids : (label(KIDS_ALLOWED_LABELS, kids.allowed) ?? label(KIDS_FRIENDLY_LABELS, kids.friendly))} />
        <Row k="兒童餐" v={yesNo(kids.kidsMenu)} />
        <Row k="小孩備註" v={text(kids.note) ?? text(acc.kids)} />
        <Row k="吸菸" v={text(place.raw.smoking)} />
      </dl>
    </Section>
  );
}

function PriceSection({ place }: { place: Place }) {
  const raw = place.raw;
  const fares = obj(raw.fares);
  const prices = Array.isArray(raw.prices) ? (raw.prices as Obj[]) : [];
  const yen = (n: unknown) => (typeof n === 'number' ? `${n.toLocaleString('ja-JP')} 円` : null);
  const hasAny = raw.priceRange || raw.admission || prices.length || Object.keys(fares).length || raw.mustTry;
  if (!hasAny) return null;
  return (
    <Section title="價格" edited={editedOf(place, 'prices', 'price', 'fares')}>
      <dl>
        <Row k="價位" v={text(raw.priceRange)} />
        <Row k="門票" v={text(raw.admission)} />
        <Row k="大人" v={text(fares.adult)} />
        <Row k="小孩" v={text(fares.child)} />
        <Row k="長輩" v={text(fares.senior)} />
        <Row k="團體" v={text(fares.group)} />
        <Row k="招牌菜" v={Array.isArray(raw.mustTry) ? (raw.mustTry as string[]).join('；') : null} />
      </dl>
      {prices.length > 0 && (
        <details className="prices">
          <summary>方案與價格（{prices.length} 筆）</summary>
          <ul>
            {prices.map((p, i) => (
              <li key={i}>
                <strong>{text(p.plan)}</strong>：
                {p.unit === 'per-house' ? `每棟 ${yen(p.price) ?? '不明'}` : `大人 ${yen(p.adult) ?? '不明'}${p.child != null ? `、小孩 ${yen(p.child)}` : ''}`}
                {text(p.season) && <span className="muted small">（{text(p.season)}）</span>}
              </li>
            ))}
          </ul>
        </details>
      )}
    </Section>
  );
}

/** 楽天ウェブサービスの規約：楽天的資料（評分、價格、照片）要附上クレジット（CONVENTIONS「楽天トラベル API」） */
export function usesRakuten(place: Place): boolean {
  const r = obj(place.raw.ratings);
  const prices = Array.isArray(place.raw.prices) ? (place.raw.prices as Obj[]) : [];
  return (
    typeof r.rakuten === 'number' ||
    place.raw.rakutenHotelNo != null ||
    prices.some((p) => String(p.source ?? '').startsWith('rakuten')) ||
    place.photos.some((p) => p.kind === 'rakuten')
  );
}

interface Rating {
  key: string;
  name: string;
  score: number;
  max: number;
  count: number | null;
}

function ratingsOf(place: Place): Rating[] {
  const r = obj(place.raw.ratings);
  const out: Rating[] = [];
  const add = (key: string, name: string, max: number) => {
    const score = r[key];
    const count = r[`${key}Reviews`];
    if (typeof score === 'number') out.push({ key, name, score, max, count: typeof count === 'number' ? count : null });
  };
  add('google', 'Google', 5);
  add('tabelog', '食べログ', 5);
  add('rakuten', '楽天', 5);
  add('jalan', 'じゃらん', 5);
  return out;
}

function RatingChip({ r }: { r: Rating }) {
  return (
    <span className={`rate rate-${r.key}`}>
      <span className="rate-src">{r.name}</span>
      <span className="rate-star" aria-hidden>
        ★
      </span>
      <b className="rate-score">{r.score.toFixed(r.key === 'tabelog' ? 2 : 1)}</b>
      {r.count != null && <span className="rate-n">{r.count.toLocaleString('ja-JP')} 則</span>}
    </span>
  );
}

/** 連結（官網、訂位頁…） */
export function LinksSection({ place }: { place: Place }) {
  const links = Object.entries({ ...place.links, ...obj(place.raw.bookingLinks) }).filter(([, v]) => typeof v === 'string' && v);
  if (links.length === 0) return null;
  return (
    <Section title="連結">
      <ul className="links">
        {links.map(([k, v]) => (
          <li key={k}>
            {k === 'instagram' && !String(v).startsWith('http') ? (
              <span>Instagram {String(v)}</span>
            ) : (
              <a href={String(v)} target="_blank" rel="noreferrer">
                {LINK_LABELS[k] ?? k}
              </a>
            )}
          </li>
        ))}
      </ul>
    </Section>
  );
}

/**
 * 附近的點。電腦版（第八輪 §13.3 第 5 點）：點一列＝地圖上那個點變成水滴、跳三下（選中它；詳情自己的點保持水滴但不跳，MapView 的 detail 水滴），彈窗不動；
 * 列尾「詳情 ›」（或再點地圖上那個點）＝彈窗原地換成它。onPick（手機版）：點名稱改做這件事（例如打開它的詳情）
 */
export function NearbySection({ place, onPick }: { place: Place; onPick?(id: string): void }) {
  const places = useData((s) => s.places);
  const groups = useMemo(() => nearbyPlaces(place, places), [place, places]);
  if (groups.size === 0) return null;
  // 點了選中那個點（地圖的數字水滴，看得到就不動）；要看它的介紹，再點地圖上的點
  const find = (id: string) => {
    if (onPick) return onPick(id);
    appStore.getState().select(id);
    commands.focus(id);
  };
  return (
    <Section title="附近">
      <p className="muted small">{onPick ? '點名稱看它的介紹。' : '點名稱，地圖上那個點會跳出來；「詳情 ›」或再點地圖上的點看它的介紹。'}</p>
      {[...groups.entries()].map(([type, items]) => (
        <div key={type} className="nearby-group">
          <h4>{TYPE_LABELS[type]}</h4>
          <ul className="nearby">
            {items.map((it) => (
              <li key={it.place.id}>
                <button
                  type="button"
                  className="link-button"
                  data-testid="nearby-item"
                  onClick={() => find(it.place.id)}
                  onMouseEnter={() => appStore.getState().hover(it.place.id)}
                >
                  <TypeSeal type={type} size="sm" /> {displayName(it.place.name, it.place.id)}
                </button>
                <span className="muted small ic-text">
                  <Icon name="walk" size={16} /> {it.minutes} 分{it.estimated ? '（估算）' : ''}
                </span>
                {!onPick && (
                  <button type="button" className="link-button nearby-detail" onClick={() => appStore.getState().openDetail(it.place.id)} data-testid="nearby-detail">
                    詳情 ›
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}
      <p className="muted small">步行分鐘是一般成人的速度；全員一起走大約要乘 1.4。</p>
    </Section>
  );
}

/** 資料來源 */
export function SourcesSection({ place }: { place: Place }) {
  return (
    <section className="detail-section sources">
      <h3>來源（{place.sources.length}）</h3>
      <ul>
        {place.sources.map((s, i) => (
          <li key={i}>
            <a href={s.url} target="_blank" rel="noreferrer">
              {s.type}
            </a>
            <span className="muted small">
              {' '}
              {s.retrieved}
              {s.note ? `・${s.note}` : ''}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** 這個點排在哪幾天（想去卡片上也標「已排」）；點日期選那天（onDay：手機版另外切到行程分頁） */
function PlaceInTrip({ place, onDay }: { place: Place; onDay?(date: string): void }) {
  const itinerary = useData((s) => s.itinerary);
  const refs = itemsWithPlace(itinerary, place.id);
  const lodgingDays = itinerary?.days.filter((d) => d.lodging === place.id).map((d) => d.date) ?? [];
  if (!refs.length && !lodgingDays.length) return null;
  return (
    <section className="detail-section in-trip" data-testid="in-trip">
      <p className="small">
        <Icon name="calendar" size={16} /> 已排：
        {refs.map((r, i) => (
          <button key={r.item.id} type="button" className="link-button" onClick={() => (onDay ? onDay(r.date) : commands.selectDay(r.date))}>
            {i > 0 && '、'}
            {r.item.type === 'visit' && r.item.options[r.item.selected]?.place !== place.id ? '備選 ' : ''}
            {shortDayLabel(r.date)}
            {r.split ? `（${r.split.groupName}）` : ''}
          </button>
        ))}
        {lodgingDays.length > 0 && `${refs.length ? '；' : ''}住 ${lodgingDays.map(shortDayLabel).join('、')}`}
      </p>
    </section>
  );
}

/** 情境、料理、標章：和探索卡片一樣的小標籤 */
function Tags({ place }: { place: Place }) {
  const badges = placeBadges(place, 4);
  if (!place.contexts.length && !place.cuisine.length && !badges.length) return null;
  return (
    <p className="badges detail-tags">
      {badges.map((b) => (
        <span key={b.label} className={`badge badge-${b.tone}`}>
          {b.label}
        </span>
      ))}
      {place.contexts.map((c) => (
        <span key={c} className="badge">
          {CONTEXT_LABELS[c]}
        </span>
      ))}
      {place.cuisine.map((c) => (
        <span key={c} className="badge">
          {c}
        </span>
      ))}
    </p>
  );
}

/**
 * 介紹：簡介（優缺點、標籤）、問 AI、車站時刻表、價格、排在哪幾天。
 * 網頁版的「總覽」分頁、手機版整頁詳情的「簡介」分頁共用（onDay 見 PlaceInTrip；askAi false 時不畫問 AI）
 */
export function PlaceIntro({ place, fromTrip, onDay, askAi = true }: { place: Place; fromTrip: boolean; onDay?(date: string): void; askAi?: boolean }) {
  return (
    <>
      {place.summary && (
        <section className="detail-summary">
          <p>
            {place.summary.text}
            {editedOf(place, 'summary') && <EditedMark {...editedOf(place, 'summary')!} />}
          </p>
          {!!place.summary.pros?.length && (
            <ul className="pros">
              {place.summary.pros.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          )}
          {!!place.summary.cons?.length && (
            <ul className="cons">
              {place.summary.cons.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          )}
          <Tags place={place} />
        </section>
      )}
      {askAi && <AskAiBox place={place} fromTrip={fromTrip} />}
      {place.type === 'station' && <StationTimetablePanel place={place} />}
      <PriceSection place={place} />
      <PlaceInTrip place={place} onDay={onDay} />
    </>
  );
}

/** 詳細：住宿、團體、長輩小孩、營業時間（標出選的那天，沒選就用行程排到的第一天）。網頁版「詳細」分頁、手機版「簡介」分頁的下半 */
export function PlaceFacts({ place }: { place: Place }) {
  const day = useApp((s) => s.day);
  const days = useData((s) => s.days);
  const date = day !== 'all' ? day : (days.get(place.id)?.[0]?.date ?? null);
  const raw = place.raw;
  return (
    <>
      {place.type === 'lodging' && (
        <Section title="住宿">
          <dl>
            <Row k="餐食" v={label(MEALS_LABELS, raw.meals)} />
            <Row k="入住／退房" v={raw.checkIn || raw.checkOut ? `${text(raw.checkIn) ?? '?'}／${text(raw.checkOut) ?? '?'}` : null} />
            <Row k="接送" v={text(raw.pickup)} />
            <Row k="行李" v={text(raw.luggage)} />
          </dl>
        </Section>
      )}
      {place.type !== 'station' && <GroupSection place={place} />}
      <ElderKidsSection place={place} />
      {place.type !== 'station' && (
        <Section title="營業時間" edited={editedOf(place, 'hours', 'closedNote', 'febNote', 'closures')}>
          <HoursTable place={place} date={date} />
        </Section>
      )}
    </>
  );
}

/** 評論：各網站的評分全部列出來，加上我們自己的五項評分（詳情的「評論」分頁，手機、網頁共用 shared/ui/PlaceDetail） */
export function PlaceReviews({ place }: { place: Place }) {
  const all = ratingsOf(place);
  return (
    <section className="detail-section">
      <div className="ratings-box">{all.length ? all.map((r) => <RatingChip key={r.key} r={r} />) : <span className="muted small">還沒有網站評分</span>}</div>
      <ScoreBars place={place} />
    </section>
  );
}

/** 頂端列的高度（ui.css 的 .detail-bar 一樣） */
const BAR_H = 56;

/**
 * 網頁版的詳情彈窗（interaction-design §4、第八輪 §13.3、第九輪 §14.1）：照片頂到彈窗邊，左上「‹ 上一個的名字」、右上 ✕ 浮在照片上；
 * 往下捲過照片後兩顆按鈕黏在頂端，後面變白底（沒有上一個時左邊放這個點的名字，和手機的頂端列一樣）。沒照片的車站上面是矮的一條類型色塊（PlaceDetail）。下面是兩邊共用的 PlaceDetail（照片、名稱、動作列、四個分頁）。
 * 外框在 SidePanel.tsx：蓋在地圖右側（DetailFloat）或蓋住整個右欄（DetailOverSide）；同時只有一個，開著時換點是原地換內容（appStore.detailHistory）。
 */
export function DetailPanel({ place, from }: { place: Place; from: DetailFrom }) {
  const tab = useApp((s) => s.detailTab);
  const prevId = useApp((s) => s.detailHistory[s.detailHistory.length - 1] ?? null);
  const prev = useData((s) => (prevId ? s.byId.get(prevId) : undefined));
  const name = place.name.zh || place.name.ja;
  const ref = useRef<HTMLElement>(null);
  const [stuck, setStuck] = useState(false);
  // 捲動的是外框（.detail-float）：捲過照片就把頂端列變白底
  useEffect(() => {
    const box = ref.current?.parentElement;
    if (!box) return;
    const on = () => {
      const h = ref.current?.querySelector<HTMLElement>('.pd-hero')?.offsetHeight;
      const past = !h || box.scrollTop > h - BAR_H;
      setStuck((was) => (was === past ? was : past));
    };
    on();
    box.addEventListener('scroll', on, { passive: true });
    return () => box.removeEventListener('scroll', on);
  }, [place.id]);
  return (
    <article className="detail" ref={ref} data-testid="detail-panel" data-id={place.id} aria-label={`${name} 的詳情`}>
      <div className={`detail-bar ${stuck ? 'stuck' : ''}`} data-testid="detail-bar">
        {prev ? (
          <button type="button" className="detail-back" onClick={() => appStore.getState().detailBack()} data-testid="detail-back">
            <Icon name="back" size={16} />
            <span className="detail-back-name">{prev.name.zh || prev.name.ja}</span>
          </button>
        ) : (
          <span className="detail-bar-name" aria-hidden>
            {name}
          </span>
        )}
        <button type="button" className="icon-button detail-close" aria-label="關閉詳情" data-testid="detail-close" onClick={() => appStore.getState().closeDetail()}>
          <Icon name="close" size={20} />
        </button>
      </div>
      <PlaceDetail key={place.id} place={place} surface="desktop" from={from} initialTab={tab} />
    </article>
  );
}
