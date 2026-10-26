// 詳情的內容，手機（mobile/PlaceDetailPage）和網頁（components/DetailPanel）共用（第七輪 §7）：
// 照片輪播（點了放大）、名稱列（等級、名稱、複製日文名、網頁多一顆愛心）、動作列（❤ 想去 N、👎 N、加到某天，編輯中從行程打開多「排進這天」）、
// 四個分頁——簡介、交通、評論、留言（車站只有前兩個）。手機另外有捲過照片才出現的白色頂端列（‹、名稱、❤），分頁列接在它下面。
// 這個檔只管版面和投票；分頁裡的各區塊（介紹、團體、附近…）還是 components/DetailPanel 匯出的那些元件。
// 這個檔和 DetailPanel.tsx 互相 import（這裡用它的區塊、它用這裡的版面），都只在 render 時用，沒有載入順序的問題。

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { appStore, type DetailTabId } from '../../store.ts';
import { commands } from '../../appCommands.ts';
import { useApp, useData, useShared } from '../../hooks.ts';
import { displayName } from '../../data/normalize.ts';
import { photoCandidates, photoCredit } from '../../lib/photos.ts';
import { label, LODGING_KIND_LABELS } from '../../lib/labels.ts';
import { MODE_NAME, type ModeIconKey } from '../../lib/modeIcon.ts';
import type { Place } from '../../data/types.ts';
import type { VoteValue } from '../../backend/types.ts';
import { openDialog } from '../../uiStore.ts';
import { Photo } from '../../components/Photo.tsx';
import { Icon } from '../../components/Icon.tsx';
import { CopyName } from '../../components/CopyName.tsx';
import { AddToDay } from '../../components/DayPicker.tsx';
import { castVote } from '../../components/Votes.tsx';
import { Comments } from '../../components/Wishlist.tsx';
import { NameList } from '../../components/common.tsx';
import { dragPlaceProps } from '../../components/askAi.ts';
import { LinksSection, NearbySection, PlaceFacts, PlaceIntro, PlaceReviews, SourcesSection, usesRakuten } from '../../components/DetailPanel.tsx';
import { useCommentCount } from '../placeLists.ts';
import { Button } from './Button.tsx';
import { PhotoViewer } from './PhotoViewer.tsx';
import { TierMark } from './TierMark.tsx';
import { TypeLabel } from './TypeLabel.tsx';
import { VoteHeart } from './VoteHeart.tsx';

export const DETAIL_TABS = ['intro', 'transport', 'reviews', 'comments'] as const;
export const DETAIL_TAB_LABELS: Record<DetailTabId, string> = { intro: '簡介', transport: '交通', reviews: '評論', comments: '留言' };

/** 圓點最多幾顆；超過改寫「3 / 12」 */
const MAX_DOTS = 5;

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : {});

/** 簡介上方的一行：Google ★ 4.7（1,200）；沒有 Google 就用食べログ */
function starLine(place: Place): string | null {
  const r = obj(place.raw.ratings);
  if (typeof r.google === 'number') return `Google ★ ${r.google}${typeof r.googleReviews === 'number' ? `（${r.googleReviews.toLocaleString('ja-JP')}）` : ''}`;
  if (typeof r.tabelog === 'number') return `食べログ ★ ${r.tabelog}`;
  return null;
}

