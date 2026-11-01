// 手機大彈窗（討論、班次表）的把手：往下拉超過一段距離就關掉。

import { useRef, type PointerEvent as ReactPointerEvent } from 'react';

/** 往下拉把手多遠算關掉（px） */
const DRAG_CLOSE = 60;

export function useDragClose(close: () => void) {
  const drag = useRef<{ y: number; id: number } | null>(null);
  return {
    onPointerDown: (e: ReactPointerEvent<HTMLElement>) => {
      e.currentTarget.setPointerCapture?.(e.pointerId);
      drag.current = { y: e.clientY, id: e.pointerId };
    },
    onPointerUp: (e: ReactPointerEvent<HTMLElement>) => {
      const d = drag.current;
      drag.current = null;
      if (d && d.id === e.pointerId && e.clientY - d.y > DRAG_CLOSE) close();
    },
    onPointerCancel: () => {
      drag.current = null;
    },
  };
}
