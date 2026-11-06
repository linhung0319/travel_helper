// 想去的清單（網頁右欄、手機想去分頁共用，設計 §5.3、T53 interaction-design §25）：按「排了沒有」分三排書架（還沒排、已是候選、已排進行程）。
// 每排先放 3 張小卡（同探索選了一區的書架，ShelfCard），候選、已排的小卡下面寫「2/7 候選」「2/5 排了」，點了開詳情；右邊「全部 N ›」進那排的照片牆或清單
// （wishPrefs.section），返回鈕「‹ 還沒排 · 6 個地點」在篩選列。空的那排寫一行灰字（「全部都排了」「還沒有候選」）。分段的計算在 shared/wishSections.ts。
// 某一排的全部：先顯示 8 個，下面「再顯示 15 個」；候選、已排按日期分小段（2/5（五）· 3）。
// 列是 PlaceRow 的變體：第二行是誰想去（頭像＋名字）或候選／已排膠囊＋頭像，第三行是最新一則留言的第一句（點了開詳情的留言分頁）。
// 網頁：列右邊 ❤ 加日曆鈕（wish-add，開 DayPicker 小彈窗 wish-add-pop）。手機：列可以左滑露出「加到某天」（wish-swipe-add），
// 第一次打開某排的清單時第一列自己滑 40px 再彈回（localStorage th.wishSwipeHint）。照片牆的卡片用 PlaceTile。
// 樣式在 ui.css（.wl-、書架沿用 .xs-）。清單的計算（篩選、排序）由呼叫的畫面做好，這裡只管分段與顯示。
//
// T76（interaction-design §35.8）：新的是 WishSectionList：三排改成和探索一樣的收合區段（Section.tsx，色條愛心紅），列是同一種 PlaceRow，
// 候選、已排的第二行寫「2/7 候選」「2/5 排了」，最新留言照舊；「全部 N ›」、wishPrefs.section、照片牆、日期小標拿掉；最下面一行說明。
// 日曆鈕（網頁）、左滑（手機）照舊。舊的 WishList（三排小卡）留到 T77、T78 接上新的再刪（T79）。

import { createPortal } from 'react-dom';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useData, useShared } from '../../hooks.ts';
import { shortDayLabel, weekdayZh } from '../../lib/trip.ts';
import { DayPicker } from '../../components/DayPicker.tsx';
import { Avatar, MemberName } from '../../components/common.tsx';
import { Icon } from '../../components/Icon.tsx';
import { dragPlaceProps } from '../../components/askAi.ts';
import { useWishPrefs, wishPrefs } from '../wishPrefs.ts';
import { useLikeCount, useLiked } from '../placeLists.ts';
import { SHELF_SIZE } from '../../lib/shelves.ts';
import { rowHighlights, statusHighlights } from '../rowHighlights.ts';
import { fitBadges } from '../../lib/placeSummary.ts';
import { PAGE_FIRST, PAGE_MORE, WISH_SECTIONS_NOTE, wishSections, wishWhen, type SectionId, type WishGroup, type WishSection } from '../wishSections.ts';
import { Section, SectionRows } from './Section.tsx';
import type { Place } from '../../data/types.ts';
import { Highlights, PlaceRow, useDayStatus, type DayStatus } from './PlaceRow.tsx';
import { PlaceTile } from './PlaceTile.tsx';
import { PlaceWall } from './PlaceWall.tsx';
import { PlaceOpenBody } from './PlaceOpen.tsx';
import { VoteHeart } from './VoteHeart.tsx';
import { ShelfCard } from './ExploreHome.tsx';

export type WishSurface = 'desktop' | 'mobile';

const SECTION_LABELS: Record<SectionId, string> = { unscheduled: '還沒排', candidate: '已是候選', scheduled: '已排進行程' };
/** 書架標題旁的小字、空的那排的灰字 */
const SECTION_NOTES: Record<SectionId, string> = { unscheduled: '想去多的排前面', candidate: '照日期', scheduled: '照日期' };
const SECTION_EMPTY: Record<SectionId, string> = { unscheduled: '全部都排了', candidate: '還沒有候選', scheduled: '還沒排進行程' };
const SWIPE_W = 96;
const HINT_KEY = 'th.wishSwipeHint';