/** 照片輪播：左右滑（CSS scroll-snap）、網頁多左右鈕；點照片放大。沒有照片時是類型色塊 */
function PhotoCarousel({ place, desktop, onOpen }: { place: Place; desktop: boolean; onOpen(index: number): void }) {
  const [at, setAt] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const count = place.photos.length;
  const usable = photoCandidates(place.photos).length > 0;
  const onScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    setAt(Math.round(el.scrollLeft / Math.max(1, el.clientWidth)));
  };
  const scrollTo = (i: number) => {
    const el = ref.current;
    if (el) el.scrollTo({ left: i * el.clientWidth, behavior: 'smooth' });
  };
  const credit = photoCredit(place.photos[at] ?? place.photos[0]);
  return (
    <div className="pd-photos-wrap">
      <div className="pd-photos" ref={ref} onScroll={onScroll} data-testid="m-detail-photos">
        {usable ? (
          place.photos.map((ph, i) => (
            <button key={ph.url} type="button" className="pd-slide" aria-label={`放大第 ${i + 1} 張照片`} data-testid="detail-photo" onClick={() => onOpen(i)}>
              <Photo place={place} index={i} only showName />
            </button>
          ))
        ) : (
          <figure className="pd-slide pd-slide-empty">
            <Photo place={place} showName />
          </figure>
        )}
      </div>
      {count > 1 &&
        (count > MAX_DOTS ? (
          <span className="pd-count" aria-label={`第 ${at + 1} 張，共 ${count} 張`}>
            {at + 1} / {count}
          </span>
        ) : (
          <div className="pd-dots" aria-label={`第 ${at + 1} 張，共 ${count} 張`}>
            {place.photos.map((ph, i) => (
              <span key={ph.url} className={i === at ? 'on' : ''} />
            ))}
          </div>
        ))}
      {desktop && count > 1 && (
        <>
          <button type="button" className="ui-btn ui-btn-icon pd-arrow pd-prev" aria-label="上一張" disabled={at <= 0} onClick={() => scrollTo(at - 1)}>
            <Icon name="chevron" />
          </button>
          <button type="button" className="ui-btn ui-btn-icon pd-arrow pd-next" aria-label="下一張" disabled={at >= count - 1} onClick={() => scrollTo(at + 1)}>
            <Icon name="chevron" />
          </button>
        </>
      )}
      {credit && <span className="pd-credit">{credit}</span>}
    </div>
  );
}

/** 這個點的投票：誰按了想去、不想去、我按的 */
function useVotesOf(placeId: string) {
  const votes = useShared((s) => s.votes);
  const me = useShared((s) => s.me?.id);
  const list = votes.filter((v) => v.placeId === placeId && !v.deletedAt);
  const likes = list.filter((v) => v.value === 'like').map((v) => v.memberId);
  const dislikes = list.filter((v) => v.value === 'dislike').map((v) => v.memberId);
  return { likes, dislikes, mine: (list.find((v) => v.memberId === me)?.value ?? null) as VoteValue | null };
}

/**
 * 照片下面的動作列：❤ 想去（點了投或收回）、後面的數字（點了看是誰想去：網頁是浮出的小視窗，手機直接展開在下面）、👎 N、
 * 主要按鈕「加到某天」；誰想去用 NameList（網頁浮在數字下面，手機直接展開在動作列下面）；編輯中從行程打開多一個「排進這天」（住宿是「設成這晚的住宿」）。
 */
function ActionRow({ place, desktop, schedule }: { place: Place; desktop: boolean; schedule: boolean }) {
  const { likes, dislikes, mine } = useVotesOf(place.id);
  const [who, setWho] = useState(false);
  const wrap = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!who || !desktop) return;
    const close = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setWho(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [who, desktop]);
  const toggle = (value: VoteValue) => void castVote(place.id, mine === value ? null : value);
  const lodging = place.type === 'lodging';
  return (
    <>
      <div className="pd-actions" data-testid="detail-actions">
        <span className="pd-like-wrap" ref={wrap}>
          <span className={`pd-like ${mine === 'like' ? 'on' : ''}`}>
            <button type="button" className="pd-like-btn" aria-pressed={mine === 'like'} onClick={() => toggle('like')} data-testid="detail-like">
              <Icon name="heart" size={20} filled={mine === 'like'} /> 想去
            </button>
            <button
              type="button"
              className="pd-like-count"
              aria-expanded={who}
              aria-label={likes.length ? `${likes.length} 人想去，看是誰` : '還沒有人想去'}
              disabled={likes.length === 0}
              onClick={() => setWho(!who)}
              data-testid="detail-who"
            >
              {likes.length}
            </button>
          </span>
          {who && desktop && likes.length > 0 && <NameList ids={likes} className="pd-who" />}
        </span>
        <button
          type="button"
          className={`pd-dislike ${mine === 'dislike' ? 'on' : ''}`}
          aria-pressed={mine === 'dislike'}
          onClick={() => toggle('dislike')}
          data-testid="detail-dislike"
        >
          <Icon name="thumb-down" size={20} filled={mine === 'dislike'} /> {dislikes.length}
        </button>
        {place.type !== 'station' && (
          <span className="pd-add" data-testid="detail-add">
            <AddToDay placeId={place.id} />
          </span>
        )}
        {schedule && (
          <Button kind="secondary" size="sm" icon="calendar" data-testid="detail-schedule" onClick={() => openDialog({ kind: 'add', placeId: place.id })}>
            {lodging ? '設成這晚的住宿' : '排進這天'}
          </Button>
        )}
      </div>
      {who && !desktop && likes.length > 0 && <NameList ids={likes} className="pd-who-inline" />}
    </>
  );
}

