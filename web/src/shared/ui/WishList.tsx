// 想去的清單（網頁右欄、手機想去分頁共用，設計 §5.3）：按「排了沒有」分三段（還沒排、已是候選、已排進行程）。
// 第八輪 §13.7 拿掉了最上面那排跳轉晶片：每段的數字在段落標題上（「還沒排 · 6」）；
// 段落標題黏在篩選列下面、點了收合（「已排進行程」預設收合，狀態記在 shared/wishPrefs.ts → localStorage）；
// 每段先顯示 8 個，下面「再顯示 15 個」；候選、已排按日期分小段（2/5（五）· 3）。分段的計算在 shared/wishSections.ts。
// 列是 PlaceRow 的變體：第二行是誰想去（頭像＋名字）或候選／已排膠囊＋頭像，第三行是最新一則留言的第一句（點了開詳情的留言分頁）。
// 網頁：列右邊 ❤ 加日曆鈕（wish-add，開 DayPicker 小彈窗 wish-add-pop）。手機：列可以左滑露出「加到某天」（wish-swipe-add），
// 第一次打開想去時第一列自己滑 40px 再彈回（localStorage th.wishSwipeHint）。照片牆檢視也分三段，卡片用 PlaceTile。
// 樣式在 ui.css（.wl-）。清單的計算（篩選、排序）由呼叫的畫面做好，這裡只管分段與顯示。

import { createPortal } from 'react-dom';
import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { useData, useShared } from '../../hooks.ts';
import { shortDayLabel, weekdayZh } from '../../lib/trip.ts';
import { DayPicker } from '../../components/DayPicker.tsx';
import { Avatar, MemberName } from '../../components/common.tsx';
import { Icon } from '../../components/Icon.tsx';
import { dragPlaceProps } from '../../components/askAi.ts';
import { useWishPrefs, wishPrefs } from '../wishPrefs.ts';
import { useLikeCount, useLiked } from '../placeLists.ts';
import { rowHighlights } from '../rowHighlights.ts';
import { PAGE_FIRST, PAGE_MORE, wishSections, type SectionId, type WishGroup } from '../wishSections.ts';
import type { Place } from '../../data/types.ts';
import { Highlights, PlaceRow, useDayStatus, type DayStatus } from './PlaceRow.tsx';
import { PlaceTile } from './PlaceTile.tsx';
import { PlaceWall } from './PlaceWall.tsx';
import { PlaceOpenBody } from './PlaceOpen.tsx';
import { VoteHeart } from './VoteHeart.tsx';

export type WishSurface = 'desktop' | 'mobile';

const SECTION_LABELS: Record<SectionId, string> = { unscheduled: '還沒排', candidate: '已是候選', scheduled: '已排進行程' };
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

/** 第二行：還沒排＝誰想去；候選、已排＝膠囊＋頭像 */
function SecondLine({ place, status, section, likes }: { place: Place; status: DayStatus; section: SectionId; likes: string[] }) {
  if (section === 'unscheduled') return <Who ids={likes} />;
  const caps = rowHighlights(place, status, 2).filter((h) => h.tone !== 'plain');
  return (
    <span className="wl-status">
      <Highlights list={caps} />
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
  const right = mobile ? undefined : (
    <span className="wl-right">
      <VoteHeart placeId={place.id} />
      <button
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
      </button>
    </span>
  );
  const row = <PlaceRow {...common} extra={extra} right={right} />;
  return li(mobile ? <SwipeRow hint={hint} onAdd={() => setAdding(true)}>{row}</SwipeRow> : row);
}

/** 量出黏住的篩選列高度，寫成 CSS 變數 --wl-top（段落標題黏在篩選列下面） */
function useStickyOffsets(root: RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const bar = el.closest('.explore-panel, .m-wish')?.querySelector<HTMLElement>('.fb-desktop, .fb-mobile');
    const apply = () => el.style.setProperty('--wl-top', `${bar ? bar.getBoundingClientRect().height : 0}px`);
    apply();
    const ro = new ResizeObserver(apply);
    if (bar) ro.observe(bar);
    return () => ro.disconnect();
  }, [root]);
}