/** 留言的第一句（到第一個句號、問號、驚嘆號或換行） */
function firstSentence(text: string): string {
  const m = /^[^。！？!?\n]*[。！？!?]?/.exec(text.trim());
  return (m?.[0] || text).trim();
}

/** 每個點最新一則留言的第一句 */
function useLastComments(): Map<string, string> {
  const comments = useShared((s) => s.comments);
  return useMemo(() => {
    const latest = new Map<string, { at: string; text: string }>();
    for (const c of comments) {
      if (c.deletedAt) continue;
      const cur = latest.get(c.target);
      if (!cur || c.createdAt > cur.at) latest.set(c.target, { at: c.createdAt, text: c.text });
    }
    return new Map([...latest].map(([k, v]) => [k, firstSentence(v.text)]));
  }, [comments]);
}

/** 誰想去：頭像＋最多兩個名字，其他寫 +N */
function Who({ ids }: { ids: string[] }) {
  const shown = ids.slice(0, 2);
  return (
    <span className="wl-who" data-testid="wish-who">
      <span className="wl-avatars">
        {shown.map((id) => (
          <Avatar key={id} id={id} />
        ))}
      </span>
      <span className="wl-who-names wl-ell">
        {shown.map((id, i) => (
          <span key={id}>
            {i > 0 && '、'}
            <MemberName id={id} />
          </span>
        ))}
        {ids.length > 2 && ` +${ids.length - 2}`}
      </span>
    </span>
  );
}

/**
 * 第二行：還沒排＝這團的標章＋誰想去；候選、已排＝膠囊＋標章＋頭像。
 * 這團的標章（長輩 ✕ 之類，T44b）T69 從名稱那行搬下來：名稱那行只留名字、等級和小方標，名字不再常被省略
 */
function SecondLine({ place, status, section, likes }: { place: Place; status: DayStatus; section: SectionId; likes: string[] }) {
  const fit = <Highlights list={fitBadges(place, 1)} testId="place-fit" />;
  if (section === 'unscheduled') {
    return (
      <span className="wl-status">
        {fit}
        <Who ids={likes} />
      </span>
    );
  }
  // 已排、候選都留（同一個點可能已排 2/5 又是 2/8 的候選）；標章接在後面，太長時被藏掉的是標章
  const caps = statusHighlights(status).slice(0, 2);
  return (
    <span className="wl-status">
      <Highlights list={caps} />
      {fit}
      <span className="wl-avatars">
        {likes.slice(0, 3).map((id) => (
          <Avatar key={id} id={id} />
        ))}
      </span>
    </span>
  );
}

