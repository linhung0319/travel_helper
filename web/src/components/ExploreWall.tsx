import { useEffect, useMemo, useRef } from 'react';
import { appStore } from '../store.ts';
import { useApp, useCanHover, useData } from '../hooks.ts';
import { placeVisual, wallPlaces } from '../lib/visual.ts';
import { Photo } from './Photo.tsx';
import { WallVote } from './Votes.tsx';
import { SearchBox } from './SearchBox.tsx';
import { TierBadge } from './TierBadge.tsx';
import { toggleAskAi } from './askAi.ts';

/** 照片上的「＋ 問 AI」（手機沒有拖曳）：點了帶進聊天、再點拿掉，不開詳情 */
function WallAsk({ placeId, on }: { placeId: string; on: boolean }) {
  const act = (e: { stopPropagation(): void; preventDefault(): void }) => {
    e.stopPropagation();
    e.preventDefault();
    toggleAskAi(placeId);
  };
  return (
    <span
      role="button"
      tabIndex={0}
      className={`wall-ask ${on ? 'on' : ''}`}
      aria-pressed={on}
      aria-label={on ? '從聊天拿掉' : '帶進聊天問 AI'}
      data-testid="wall-ask"
      onClick={act}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && act(e)}
    >
      {on ? '✓ AI' : '＋ AI'}
    </span>
  );
}

/**
 * 探索模式的圖片牆（interaction-design §7）：只顯示目前地圖畫面裡、符合篩選的點；
 * S 級照片大一倍、A 正常、B 小張。移動地圖，圖片牆跟著換。
 */
export function ExploreWall() {
  const bounds = useApp((s) => s.view?.bounds ?? null);
  const filter = useApp((s) => s.filter);
  const query = useApp((s) => s.query);
  const day = useApp((s) => s.day);
  const previewId = useApp((s) => s.previewId);
  const detailId = useApp((s) => s.detailId);
  const hoveredId = useApp((s) => s.hoveredId);
  const selection = useApp((s) => s.selection);
  const places = useData((s) => s.places);
  const days = useData((s) => s.days);
  const canHover = useCanHover();
  const ref = useRef<HTMLDivElement>(null);

  const items = useMemo(() => wallPlaces(places, bounds, filter, query), [places, bounds, filter, query]);

  // 點了地圖上的點：圖片牆捲到那張照片
  useEffect(() => {
    const id = previewId ?? detailId;
    if (!id) return;
    ref.current?.querySelector<HTMLElement>(`[data-id="${CSS.escape(id)}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [previewId, detailId]);

  const onClick = (id: string) => {
    const s = appStore.getState();
    // 觸控：第一下讓地圖上的點閃，再點一下開詳情；滑鼠：移上去就閃了，點了直接開詳情
    if (canHover || s.hoveredId === id) s.openDetail(id);
    else s.hover(id);
  };

  return (
    <div className="explore-wall" ref={ref} data-testid="explore-wall">
      <SearchBox />
      <p className="wall-count muted small">畫面裡有 {items.length} 個地點{items.length > 0 ? '，移動地圖會跟著換' : '，移動或縮小地圖看看'}</p>
      <div className="wall-grid">
        {items.map((p) => {
          const v = placeVisual(p, filter, day, days, query);
          return (
            <button
              key={p.id}
              type="button"
              data-id={p.id}
              data-testid="wall-item"
              className={`wall-item size-${p.tier ?? 'B'} ${v.dim ? 'dim' : ''} ${hoveredId === p.id ? 'flash' : ''}`}
              onMouseEnter={() => canHover && appStore.getState().hover(p.id)}
              onMouseLeave={() => canHover && appStore.getState().hover(null)}
              onClick={() => onClick(p.id)}
            >
              <Photo place={p} width={p.tier === 'S' ? 800 : 400} showName />
              <span className="wall-caption">
                <TierBadge tier={p.tier} />
                <span className="wall-name">{p.name.zh || p.name.ja}</span>
                {v.order && <span className="wall-order">#{v.order}</span>}
              </span>
              <WallVote placeId={p.id} />
              <WallAsk placeId={p.id} on={selection.includes(p.id)} />
            </button>
          );
        })}
      </div>
    </div>
  );
}