export interface WishListProps {
  surface: WishSurface;
  /** 已經篩選、排好的想去的點 */
  places: Place[];
  view: 'photo' | 'list';
  onOpen: (id: string) => void;
  /** 點最新留言：開詳情的留言分頁 */
  onOpenComments: (id: string) => void;
  /** 網頁（第八輪 §13.3）：原地展開的那個點；onDetail 是展開後的「詳細資料」。手機不給，點了照舊開整頁詳情 */
  openId?: string | null;
  onDetail?: (id: string) => void;
  /** 地圖「指到」或被地圖點到的點（加底色） */
  hotId?: string | null;
  /** 要把這個點露出來（它那段展開、顯示到它） */
  revealId?: string | null;
  /** 同一個點再被點到時也要再露出來（地圖點擊的流水號） */
  revealSeq?: number;
}

export function WishList({ surface, places, view, onOpen, onOpenComments, hotId, revealId, revealSeq, openId = null, onDetail }: WishListProps) {
  const candidates = useShared((s) => s.candidates);
  const itinerary = useData((s) => s.itinerary);
  const likeCount = useLikeCount();
  const liked = useLiked();
  const lastComments = useLastComments();
  const statusOf = useDayStatus();
  const collapsed = useWishPrefs((s) => s.collapsed);
  const [shown, setShown] = useState<Record<SectionId, number>>({ unscheduled: PAGE_FIRST, candidate: PAGE_FIRST, scheduled: PAGE_FIRST });
  // 地圖點到而暫時展開的段落（不改記住的收合狀態）
  const [forced, setForced] = useState<SectionId[]>([]);
  const root = useRef<HTMLDivElement>(null);
  useStickyOffsets(root);

  const byId = useMemo(() => new Map(places.map((p) => [p.id, p])), [places]);
  const sections = useMemo(() => wishSections(places.map((p) => p.id), candidates, itinerary, likeCount), [places, candidates, itinerary, likeCount]);
  const setCollapsed = (id: SectionId, on: boolean) => wishPrefs.getState().setCollapsed(id, on);

  // 地圖點到的點在收合或還沒顯示的段落裡：展開、多顯示到它
  // 只在 revealId（或 revealSeq）變了才做一次；展開只在這次畫面有效，不寫進記住的收合狀態
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
      setForced((f) => (f.includes(sec.id) ? f : [...f, sec.id]));
      setShown((s) => (s[sec.id] > i ? s : { ...s, [sec.id]: i + 1 }));
    }
  }, [revealId, revealSeq, sections]);

  const toggle = (id: SectionId, open: boolean) => {
    setForced((f) => f.filter((x) => x !== id));
    setCollapsed(id, open);
  };

  /** 這一段先顯示 limit 個：照分組順序切 */
  const visibleGroups = (groups: WishGroup[], limit: number): WishGroup[] => {
    const out: WishGroup[] = [];
    let left = limit;
    for (const g of groups) {
      if (left <= 0) break;
      out.push({ date: g.date, ids: g.ids.slice(0, left) });
      left -= g.ids.length;
    }
    return out;
  };

  let first = true;
  return (
    <div className="wl" ref={root} data-testid="wish-list" data-surface={surface}>
      {/* 第八輪 §13.7：拿掉跳轉晶片，數字放在段落標題上（「還沒排 · 6」），篩選了跟著變 */}
      {sections.map((sec) => {
        const open = !collapsed[sec.id] || forced.includes(sec.id);
        const groups = visibleGroups(sec.groups, shown[sec.id]);
        const rest = sec.count - groups.reduce((n, g) => n + g.ids.length, 0);
        return (
          <section key={sec.id} className="wl-section" data-section={sec.id}>
            <h3 className="wl-head">
              <button type="button" aria-expanded={open} onClick={() => toggle(sec.id, open)} data-testid={`wish-section-${sec.id}`}>
                <span className={`chev ${open ? 'up' : ''}`}>
                  <Icon name="chevron" size={16} />
                </span>
                {SECTION_LABELS[sec.id]}
                <span className="wl-head-n" data-testid={`wish-section-count-${sec.id}`}>
                  · {sec.count}
                </span>
              </button>
            </h3>
            {open &&
              groups.map((g) => {
                const total = sec.groups.find((x) => x.date === g.date)?.ids.length ?? g.ids.length;
                const items = g.ids.map((id) => byId.get(id)).filter((p): p is Place => !!p);
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
                      below={onDetail ? <PlaceOpenBody place={p} onDetail={() => onDetail(p.id)} /> : undefined}
                    />
                  );
                };
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
            {open && rest > 0 && (
              <button type="button" className="wl-more" data-testid={`wish-more-${sec.id}`} onClick={() => setShown((s) => ({ ...s, [sec.id]: s[sec.id] + PAGE_MORE }))}>
                再顯示 {Math.min(PAGE_MORE, rest)} 個
              </button>
            )}
          </section>
        );
      })}
    </div>
  );
}
