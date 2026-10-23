import { useMemo, type ReactNode } from 'react';
import { appStore } from '../store.ts';
import { commands } from '../appCommands.ts';
import { useApp, useData, useShared } from '../hooks.ts';
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
import { TYPE_ICONS } from '../lib/typeStyle.ts';
import type { Place } from '../data/types.ts';
import { Photo } from './Photo.tsx';
import { TierBadge } from './TierBadge.tsx';
import { StationTimetablePanel } from './StationTimetable.tsx';
import { EditedMark, editedOf } from './EditHistory.tsx';
import { VoteButtons, VoteSummary } from './Votes.tsx';
import { SuggestionCard } from './Suggestions.tsx';
import { openDialog } from '../uiStore.ts';
import { itemsWithPlace } from '../lib/planView.ts';

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

function RatingsLine({ place }: { place: Place }) {
  const r = obj(place.raw.ratings);
  const parts: string[] = [];
  const add = (name: string, score: unknown, count: unknown) => {
    if (typeof score === 'number') parts.push(`${name} ${score}${typeof count === 'number' ? `（${count.toLocaleString('ja-JP')}）` : ''}`);
  };
  add('Google', r.google, r.googleReviews);
  add('食べログ', r.tabelog, r.tabelogReviews);
  add('楽天', r.rakuten, r.rakutenReviews);
  add('じゃらん', r.jalan, r.jalanReviews);
  if (parts.length === 0) return place.type === 'lodging' ? <p className="muted small">無評分</p> : null;
  return <p className="ratings small">{parts.join('　')}</p>;
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
  return (
    <Section title="附近">
      {[...groups.entries()].map(([type, items]) => (
        <div key={type} className="nearby-group">
          <h4>{TYPE_LABELS[type]}</h4>
          <ul className="nearby">
            {items.map((it) => (
              <li key={it.place.id}>
                <button
                  type="button"
                  className="link-button"
                  onClick={() => appStore.getState().openDetail(it.place.id)}
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
    <details className="detail-section sources">
      <summary>來源（{place.sources.length}）</summary>
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
    </details>
  );
}

function PhotoCarousel({ place }: { place: Place }) {
  if (place.photos.length === 0) return <Photo place={place} className="carousel-single" showName />;
  return (
    <div className="carousel" aria-label="照片">
      {place.photos.map((ph, i) => (
        <figure key={ph.url} className="carousel-item">
          <Photo place={place} index={i} only showName />
          {photoCredit(ph) && <figcaption>{photoCredit(ph)}</figcaption>}
        </figure>
      ))}
    </div>
  );
}

/** 這個點排在哪幾天、有哪些建議提到它（地圖上的 💬） */
function PlaceInTrip({ place }: { place: Place }) {
  const itinerary = useData((s) => s.itinerary);
  const suggestions = useShared((s) => s.suggestions);
  const refs = itemsWithPlace(itinerary, place.id);
  const lodgingDays = itinerary?.days.filter((d) => d.lodging === place.id).map((d) => d.date) ?? [];
  const about = suggestions.filter((s) => s.placeIds.includes(place.id));
  if (!refs.length && !lodgingDays.length && !about.length) return null;
  return (
    <section className="detail-section in-trip">
      {(refs.length > 0 || lodgingDays.length > 0) && (
        <p className="small">
          📅 排在：
          {refs.map((r, i) => (
            <button key={r.item.id} type="button" className="link-button" onClick={() => commands.selectDay(r.date)}>
              {i > 0 && '、'}
              {shortDayLabel(r.date)}
              {r.item.type === 'visit' && r.item.options[r.item.selected]?.place !== place.id ? '（備案）' : ''}
              {r.split ? `（${r.split.groupName}）` : ''}
            </button>
          ))}
          {lodgingDays.length > 0 && `${refs.length ? '；' : ''}住 ${lodgingDays.map(shortDayLabel).join('、')}`}
        </p>
      )}
      {about.length > 0 && (
        <details open={about.some((s) => s.status === 'pending')}>
          <summary className="small">💬 {about.length} 則建議提到這裡</summary>
          <div className="suggestion-list">
            {about.map((s) => (
              <SuggestionCard key={s.id} s={s} showDay />
            ))}
          </div>
        </details>
      )}
    </section>
  );
}

/** 詳情面板（interaction-design §4），由上往下照文件的順序 */
export function DetailPanel({ place }: { place: Place }) {
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

  return (
    <article className="detail" data-testid="detail-panel" aria-label={`${place.name.zh || place.name.ja} 的詳情`}>
      <header className="detail-head">
        <div className="detail-title">
          <h2>
            <TierBadge tier={place.tier} />
            {place.name.zh || place.name.ja}
          </h2>
          <p className="muted small">
            {TYPE_ICONS[place.type]} {TYPE_LABELS[place.type]}
            {place.type === 'lodging' && raw.kind ? `・${label(LODGING_KIND_LABELS, raw.kind)}` : ''}
            {place.name.zh && place.name.ja !== place.name.zh ? `・${place.name.ja}` : ''}
            {area ? `・${displayName(area.name)}` : ''}
            {region ? `・${displayName(region.name)}` : ''}
          </p>
        </div>
        <button type="button" className="icon-button" aria-label="關閉詳情" data-testid="detail-close" onClick={() => appStore.getState().closeDetail()}>
          ✕
        </button>
      </header>
      {/* ❤️／👎、寫建議（T15m）；問 AI 先放進選取，T16 的聊天室再用；規劃模式多一個「排進行程」 */}
      <div className="detail-actions">
        <VoteButtons placeId={place.id} />
        <button
          type="button"
          className="action"
          data-testid="detail-suggest"
          onClick={() => openDialog({ kind: 'suggest', placeIds: [place.id], day: day !== 'all' ? day : undefined })}
        >
          ✏️ 寫建議
        </button>
        <button
          type="button"
          className={`action ${selected ? 'on' : ''}`}
          onClick={() => (selected ? commands.unselect(place.id) : commands.select(place.id))}
        >
          💬 {selected ? '已帶進聊天' : '問 AI'}
        </button>
        {planning && place.type !== 'station' && (
          <button type="button" className="action primary" data-testid="detail-add" onClick={() => openDialog({ kind: 'add', placeId: place.id })}>
            📅 {place.type === 'lodging' ? '設成住宿' : '排進行程'}
          </button>
        )}
      </div>
      <VoteSummary placeId={place.id} />
      <PlaceInTrip place={place} />

      {/* 車站沒有照片，不放替代圖 */}
      {(place.type !== 'station' || place.photos.length > 0) && <PhotoCarousel place={place} />}

      {place.type === 'station' && <StationTimetablePanel place={place} />}

      {(place.assessment || place.tier) && (
        <Section title="評分">
          <RatingsLine place={place} />
          <ScoreBars place={place} />
        </Section>
      )}
      {!place.assessment && place.type !== 'station' && <RatingsLine place={place} />}

      {place.summary && (
        <Section title="介紹" edited={editedOf(place, 'summary')}>
          <p>{place.summary.text}</p>
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
          {place.contexts.length > 0 && <p className="muted small">情境：{place.contexts.map((c) => CONTEXT_LABELS[c]).join('、')}</p>}
          {place.cuisine.length > 0 && <p className="muted small">料理：{place.cuisine.join('、')}</p>}
        </Section>
      )}

      {place.type !== 'station' && <GroupSection place={place} />}
      <ElderKidsSection place={place} />

      {place.type !== 'station' && (
        <Section title="營業時間" edited={editedOf(place, 'hours', 'closedNote', 'febNote', 'closures')}>
          <HoursTable place={place} date={date} />
        </Section>
      )}

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

      <PriceSection place={place} />
      <LinksSection place={place} />
      <NearbySection place={place} />
      <SourcesSection place={place} />

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
