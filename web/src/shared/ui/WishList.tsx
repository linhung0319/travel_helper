// 想去的清單（網頁右欄、手機想去分頁共用，設計 §5.3；T76 起照 interaction-design §35.8）：
// 還沒排／已是候選／已排進行程三個收合區段（Section.tsx，色條愛心紅），列是和探索同一種 PlaceRow，
// 候選、已排的膠囊那行寫「2/7 候選」「2/5 排了」，最下面是最新一則留言的第一句（點了開詳情的留言分頁）；最下面一行說明。
// 網頁：列右邊 ❤ 加日曆鈕（wish-add，開 DayPicker 小彈窗 wish-add-pop），點列開詳情彈窗（T83），彈窗開著的那列 selected。
// 手機：列可以左滑露出「加到某天」（wish-swipe-add），第一次時第一列自己滑 40px 再彈回（localStorage th.wishSwipeHint）。
// 樣式在 ui.css（.wl-）。分段的計算在 shared/wishSections.ts；清單的計算（篩選、排序）由呼叫的畫面做好，這裡只管分段與顯示。

import { createPortal } from 'react-dom';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useData, useShared } from '../../hooks.ts';
import { DayPicker } from '../../components/DayPicker.tsx';
import { Icon } from '../../components/Icon.tsx';
import { dragPlaceProps } from '../../components/askAi.ts';
import { useLikeCount } from '../placeLists.ts';
import { rowHighlights } from '../rowHighlights.ts';
import { WISH_SECTIONS_NOTE, wishSections, wishWhen, type SectionId, type WishSection } from '../wishSections.ts';
import { Section, SectionRows } from './Section.tsx';
import type { Place } from '../../data/types.ts';
import { PlaceRow, useDayStatus, type DayStatus } from './PlaceRow.tsx';

export type WishSurface = 'desktop' | 'mobile';

/** 0 個的段展開時的灰字 */
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

/** 想去分三段（還沒排、已是候選、已排）：WishSectionList 和呼叫的畫面（要展開某個點那段時）共用 */
export function useWishSections(places: Place[]): WishSection[] {
  const candidates = useShared((s) => s.candidates);
  const itinerary = useData((s) => s.itinerary);
  const likeCount = useLikeCount();
  return useMemo(() => wishSections(places.map((p) => p.id), candidates, itinerary, likeCount), [places, candidates, itinerary, likeCount]);
}

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
  /** 網頁：詳情彈窗開著的就是這列 */
  selected?: boolean;
}

/** 想去的一列（T76）：同探索的 PlaceRow；候選、已排的膠囊那行先放日期（「2/7 候選」「2/5 排了」），再放這團的標章，最多兩顆；最下面最新留言 */
function WishRow({ place, status, section, surface, hot, hint, lastComment, onOpen, onOpenComments, selected }: WishRowProps) {
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
  // 網頁：最底一行的最右邊是日曆鈕（愛心在那行最前面，T82）
  const right = mobile || !canAdd ? undefined : (
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
  );
  const row = (
    <PlaceRow
      place={place}
      status={status}
      hot={hot}
      testId={mobile ? 'm-wish-open' : 'wish-open'}
      onOpen={onOpen}
      rootProps={mobile ? undefined : { ...dragPlaceProps(place.id), title: '點了看詳情；拖到左邊的聊天室可以問 AI' }}
      selected={selected}
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
  /** 網頁：詳情彈窗開著的那個點（那列淡藍底＋左邊靛藍線）；手機不給 */
  selectedId?: string | null;
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
export function WishSectionList({ surface, places, openIds, onToggle, onOpen, onOpenComments, selectedId = null, hotId, scroller, minShown }: WishSectionListProps) {
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
                      selected={selectedId === p.id}
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
