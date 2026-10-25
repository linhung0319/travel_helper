// 手機版的資料點詳情（第六輪 §3.3）：像點進 IG 的帳號，整頁蓋在分頁上面（原本的分頁不卸載，返回時捲動位置不變）。
// 最上面是大照片，左右滑（CSS scroll-snap），下面有小圓點；左上角「‹」返回（瀏覽器上一頁也一樣，見 mobileStore）。
// 照片下面：類型色塊、名稱、等級；日文名、★、地區；❤️ 想去 N、👎 N 兩個大按鈕（從想去打開多一個「📅 加到某天」）。
// 再下面是分頁：簡介（介紹、問 AI、團體、長輩小孩、營業時間、連結、來源）、交通（小地圖、地址、最近的車站、附近）、評論（各網站評分）、留言 N。
// 分頁的內容用網頁版 DetailPanel 抽出來的元件，版面自己排。小地圖是另開的一張不能互動的 MapLibre；點了切到行程分頁的地圖、框住這個點。

import { useEffect, useRef, useState } from 'react';
import { Map as MapLibreMap, Marker } from 'maplibre-gl';
import { useData } from '../hooks.ts';
import { commands } from '../appCommands.ts';
import { displayName } from '../data/normalize.ts';
import { TYPE_LABELS } from '../lib/filter.ts';
import { photoCandidates, photoCredit } from '../lib/photos.ts';
import { cardTypeLetter } from '../lib/planView.ts';
import { MODE_NAME, type ModeIconKey } from '../lib/modeIcon.ts';
import { TYPE_COLORS } from '../lib/typeStyle.ts';
import type { Place } from '../data/types.ts';
import type { VoteValue } from '../backend/types.ts';
import { Photo } from '../components/Photo.tsx';
import { TierBadge } from '../components/TierBadge.tsx';
import { AddToDay } from '../components/DayPicker.tsx';
import { castVote } from '../components/Votes.tsx';
import { Comments } from '../components/Wishlist.tsx';
import { STYLE_URL } from '../components/MapView.tsx';
import { LinksSection, NearbySection, PlaceFacts, PlaceIntro, PlaceReviews, SourcesSection, usesRakuten } from '../components/DetailPanel.tsx';
// askAi.ts 載入時才把「放進選取」接給 uiStore.askAboutPlace（問 AI 要帶地點），手機版這裡一定要載入
import '../components/askAi.ts';
import { useCommentCount } from '../shared/placeLists.ts';
import { placeAreaLabel, useVoteIndex } from './ExploreFeed.tsx';
import { Thumb } from './Thumb.tsx';
import { mobileStore, useMobile, type MobileTab } from './mobileStore.ts';

type Tab = 'intro' | 'transport' | 'reviews' | 'comments';
const TABS: Tab[] = ['intro', 'transport', 'reviews', 'comments'];
const TAB_LABELS: Record<Tab, string> = { intro: '簡介', transport: '交通', reviews: '評論', comments: '留言' };

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : {});

/** ★ 4.3（1,200）：Google 的評分（沒有就用食べログ） */
function starText(place: Place): string | null {
  const r = obj(place.raw.ratings);
  if (typeof r.google === 'number') return `★ ${r.google}${typeof r.googleReviews === 'number' ? `（${r.googleReviews.toLocaleString('ja-JP')}）` : ''}`;
  if (typeof r.tabelog === 'number') return `食べログ ${r.tabelog}`;
  return null;
}

/** 大照片：左右滑，下面的小圓點跟著滑到的那張 */
function PhotoCarousel({ place }: { place: Place }) {
  const [at, setAt] = useState(0);
  const count = place.photos.length;
  if (!photoCandidates(place.photos).length) {
    return (
      <div className="m-detail-photos" data-testid="m-detail-photos">
        <Thumb place={place} size="fill" />
      </div>
    );
  }
  const onScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    setAt(Math.round(el.scrollLeft / Math.max(1, el.clientWidth)));
  };
  const credit = photoCredit(place.photos[at] ?? place.photos[0]);
  return (
    <>
      <div className="m-detail-photos" data-testid="m-detail-photos" onScroll={onScroll}>
        {place.photos.map((ph, i) => (
          <figure key={ph.url} className="m-detail-slide">
            <Photo place={place} index={i} only={count > 1} showName />
          </figure>
        ))}
      </div>
      {count > 1 && (
        <div className="m-detail-dots" aria-label={`第 ${at + 1} 張，共 ${count} 張`}>
          {place.photos.map((ph, i) => (
            <span key={ph.url} className={i === at ? 'on' : ''} />
          ))}
        </div>
      )}
      {credit && <span className="m-detail-credit">{credit}</span>}
    </>
  );
}