/** 手機：整列往左滑露出「加到某天」。第一列（hint）第一次出現時自己滑 40px 再彈回 */
function SwipeRow({ children, hint, onAdd }: { children: ReactNode; hint: boolean; onAdd: () => void }) {
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const st = useRef<{ x: number; y: number; base: number; active: boolean } | null>(null);
  const moved = useRef(false);

  const rowRef = useRef<HTMLDivElement>(null);
  const played = useRef(false);

  // 提示只播一次：真的在畫面上、播完（彈回去）才記下來；中途被收掉就把位置歸零，下次再播
  useEffect(() => {
    if (!hint || played.current) return;
    try {
      if (localStorage.getItem(HINT_KEY)) return;
    } catch {
      return;
    }
    const a = setTimeout(() => {
      const r = rowRef.current?.getBoundingClientRect();
      if (!r || r.height === 0 || r.bottom < 0 || r.top > window.innerHeight || st.current) return;
      setOffset(-40);
    }, 500);
    const b = setTimeout(() => {
      const r = rowRef.current?.getBoundingClientRect();
      if (!r || r.height === 0 || r.bottom < 0 || r.top > window.innerHeight) return;
      played.current = true;
      setOffset((o) => (o === -40 ? 0 : o));
      try {
        localStorage.setItem(HINT_KEY, '1');
      } catch {
        // 存不了：下次還會提示一次
      }
    }, 1100);
    return () => {
      clearTimeout(a);
      clearTimeout(b);
      setOffset((o) => (o === -40 ? 0 : o));
    };
  }, [hint]);

  const end = () => {
    const s = st.current;
    st.current = null;
    if (!s) return;
    setDragging(false);
    if (s.active) {
      moved.current = true;
      setTimeout(() => (moved.current = false), 0);
      setOffset((o) => (o < -SWIPE_W / 2 ? -SWIPE_W : 0));
    }
  };

  return (
    <div className="wl-swipe" ref={rowRef}>
      <button type="button" className="wl-swipe-add" style={{ width: SWIPE_W }} tabIndex={offset === -SWIPE_W ? 0 : -1} aria-hidden={offset !== -SWIPE_W} data-testid="wish-swipe-add" onClick={onAdd}>
        <Icon name="calendar" size={20} />
        加到某天
      </button>
      <div
        className={`wl-swipe-fg ${dragging ? 'dragging' : ''}`}
        style={{ transform: `translateX(${offset}px)` }}
        onPointerDown={(e) => {
          st.current = { x: e.clientX, y: e.clientY, base: offset, active: false };
        }}
        onPointerMove={(e) => {
          const s = st.current;
          if (!s) return;
          const dx = e.clientX - s.x;
          const dy = e.clientY - s.y;
          if (!s.active) {
            if (Math.abs(dx) < 8 || Math.abs(dx) < Math.abs(dy) * 1.2) return;
            s.active = true;
            setDragging(true);
            e.currentTarget.setPointerCapture?.(e.pointerId);
          }
          setOffset(Math.max(-SWIPE_W, Math.min(0, s.base + dx)));
        }}
        onPointerUp={end}
        onPointerCancel={end}
        onClickCapture={(e) => {
          // 剛拖完放手的那一下不算點；按鈕整個露出來時點列只是收回去（提示動畫滑到一半時點＝照常打開）
          if (moved.current) {
            e.stopPropagation();
            e.preventDefault();
          } else if (offset === -SWIPE_W) {
            e.stopPropagation();
            e.preventDefault();
            setOffset(0);
          }
        }}
      >
        {children}
      </div>
    </div>
  );
}

interface ItemProps {
  place: Place;
  status: DayStatus;
  section: SectionId;
  surface: WishSurface;
  view: 'photo' | 'list';
  hot: boolean;
  hint: boolean;
  likes: string[];
  lastComment: string | undefined;
  onOpen: () => void;
  onOpenComments: () => void;
  /** 網頁：原地展開了（below 是展開的內容） */
  open?: boolean;
  below?: ReactNode;
}

/** 一個點：列（清單）或卡（照片牆） */
function WishItem({ place, status, section, surface, view, hot, hint, likes, lastComment, onOpen, onOpenComments, open, below }: ItemProps) {
  const [adding, setAdding] = useState(false);
  const mobile = surface === 'mobile';
  const picker = adding && createPortal(<DayPicker placeId={place.id} onClose={() => setAdding(false)} testId={mobile ? 'day-picker' : 'wish-add-pop'} />, document.body);
  const li = (body: ReactNode) => (
    <li className={`wl-item type-${place.type}`} data-testid={mobile ? 'm-wish-item' : 'wish-item'} data-id={place.id} data-type={place.type}>
      {body}
      {picker}
    </li>
  );
  const common = {
    place,
    status,
    hot,
    testId: mobile ? 'm-wish-open' : 'wish-open',
    onOpen,
    rootProps: mobile ? undefined : { ...dragPlaceProps(place.id), title: '點了展開；拖到左邊的聊天室可以問 AI' },
    open,
    below,
  };
  if (view === 'photo') return li(<PlaceTile {...common} extra={<Who ids={likes} />} />);
  const extra = (
    <>
      <SecondLine place={place} status={status} section={section} likes={likes} />
      <button
        type="button"
        className={`wl-comment ${lastComment ? '' : 'none'}`}
        data-testid="wish-last-comment"
        onClick={(e) => {
          e.stopPropagation();
          onOpenComments();
        }}
      >
        <Icon name="chat" size={16} />
        <span className="wl-ell">{lastComment ?? '還沒有留言'}</span>
      </button>
    </>
  );
  // 車站不能排進行程（T29c §8.10）：不放日曆鈕、不能左滑
  const canAdd = place.type !== 'station';
  const right = mobile ? undefined : (
    <span className="wl-right">
      <VoteHeart placeId={place.id} />
      {canAdd && <button
        type="button"
        className="wl-add"
        aria-label="加到某天"
        title="加到某天"
        data-testid="wish-add"
        onClick={(e) => {
          e.stopPropagation();
          setAdding(true);
        }}
      >
        <Icon name="calendar" size={20} />
      </button>}
    </span>
  );
  const row = <PlaceRow {...common} extra={extra} right={right} />;
  return li(mobile && canAdd ? <SwipeRow hint={hint} onAdd={() => setAdding(true)}>{row}</SwipeRow> : row);
}