/** 交通分頁：地址、最近的車站、怎麼去、附近的點；locator 是手機的小地圖，網頁沒給就畫「在地圖上找到它」 */
function TransportTab({ place, locator, onPick }: { place: Place; locator?: ReactNode; onPick?(id: string): void }) {
  const byId = useData((s) => s.byId);
  const raw = place.raw;
  const station = obj(raw.nearestStation);
  const stationName = (id: unknown) => {
    const p = typeof id === 'string' ? byId.get(id) : undefined;
    return p ? displayName(p.name, p.id) : typeof id === 'string' ? id : null;
  };
  const mode = (m: unknown) => (typeof m === 'string' ? (MODE_NAME[m as ModeIconKey] ?? m) : '');
  const access = Array.isArray(raw.access) ? (raw.access as Obj[]) : [];
  // 「在地圖上找到它」：選中（數字水滴），地圖看得到就不動
  const find = () => {
    appStore.getState().select(place.id);
    commands.focus(place.id);
  };
  return (
    <>
      {locator ?? (
        <Button kind="secondary" size="sm" icon="map" className="pd-find" data-testid="detail-find-on-map" onClick={find}>
          在地圖上找到它
        </Button>
      )}
      <dl className="pd-dl">
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
                <span key={i} className="pd-access">
                  {stationName(a.from)} {mode(a.mode)} {typeof a.minutes === 'number' ? `${a.minutes} 分` : ''}
                  {typeof a.note === 'string' && <span className="muted small">（{a.note}）</span>}
                </span>
              ))}
            </dd>
          </div>
        )}
      </dl>
      <NearbySection place={place} onPick={onPick} />
    </>
  );
}

export interface PlaceDetailProps {
  place: Place;
  surface: 'desktop' | 'mobile';
  /** 從哪裡打開：網頁是 'map'（行程）／'explore'／'wish'，手機是分頁名（'trip'…）。行程來的才有「排進這天」、問 AI 多一個「這天排不下？」 */
  from: string;
  /** 一打開就選的分頁（想去列的最新留言：comments） */
  initialTab?: DetailTabId | null;
  /** 簡介裡「已排」的日期被點了（手機要另外切到行程分頁） */
  onDay?(date: string): void;
  /** 簡介要不要畫問 AI（手機編輯中從行程打開時藏起來） */
  askAi?: boolean;
  /** 交通分頁的附近：點名稱改做這件事（手機：換成那個點的詳情）；沒給＝地圖移過去 */
  onPickNearby?(id: string): void;
  /** 交通分頁最上面的東西（手機：小地圖）；沒給＝「在地圖上找到它」按鈕 */
  locator?: ReactNode;
  /** 手機：頂端列和照片上的「‹」 */
  onBack?(): void;
}