/** 交通分頁的小地圖：不能拖、不能縮放；點了到行程分頁的地圖、框住這個點 */
function MiniMap({ place }: { place: Place }) {
  const ref = useRef<HTMLDivElement>(null);
  const [lon, lat] = place.coords;
  useEffect(() => {
    const map = new MapLibreMap({ container: ref.current!, style: STYLE_URL, center: [lon, lat], zoom: 14, interactive: false, attributionControl: { compact: true } });
    new Marker({ color: TYPE_COLORS[place.type] }).setLngLat([lon, lat]).addTo(map);
    return () => map.remove();
  }, [lon, lat, place.type]);
  const toTrip = () => {
    mobileStore.getState().setTab('trip');
    commands.focus(place.id);
  };
  return (
    <div className="m-minimap">
      <div ref={ref} className="m-minimap-map" aria-hidden />
      <button type="button" className="m-minimap-hit" onClick={toTrip} data-testid="m-detail-minimap" aria-label="在行程的地圖上看">
        <span className="m-minimap-label">🗺 在行程的地圖上看 ›</span>
      </button>
    </div>
  );
}

/** 交通分頁：小地圖、地址、最近的車站、怎麼去、附近的點（點了換成那個點的詳情） */
function TransportTab({ place }: { place: Place }) {
  const byId = useData((s) => s.byId);
  const from = useMobile((s) => s.detail?.from ?? 'explore');
  const raw = place.raw;
  const station = obj(raw.nearestStation);
  const stationName = (id: unknown) => {
    const p = typeof id === 'string' ? byId.get(id) : undefined;
    return p ? displayName(p.name, p.id) : typeof id === 'string' ? id : null;
  };
  const mode = (m: unknown) => (typeof m === 'string' ? (MODE_NAME[m as ModeIconKey] ?? m) : '');
  const access = Array.isArray(raw.access) ? (raw.access as Obj[]) : [];
  return (
    <>
      <MiniMap place={place} />
      <dl className="m-detail-dl">
        {typeof raw.address === 'string' && (
          <div className="row">
            <dt>地址</dt>
            <dd>{raw.address}</dd>
          </div>
        )}
        {station.id != null && (
          <div className="row">
            <dt>最近的車站</dt>
            <dd>
              {stationName(station.id)}・{mode(station.mode)} {typeof station.minutes === 'number' ? `${station.minutes} 分` : ''}
              {typeof station.note === 'string' && <span className="muted small">（{station.note}）</span>}
            </dd>
          </div>
        )}
        {access.length > 0 && (
          <div className="row">
            <dt>怎麼去</dt>
            <dd>
              {access.map((a, i) => (
                <span key={i} className="m-detail-access">
                  {stationName(a.from)} {mode(a.mode)} {typeof a.minutes === 'number' ? `${a.minutes} 分` : ''}
                  {typeof a.note === 'string' && <span className="muted small">（{a.note}）</span>}
                </span>
              ))}
            </dd>
          </div>
        )}
      </dl>
      <NearbySection place={place} onPick={(id) => mobileStore.getState().openPlace(id, from)} />
    </>
  );
}

