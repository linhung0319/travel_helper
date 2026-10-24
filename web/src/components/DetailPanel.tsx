import { useMemo, useState, type ReactNode } from 'react';
import { CopyName } from './CopyName.tsx';
import { appStore } from '../store.ts';
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
  LODGING_KIND_LABELS,
  MEALS_LABELS,
  METHOD_LABELS,
  RESERVATION_LABELS,
  SCORE_LABELS,
  SEATING_LABELS,
  label,
} from '../lib/labels.ts';
import { nearbyPlaces } from '../lib/nearby.ts';
import { photoCredit } from '../lib/photos.ts';
import { dayLabel, shortDayLabel } from '../lib/trip.ts';
import { TYPE_COLORS, TYPE_ICONS } from '../lib/typeStyle.ts';
import { placeBadges } from '../lib/badges.ts';
import type { Place } from '../data/types.ts';
import { Photo } from './Photo.tsx';
import { StationTimetablePanel } from './StationTimetable.tsx';
import { EditedMark, editedOf } from './EditHistory.tsx';
import { VoteButtons } from './Votes.tsx';
import { openDialog } from '../uiStore.ts';
import { itemsWithPlace } from '../lib/planView.ts';
import { dragPlaceProps, toggleAskAi } from './askAi.ts';

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
      {closure && <p className="warn">⚠️ {dayLabel(date!)} 休業：{closure.note ?? `${closure.from}～${closure.to}`}</p>}
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

/**
 * 評分：平常只看到 Google、食べログ（沒有的話換成其他網站的）；
 * 展開才看其他網站和我們自己的五項評分。
 */
function RatingsBox({ place }: { place: Place }) {
  const all = ratingsOf(place);
  const main = all.filter((r) => r.key === 'google' || r.key === 'tabelog');
  const shown = main.length ? main : all.slice(0, 2);
  const rest = all.filter((r) => !shown.includes(r));
  const more = rest.length > 0 || !!place.assessment;
  const chips = shown.length ? shown.map((r) => <RatingChip key={r.key} r={r} />) : <span className="muted small">還沒有網站評分</span>;
  if (!more) return <div className="ratings-box">{chips}</div>;
  return (
    <details className="ratings-box">
      <summary>
        {chips}
        <span className="ratings-more muted small">{place.assessment ? '我們的評分' : '更多'}</span>
      </summary>
      {rest.length > 0 && <div className="ratings-rest">{rest.map((r) => <RatingChip key={r.key} r={r} />)}</div>}
      <ScoreBars place={place} />
    </details>
  );
}

