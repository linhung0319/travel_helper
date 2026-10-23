import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { appStore, type SheetSnap } from '../store.ts';
import { useApp, useData } from '../hooks.ts';
import { DetailPanel } from './DetailPanel.tsx';
import { ChatPanel, DayPanel } from './Panels.tsx';

const SNAPS: SheetSnap[] = ['peek', 'half', 'full'];
/** 各段的高度（占可用高度的比例；peek 是固定的像素，只露出分頁） */
const PEEK_PX = 64;
const HALF = 0.5;
const FULL = 1;

function snapHeight(snap: SheetSnap, avail: number): number {
  return snap === 'peek' ? PEEK_PX : snap === 'half' ? avail * HALF : avail * FULL;
}

/**
 * 手機的拉起面板（interaction-design §1）：聊天、這一天、詳情。
 * 拉把手可以在三段之間切換；點把手也會切換。只有面板能拉，地圖上的點不做拖拉。
 */
export function BottomSheet() {
  const sheet = useApp((s) => s.sheet);
  const detailId = useApp((s) => s.detailId);
  const selection = useApp((s) => s.selection);
  const byId = useData((s) => s.byId);
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{ y: number; h: number; avail: number; moved: boolean } | null>(null);
  const [dragH, setDragH] = useState<number | null>(null);

  const avail = () => ref.current?.parentElement?.clientHeight ?? window.innerHeight;

  const onDown = (e: ReactPointerEvent) => {
    const a = avail();
    drag.current = { y: e.clientY, h: snapHeight(sheet.snap, a), avail: a, moved: false };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onMove = (e: ReactPointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dy = d.y - e.clientY;
    if (Math.abs(dy) > 4) d.moved = true;
    setDragH(Math.min(d.avail, Math.max(PEEK_PX, d.h + dy)));
  };
  const onUp = () => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (!d.moved) {
      // 點一下：收起來的打開到一半，其他的收起來
      appStore.getState().setSheet({ snap: sheet.snap === 'peek' ? 'half' : 'peek' });
    } else if (dragH !== null) {
      const nearest = SNAPS.reduce((best, s) => (Math.abs(snapHeight(s, d.avail) - dragH) < Math.abs(snapHeight(best, d.avail) - dragH) ? s : best));
      appStore.getState().setSheet({ snap: nearest });
    }
    setDragH(null);
  };

  const place = detailId ? byId.get(detailId) : null;
  const height = dragH ?? null;
  const tab = (t: 'chat' | 'day') => {
    const s = appStore.getState();
    s.closeDetail();
    s.setSheet({ tab: t, snap: s.sheet.snap === 'peek' ? 'half' : s.sheet.snap });
  };

  return (
    <div
      ref={ref}
      className={`sheet snap-${sheet.snap} ${dragH !== null ? 'dragging' : ''}`}
      style={height !== null ? { height } : undefined}
      data-testid="sheet"
      data-snap={sheet.snap}
    >
      <div className="sheet-handle" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} role="button" aria-label="拉起或收起面板">
        <span className="grip" />
      </div>
      <div className="sheet-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={!place && sheet.tab === 'chat'} onClick={() => tab('chat')} data-testid="sheet-tab-chat">
          💬 聊天{selection.length > 0 && <span className="tab-count">{selection.length}</span>}
        </button>
        <button type="button" role="tab" aria-selected={!place && sheet.tab === 'day'} onClick={() => tab('day')}>
          📅 這一天
        </button>
      </div>
      <div className="sheet-body">{place ? <DetailPanel place={place} /> : sheet.tab === 'chat' ? <ChatPanel /> : <DayPanel />}</div>
    </div>
  );
}