/** 名稱下面的大按鈕：❤️ 想去 N、👎 N；從想去打開多一個「📅 加到某天」 */
function BigVotes({ place, fromWish }: { place: Place; fromWish: boolean }) {
  const { like, dislike, mine } = useVoteIndex()(place.id);
  const toggle = (value: VoteValue) => void castVote(place.id, mine === value ? null : value);
  return (
    <div className="m-detail-votes">
      <button type="button" className={`m-big-vote ${mine === 'like' ? 'on' : ''}`} aria-pressed={mine === 'like'} onClick={() => toggle('like')} data-testid="m-detail-like">
        {mine === 'like' ? '❤️' : '🤍'} 想去 {like}
      </button>
      <button type="button" className={`m-big-vote ${mine === 'dislike' ? 'on' : ''}`} aria-pressed={mine === 'dislike'} onClick={() => toggle('dislike')} data-testid="m-detail-dislike">
        👎 {dislike}
      </button>
      {fromWish && (
        <span className="m-detail-add" data-testid="m-detail-add">
          <AddToDay placeId={place.id} />
        </span>
      )}
    </div>
  );
}

/** 一個點的整頁內容（換點時整個重來：分頁回到簡介、捲回最上面） */
function DetailContent({ place, from }: { place: Place; from: MobileTab }) {
  const areas = useData((s) => s.areas);
  const comments = useCommentCount(place.id);
  const [tab, setTab] = useState<Tab>('intro');
  const name = place.name.zh || place.name.ja;
  const sub = [place.name.zh && place.name.ja !== place.name.zh ? place.name.ja : null, starText(place), placeAreaLabel(place, areas)].filter(Boolean).join('・');
  // 排在哪天：選那天、切到行程分頁
  const onDay = (date: string) => {
    commands.selectDay(date);
    mobileStore.getState().setTab('trip');
  };
  return (
    <div className="m-detail-scroll">
      <div className="m-detail-hero">
        <PhotoCarousel place={place} />
      </div>
      <header className="m-detail-head">
        <div className="m-detail-title">
          <span className="m-detail-type" style={{ background: TYPE_COLORS[place.type] }} aria-label={TYPE_LABELS[place.type]}>
            {cardTypeLetter(place.type)}
          </span>
          <h2 className="m-h2 m-ellipsis" data-testid="m-detail-name">
            {name}
          </h2>
          <TierBadge tier={place.tier} />
        </div>
        {sub && <p className="m-detail-sub muted small">{sub}</p>}
        <BigVotes place={place} fromWish={from === 'wish'} />
      </header>
      <div className="m-detail-tabs" role="tablist" aria-label="詳情分頁">
        {TABS.map((t) => (
          <button key={t} type="button" role="tab" aria-selected={t === tab} className={t === tab ? 'on' : ''} onClick={() => setTab(t)} data-testid={`m-detail-tab-${t}`}>
            {TAB_LABELS[t]}
            {t === 'comments' && comments > 0 ? ` ${comments}` : ''}
          </button>
        ))}
      </div>
      <div className="m-detail-body" role="tabpanel">
        {tab === 'intro' && (
          <>
            <PlaceIntro place={place} fromTrip={from === 'trip'} onDay={onDay} />
            <PlaceFacts place={place} />
            <LinksSection place={place} />
            <SourcesSection place={place} />
          </>
        )}
        {tab === 'transport' && <TransportTab place={place} />}
        {tab === 'reviews' && <PlaceReviews place={place} />}
        {tab === 'comments' && <Comments target={place.id} open />}
        {usesRakuten(place) && (
          <p className="credit small">
            <a href="https://webservice.rakuten.co.jp/" target="_blank" rel="noreferrer">
              Supported by Rakuten Developers
            </a>
          </p>
        )}
      </div>
    </div>
  );
}

/** 整頁詳情：mobileStore.detail 有值時蓋在分頁上面 */
export function PlaceDetailPage() {
  const detail = useMobile((s) => s.detail);
  const place = useData((s) => (detail ? s.byId.get(detail.placeId) : undefined));
  if (!detail) return null;
  const name = place ? place.name.zh || place.name.ja : detail.placeId;
  return (
    <section className="m-full m-detail" data-testid="m-detail" data-id={detail.placeId} aria-label={`${name} 的詳情`}>
      {place ? <DetailContent key={place.id} place={place} from={detail.from} /> : <p className="muted m-empty">找不到這個地點。</p>}
      <button type="button" className="m-back m-detail-back" onClick={() => mobileStore.getState().closePlace()} aria-label="返回" data-testid="m-detail-back">
        ‹
      </button>
    </section>
  );
}