/** 一個點的詳情內容。換點時要整個重來（呼叫的人用 key={place.id}） */
export function PlaceDetail({ place, surface, from, initialTab, onDay, askAi = true, onPickNearby, locator, onBack }: PlaceDetailProps) {
  const desktop = surface === 'desktop';
  const areas = useData((s) => s.areas);
  const planning = useApp((s) => s.planning);
  const comments = useCommentCount(place.id);
  const tabs = DETAIL_TABS.filter((t) => place.type !== 'station' || t === 'intro' || t === 'transport');
  const [tab, setTab] = useState<DetailTabId>(initialTab && tabs.includes(initialTab) ? initialTab : 'intro');
  const [viewer, setViewer] = useState<number | null>(null);
  const heroRef = useRef<HTMLDivElement>(null);
  const hasHero = place.type !== 'station' || place.photos.length > 0;
  // 手機的頂端列：捲過照片才出現（沒有照片時一直在）
  const [scrolled, setScrolled] = useState(false);
  const onScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (desktop) return;
    const past = e.currentTarget.scrollTop > (heroRef.current?.offsetHeight ?? 0) - 56;
    setScrolled((was) => (was === past ? was : past));
  };
  const fromTrip = from === 'map' || from === 'trip';
  const name = place.name.zh || place.name.ja;
  const area = areas.find((a) => a.id === place.area);
  const region = area?.regions?.find((r) => r.id === place.region);
  const sub = [
    place.type === 'lodging' && place.raw.kind ? label(LODGING_KIND_LABELS, place.raw.kind) : null,
    place.name.zh && place.name.ja !== place.name.zh ? place.name.ja : null,
    [area && displayName(area.name), region && displayName(region.name)].filter(Boolean).join(' ') || null,
  ].filter(Boolean);
  const stars = starLine(place);
  const barShown = scrolled || !hasHero;

  return (
    <div className={`pd pd-${surface} ${desktop ? '' : 'm-detail-scroll'}`} onScroll={onScroll} data-testid="place-detail">
      {!desktop && (
        <div className="m-detail-bar" data-testid="m-detail-bar" data-shown={barShown} aria-hidden={!barShown}>
          <button type="button" className="m-back" onClick={onBack} aria-label="返回" data-testid="m-detail-bar-back" tabIndex={barShown ? 0 : -1}>
            <Icon name="back" size={24} />
          </button>
          <span className="m-detail-bar-name">{name}</span>
          <VoteHeart placeId={place.id} />
        </div>
      )}
      {hasHero && (
        <div className="pd-hero" ref={heroRef}>
          <PhotoCarousel place={place} desktop={desktop} onOpen={setViewer} />
          {!desktop && onBack && (
            <button type="button" className="m-back m-detail-back" onClick={onBack} aria-label="返回" data-testid="m-detail-back">
              <Icon name="back" size={24} />
            </button>
          )}
        </div>
      )}
      <header className={`pd-head detail-head ${desktop ? 'draggable' : ''}`} {...dragPlaceProps(place.id, desktop)} title={desktop ? '拖到左邊的聊天室可以問 AI' : undefined}>
        <div className="pd-title">
          <div className="pd-title-row">
            <TierMark tier={place.tier} />
            <h2 className="pd-name" data-testid={desktop ? 'detail-name' : 'm-detail-name'}>
              {name}
            </h2>
            <CopyName place={place} />
          </div>
          <p className="pd-sub muted small">
            <TypeLabel type={place.type} />
            {sub.length > 0 && <span> ・{sub.join('・')}</span>}
          </p>
        </div>
        {desktop && <VoteHeart placeId={place.id} />}
      </header>

      <ActionRow place={place} desktop={desktop} schedule={planning && fromTrip && place.type !== 'station'} />

      <div className="pd-tabs" role="tablist" aria-label="詳情分頁">
        {tabs.map((t) => (
          <button key={t} type="button" role="tab" aria-selected={t === tab} className={t === tab ? 'on' : ''} onClick={() => setTab(t)} data-testid={`detail-tab-${t}`}>
            {DETAIL_TAB_LABELS[t]}
            {t === 'comments' && comments > 0 ? ` ${comments}` : ''}
          </button>
        ))}
      </div>

      <div className="pd-body" role="tabpanel">
        {tab === 'intro' && (
          <>
            {stars && (
              <button type="button" className="pd-stars" onClick={() => setTab('reviews')} data-testid="detail-stars" disabled={!tabs.includes('reviews')}>
                {stars}
              </button>
            )}
            <PlaceIntro place={place} fromTrip={fromTrip} onDay={onDay} askAi={askAi} />
            <PlaceFacts place={place} />
            <LinksSection place={place} />
            <SourcesSection place={place} />
          </>
        )}
        {tab === 'transport' && <TransportTab place={place} locator={locator} onPick={onPickNearby} />}
        {tab === 'reviews' && <PlaceReviews place={place} />}
        {tab === 'comments' && <Comments target={place.id} bare />}
        {usesRakuten(place) && (
          <p className="credit small">
            <a href="https://webservice.rakuten.co.jp/" target="_blank" rel="noreferrer">
              Supported by Rakuten Developers
            </a>
          </p>
        )}
      </div>
      {viewer !== null && <PhotoViewer place={place} start={viewer} onClose={() => setViewer(null)} />}
    </div>
  );
}