/** 想去分三段（還沒排、已是候選、已排）：WishList 和呼叫的畫面（返回鈕的數字）共用 */
export function useWishSections(places: Place[]): WishSection[] {
  const candidates = useShared((s) => s.candidates);
  const itinerary = useData((s) => s.itinerary);
  const likeCount = useLikeCount();
  return useMemo(() => wishSections(places.map((p) => p.id), candidates, itinerary, likeCount), [places, candidates, itinerary, likeCount]);
}

/** 清單層的返回鈕（T53）：「‹ 還沒排 · 6 個地點」，點了回到三排書架；在書架那層是 null */
export function useWishBack(): { section: SectionId | null; back: { label: string; onClick(): void } | null } {
  const section = useWishPrefs((s) => s.section);
  return { section, back: section ? { label: SECTION_LABELS[section], onClick: () => wishPrefs.getState().setSection(null) } : null };
}

/** 這一段先顯示 limit 個：照分組順序切 */
function visibleGroups(groups: WishGroup[], limit: number): WishGroup[] {
  const out: WishGroup[] = [];
  let left = limit;
  for (const g of groups) {
    if (left <= 0) break;
    out.push({ date: g.date, ids: g.ids.slice(0, left) });
    left -= g.ids.length;
  }
  return out;
}

export interface WishListProps {
  surface: WishSurface;
  /** 已經篩選、排好的想去的點 */
  places: Place[];
  view: 'photo' | 'list';
  onOpen: (id: string) => void;
  /** 點最新留言：開詳情的留言分頁 */
  onOpenComments: (id: string) => void;
  /** 網頁（第八輪 §13.3）：原地展開的那個點；onDetail 是展開後的「詳細資料」，書架的小卡也直接開詳情。手機不給，點了照舊開整頁詳情 */
  openId?: string | null;
  onDetail?: (id: string) => void;
  /** 展開卡的「問 AI」（網頁） */
  onAsk?: (id: string) => void;
  /** 地圖「指到」或被地圖點到的點（加底色） */
  hotId?: string | null;
  /** 要把這個點露出來（不在書架的前 3 張就進它那排的全部、顯示到它） */
  revealId?: string | null;
  /** 同一個點再被點到時也要再露出來（地圖點擊的流水號） */
  revealSeq?: number;
}

/**
 * 想去（T53）：三排書架（還沒排、已是候選、已排進行程），每排先放 3 張小卡、右邊「全部 N ›」；空的那排寫一行灰字。
 * 「全部 ›」進那排的照片牆或清單（wishPrefs.section），返回鈕「‹ 還沒排 · 6 個地點」在篩選列（呼叫的畫面用 useWishBack 放）。
 * 一個點都沒有時什麼都不畫（空白狀態 §17.4 由呼叫的畫面放）。
 */