function LinksSection({ place }: { place: Place }) {
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

function NearbySection({ place }: { place: Place }) {
  const places = useData((s) => s.places);
  const groups = useMemo(() => nearbyPlaces(place, places), [place, places]);
  if (groups.size === 0) return null;
  // 點了地圖移到那個點、點會閃；要看它的介紹，再點地圖上的點（到探索的卡片）
  const find = (id: string) => {
    commands.focus(id);
    appStore.getState().hover(id);
  };
  return (
    <Section title="附近">
      <p className="muted small">點名稱，地圖會移到那裡；再點地圖上的點看它的介紹。</p>
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
                  {TYPE_ICONS[type]} {displayName(it.place.name, it.place.id)}
                </button>
                <span className="muted small">
                  🚶 {it.minutes} 分{it.estimated ? '（估算）' : ''}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
      <p className="muted small">步行分鐘是一般成人的速度；全員一起走大約要乘 1.4。</p>
    </Section>
  );
}

function SourcesSection({ place }: { place: Place }) {
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

/** 總覽的首張照片：類別標籤、照片張數（點了到「圖片」分頁） */
function HeroPhoto({ place, onMore }: { place: Place; onMore(): void }) {
  const first = place.photos[0];
  return (
    <figure className="detail-hero">
      <Photo place={place} showName />
      <span className="ex-type" style={{ background: TYPE_COLORS[place.type] }}>
        {TYPE_ICONS[place.type]} {TYPE_LABELS[place.type]}
      </span>
      {place.photos.length > 1 && (
        <button type="button" className="hero-more" onClick={onMore}>
          🖼 {place.photos.length} 張
        </button>
      )}
      {first && photoCredit(first) && <figcaption>{photoCredit(first)}</figcaption>}
    </figure>
  );
}

function PhotoGrid({ place }: { place: Place }) {
  return (
    <div className="photo-grid" aria-label="照片">
      {place.photos.map((ph, i) => (
        <figure key={ph.url} className="photo-grid-item">
          <Photo place={place} index={i} only showName />
          {photoCredit(ph) && <figcaption>{photoCredit(ph)}</figcaption>}
        </figure>
      ))}
    </div>
  );
}

/** 地點的分級：S 金、A 銀、B 銅的徽章 */
function TierMedal({ tier }: { tier: Place['tier'] }) {
  if (!tier) return null;
  return (
    <span className={`tier-medal tier-medal-${tier}`} title={`${tier} 級`} aria-label={`${tier} 級`}>
      <span className="tier-medal-letter">{tier}</span>
      <span className="tier-medal-word">RANK</span>
    </span>
  );
}

/** 這個點排在哪幾天（想去卡片上也標「已排」） */
function PlaceInTrip({ place }: { place: Place }) {
  const itinerary = useData((s) => s.itinerary);
  const refs = itemsWithPlace(itinerary, place.id);
  const lodgingDays = itinerary?.days.filter((d) => d.lodging === place.id).map((d) => d.date) ?? [];
  if (!refs.length && !lodgingDays.length) return null;
  return (
    <section className="detail-section in-trip" data-testid="in-trip">
      <p className="small">
        📅 已排：
        {refs.map((r, i) => (
          <button key={r.item.id} type="button" className="link-button" onClick={() => commands.selectDay(r.date)}>
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

type DetailTab = 'overview' | 'detail' | 'more' | 'photos';
const DETAIL_TABS: DetailTab[] = ['overview', 'detail', 'more', 'photos'];
const DETAIL_TAB_LABELS: Record<DetailTab, string> = { overview: '總覽', detail: '詳細', more: '附近・連結', photos: '圖片' };

/**
 * 詳情面板（interaction-design §4）：標題列（分級、名稱、❤️／👎）下面分成四頁——
 * 總覽（首張照片、評分、介紹、價格）、詳細（團體、長輩小孩、營業時間）、附近・連結（附近、連結、來源）、圖片。
 * 一打開不用捲就看得到介紹。
 */
export function DetailPanel({ place, back }: { place: Place; back?: { label: string; onClick(): void } }) {
  const day = useApp((s) => s.day);
  const planning = useApp((s) => s.planning);
  const selection = useApp((s) => s.selection);
  const days = useData((s) => s.days);
  const areas = useData((s) => s.areas);
  // 營業時間要標出的那天：選了某一天就用那天，否則用行程排到的第一天
  const date = day !== 'all' ? day : (days.get(place.id)?.[0]?.date ?? null);
  const area = areas.find((a) => a.id === place.area);
  const region = area?.regions?.find((r) => r.id === place.region);
  const raw = place.raw;
  const selected = selection.includes(place.id);
  // 換了地點回到「總覽」
  const [picked, setPicked] = useState<{ id: string; tab: DetailTab }>({ id: place.id, tab: 'overview' });
  const tabs = DETAIL_TABS.filter((t) => t !== 'photos' || place.photos.length > 0);
  const tab = picked.id === place.id && tabs.includes(picked.tab) ? picked.tab : 'overview';
  const go = (t: DetailTab) => setPicked({ id: place.id, tab: t });
  const name = place.name.zh || place.name.ja;

  return (
    <article className="detail" data-testid="detail-panel" aria-label={`${name} 的詳情`}>
      {/* 上方一列：返回（電腦版）、問 AI；規劃模式多一個「排進行程」。手機沒有返回，右邊是 ✕；想去用標題旁的 ❤️ */}
      <div className="detail-bar">
        {back && (
          <button type="button" className="detail-back" onClick={back.onClick} data-testid="detail-back">
            ← {back.label}
          </button>
        )}
        <span className="detail-bar-actions">
          {planning && place.type !== 'station' && (
            <button type="button" className="action small-action primary" data-testid="detail-add" onClick={() => openDialog({ kind: 'add', placeId: place.id })}>
              📅 {place.type === 'lodging' ? '設成住宿' : '排進行程'}
            </button>
          )}
          <button
            type="button"
            className={`action small-action ${selected ? 'on' : ''}`}
            onClick={() => toggleAskAi(place.id)}
            data-testid="detail-ask"
          >
            {selected ? '✓ 已帶進聊天' : '＋ 問 AI'}
          </button>
          {!back && (
            <button type="button" className="icon-button" aria-label="關閉詳情" data-testid="detail-close" onClick={() => appStore.getState().closeDetail()}>
              ✕
            </button>
          )}
        </span>
      </div>

      {/* 電腦版：標題可以拖到左邊的聊天室問 AI */}
      <header className={`detail-head ${back ? 'draggable' : ''}`} {...dragPlaceProps(place.id, !!back)} title={back ? '拖到左邊的聊天室可以問 AI' : undefined}>
        <TierMedal tier={place.tier} />
        <div className="detail-title">
          <div className="detail-name-row">
            <h2>{name}</h2>
            <CopyName place={place} />
          </div>
          <p className="muted small">
            {place.type === 'lodging' && raw.kind ? `${label(LODGING_KIND_LABELS, raw.kind)}・` : ''}
            {place.name.zh && place.name.ja !== place.name.zh ? `${place.name.ja}・` : ''}
            {[area && displayName(area.name), region && displayName(region.name)].filter(Boolean).join(' ')}
          </p>
        </div>
        <div className="detail-votes">
          <VoteButtons placeId={place.id} />
        </div>
      </header>

      <div className="detail-tabs" role="tablist" aria-label="詳情分頁">
        {tabs.map((t) => (
          <button key={t} type="button" role="tab" aria-selected={t === tab} className={t === tab ? 'on' : ''} onClick={() => go(t)} data-tab={t}>
            {DETAIL_TAB_LABELS[t]}
            {t === 'photos' && <span className="detail-tab-count">{place.photos.length}</span>}
          </button>
        ))}
      </div>

      <div className="detail-body" role="tabpanel">
        {tab === 'overview' && (
          <>
            {/* 車站沒有照片，不放替代圖 */}
            {(place.type !== 'station' || place.photos.length > 0) && <HeroPhoto place={place} onMore={() => go('photos')} />}
            {place.type !== 'station' && <RatingsBox place={place} />}
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
            {place.type === 'station' && <StationTimetablePanel place={place} />}
            <PriceSection place={place} />
            <PlaceInTrip place={place} />
          </>
        )}

        {tab === 'detail' && (
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
        )}

        {tab === 'more' && (
          <>
            <NearbySection place={place} />
            <LinksSection place={place} />
            <SourcesSection place={place} />
          </>
        )}

        {tab === 'photos' && <PhotoGrid place={place} />}
      </div>

      {usesRakuten(place) && (
        <p className="credit small">
          <a href="https://webservice.rakuten.co.jp/" target="_blank" rel="noreferrer">
            Supported by Rakuten Developers
          </a>
        </p>
      )}
    </article>
  );
}