export function WishList({ surface, places, view, onOpen, onOpenComments, hotId, revealId, revealSeq, openId = null, onDetail, onAsk }: WishListProps) {
  const liked = useLiked();
  const lastComments = useLastComments();
  const statusOf = useDayStatus();
  const focus = useWishPrefs((s) => s.section);
  const [shown, setShown] = useState<Record<SectionId, number>>({ unscheduled: PAGE_FIRST, candidate: PAGE_FIRST, scheduled: PAGE_FIRST });

  const byId = useMemo(() => new Map(places.map((p) => [p.id, p])), [places]);
  const sections = useWishSections(places);

  // 地圖點到的點：在書架的前 3 張就留在書架（呼叫的畫面捲到它），否則進它那排的全部、多顯示到它
  // 只在 revealId（或 revealSeq）變了才做一次
  const sectionsRef = useRef(sections);
  sectionsRef.current = sections;
  const handled = useRef<string | null>(null);
  useEffect(() => {
    if (!revealId) return;
    const key = `${revealId}:${revealSeq ?? 0}`;
    if (handled.current === key) return;
    for (const sec of sectionsRef.current) {
      const i = sec.groups.flatMap((g) => g.ids).indexOf(revealId);
      if (i < 0) continue;
      handled.current = key;
      const cur = wishPrefs.getState().section;
      if (cur === null && i < SHELF_SIZE) return;
      if (cur !== sec.id) wishPrefs.getState().setSection(sec.id);
      setShown((s) => (s[sec.id] > i ? s : { ...s, [sec.id]: i + 1 }));
      return;
    }
  }, [revealId, revealSeq, sections]);

  if (!places.length) return null;

  const sec = focus ? sections.find((s) => s.id === focus) : undefined;
  if (!sec) {
    // 三排書架
    const openCard = onDetail ?? onOpen;
    return (
      <div className="wl wl-shelves" data-testid="wish-list" data-surface={surface} data-stage="shelves">
        {sections.map((s) => {
          const top = s.groups.flatMap((g) => g.ids.map((id) => ({ id, date: g.date }))).slice(0, SHELF_SIZE);
          return (
            <section key={s.id} className="xs" data-testid="wish-shelf" data-section={s.id}>
              <header className="xs-head">
                <h3 className="xs-title">
                  {SECTION_LABELS[s.id]}
                  <span className="xs-note">{SECTION_NOTES[s.id]}</span>
                </h3>
                {s.count > 0 && (
                  <button type="button" className="xs-all" onClick={() => wishPrefs.getState().setSection(s.id)} data-testid={`wish-shelf-all-${s.id}`}>
                    全部 {s.count} ›
                  </button>
                )}
              </header>
              {s.count === 0 ? (
                <p className="xs-empty" data-testid="wish-shelf-empty">
                  {SECTION_EMPTY[s.id]}
                </p>
              ) : (
                <div className="xs-row">
                  {top.map(({ id, date }) => {
                    const p = byId.get(id);
                    if (!p) return null;
                    return <ShelfCard key={id} place={p} surface={surface} onOpen={openCard} caption={date ? `${shortDayLabel(date)} ${s.id === 'candidate' ? '候選' : '排了'}` : undefined} />;
                  })}
                </div>
              )}
            </section>
          );
        })}
      </div>
    );
  }

  // 某一排的全部：照片牆或清單；候選、已排按日期分小段（2/5（五）· 3），先顯示 8 個、「再顯示 15 個」
  const groups = visibleGroups(sec.groups, shown[sec.id]);
  const rest = sec.count - groups.reduce((n, g) => n + g.ids.length, 0);
  let first = true;
  const mk = (p: Place) => {
    const hint = first && surface === 'mobile' && view === 'list';
    first = false;
    return (
      <WishItem
        key={p.id}
        place={p}
        status={statusOf(p.id)}
        section={sec.id}
        surface={surface}
        view={view}
        hot={hotId === p.id}
        hint={hint}
        likes={liked.get(p.id)?.likes ?? []}
        lastComment={lastComments.get(p.id)}
        onOpen={() => onOpen(p.id)}
        onOpenComments={() => onOpenComments(p.id)}
        open={!!onDetail && openId === p.id}
        below={onDetail ? <PlaceOpenBody place={p} onDetail={() => onDetail(p.id)} onAsk={onAsk ? () => onAsk(p.id) : undefined} /> : undefined}
      />
    );
  };
  return (
    <div className="wl" data-testid="wish-list" data-surface={surface} data-stage="list">
      <section className="wl-section" data-section={sec.id}>
        {sec.count === 0 && <p className="muted ex-empty" data-testid="wish-shelf-empty">{SECTION_EMPTY[sec.id]}</p>}
        {groups.map((g) => {
          const total = sec.groups.find((x) => x.date === g.date)?.ids.length ?? g.ids.length;
          const items = g.ids.map((id) => byId.get(id)).filter((p): p is Place => !!p);
          return (
            <div key={g.date ?? 'none'} className="wl-group">
              {g.date && (
                <h4 className="wl-sub" data-testid="wish-day-head">
                  {shortDayLabel(g.date)}（{weekdayZh(g.date)}）· {total}
                </h4>
              )}
              {view === 'photo' ? <PlaceWall items={items} openId={onDetail ? openId : null} render={(p) => <ul className="wl-tile">{mk(p)}</ul>} /> : <ol className="wl-items">{items.map(mk)}</ol>}
            </div>
          );
        })}
        {rest > 0 && (
          <button type="button" className="wl-more" data-testid={`wish-more-${sec.id}`} onClick={() => setShown((s) => ({ ...s, [sec.id]: s[sec.id] + PAGE_MORE }))}>
            再顯示 {Math.min(PAGE_MORE, rest)} 個
          </button>
        )}
      </section>
    </div>
  );
}

// ---------------- T76：收合的三段 ----------------

interface WishRowProps {
  place: Place;
  status: DayStatus;
  section: SectionId;
  surface: WishSurface;
  hot: boolean;
  hint: boolean;
  lastComment: string | undefined;
  onOpen: () => void;
  onOpenComments: () => void;
  open?: boolean;
  below?: ReactNode;
}

/** 想去的一列（T76）：同探索的 PlaceRow；候選、已排的膠囊那行先放日期（「2/7 候選」「2/5 排了」），再放這團的標章，最多兩顆；最下面最新留言 */
function WishRow({ place, status, section, surface, hot, hint, lastComment, onOpen, onOpenComments, open, below }: WishRowProps) {
  const [adding, setAdding] = useState(false);
  const mobile = surface === 'mobile';
  const picker = adding && createPortal(<DayPicker placeId={place.id} onClose={() => setAdding(false)} testId={mobile ? 'day-picker' : 'wish-add-pop'} />, document.body);
  const when = section === 'unscheduled' ? null : wishWhen(section, status);
  const foot = (
    <button
      type="button"
      className={`wl-comment ${lastComment ? '' : 'none'}`}
      data-testid="wish-last-comment"
      onClick={(e) => {
        e.stopPropagation();
        onOpenComments();
      }}
    >
      <Icon name="chat" size={16} />
      <span className="wl-ell">{lastComment ?? '還沒有留言'}</span>
    </button>
  );
  // 車站不能排進行程（T29c §8.10）：不放日曆鈕、不能左滑
  const canAdd = place.type !== 'station';
  const right = mobile ? undefined : (
    <span className="wl-right">
      <VoteHeart placeId={place.id} />
      {canAdd && (
        <button
          type="button"
          className="wl-add"
          aria-label="加到某天"
          title="加到某天（給主辦的建議）"
          data-testid="wish-add"
          onClick={(e) => {
            e.stopPropagation();
            setAdding(true);
          }}
        >
          <Icon name="calendar" size={20} />
        </button>
      )}
    </span>
  );
  const row = (
    <PlaceRow
      place={place}
      status={status}
      hot={hot}
      testId={mobile ? 'm-wish-open' : 'wish-open'}
      onOpen={onOpen}
      rootProps={mobile ? undefined : { ...dragPlaceProps(place.id), title: '點了展開；拖到左邊的聊天室可以問 AI' }}
      open={open}
      below={below}
      caps={when ? [...when, ...rowHighlights(place, { candidate: [], scheduled: [] })].slice(0, 2) : undefined}
      foot={foot}
      right={right}
    />
  );
  return (
    <div className={`wl-item type-${place.type}`} data-testid={mobile ? 'm-wish-item' : 'wish-item'} data-id={place.id} data-type={place.type} data-section={section}>
      {mobile && canAdd ? (
        <SwipeRow hint={hint} onAdd={() => setAdding(true)}>
          {row}
        </SwipeRow>
      ) : (
        row
      )}
      {picker}
    </div>
  );
}

export interface WishSectionListProps {
  surface: WishSurface;
  /** 已經篩選（含主題）、排好的想去的點 */
  places: Place[];
  /** 展開的段（呼叫的畫面記） */
  openIds: readonly SectionId[];
  onToggle: (id: SectionId) => void;
  onOpen: (id: string) => void;
  /** 點最新留言：開詳情的留言分頁 */
  onOpenComments: (id: string) => void;
  /** 網頁：原地展開的那個點、展開後的「詳細資料」「問 AI」；手機不給 */
  openId?: string | null;
  onDetail?: (id: string) => void;
  onAsk?: (id: string) => void;
  /** 地圖「指到」或被地圖點到的點（加底色） */
  hotId?: string | null;
  /** 捲動容器（分批畫）：手機 '.m-page'、網頁 '.side-body' */
  scroller: string;
  /** 段裡至少畫到第幾個（地圖點到的點要捲到它）：段 ID → 個數 */
  minShown?: Partial<Record<SectionId, number>>;
}

/**
 * 想去（T76，§35.8）：還沒排／已是候選／已排進行程三個收合區段，數字永遠寫，0 個的段展開是一行灰字；最下面一行說明。
 * 一個點都沒有時什麼都不畫（空白狀態 §17.4 由呼叫的畫面放）。哪個點在哪一段用 useWishSections（呼叫的畫面要展開它那段時也用）
 */
export function WishSectionList({ surface, places, openIds, onToggle, onOpen, onOpenComments, openId = null, onDetail, onAsk, hotId, scroller, minShown }: WishSectionListProps) {
  const lastComments = useLastComments();
  const statusOf = useDayStatus();
  const byId = useMemo(() => new Map(places.map((p) => [p.id, p])), [places]);
  const sections = useWishSections(places);
  if (!places.length) return null;
  // 手機左滑的提示只放在第一個展開的段的第一列
  const hintSection = sections.find((sec) => sec.count > 0 && openIds.includes(sec.id))?.id;
  return (
    <div className="wl wl-v2" data-testid="wish-list" data-surface={surface} data-stage="sections">
      {sections.map((sec) => {
        const open = openIds.includes(sec.id);
        const items = open ? sec.groups.flatMap((g) => g.ids).map((id) => byId.get(id)).filter((p): p is Place => !!p) : [];
        return (
          <Section key={sec.id} head={sec} kind="wish" count={sec.count} open={open} onToggle={() => onToggle(sec.id)} testId="wish-section">
            {open &&
              (items.length ? (
                <SectionRows
                  items={items}
                  scroller={scroller}
                  resetOn={[places]}
                  minShown={minShown?.[sec.id]}
                  render={(p, i) => (
                    <WishRow
                      place={p}
                      status={statusOf(p.id)}
                      section={sec.id}
                      surface={surface}
                      hot={hotId === p.id}
                      hint={surface === 'mobile' && sec.id === hintSection && i === 0}
                      lastComment={lastComments.get(p.id)}
                      onOpen={() => onOpen(p.id)}
                      onOpenComments={() => onOpenComments(p.id)}
                      open={!!onDetail && openId === p.id}
                      below={onDetail ? <PlaceOpenBody place={p} onDetail={() => onDetail(p.id)} onAsk={onAsk ? () => onAsk(p.id) : undefined} /> : undefined}
                    />
                  )}
                />
              ) : (
                <p className="sec-none" data-testid="wish-section-empty">
                  {SECTION_EMPTY[sec.id]}
                </p>
              ))}
          </Section>
        );
      })}
      <p className="wl-note" data-testid="wish-note">
        {WISH_SECTIONS_NOTE}
      </p>
    </div>
  );
}
