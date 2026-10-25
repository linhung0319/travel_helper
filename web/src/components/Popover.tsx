// 網頁版的浮動層（設計 §2.1、§2.3）：標籤彈窗、⋯ 選單共用。用 portal 掛到 document.body，
// position: fixed、z-index 是 --z-popover（比地圖、日期列、浮動列、編輯藍條都高），不會被下一張卡或地圖蓋住。
// 位置照 placePopover（下面放不下翻上面、右邊超出靠右）；捲動、resize 時重新算。點外面（不在浮動層或 anchor 裡）或按 Esc 就關（Esc 只關這一層）。

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { placePopover } from '../lib/popover.ts';

/** 浮在 anchor 旁邊的一層；open 是 false 或沒有 anchor 時不畫 */
export function Popover({ anchor, open, onClose, testId, children }: { anchor: HTMLElement | null; open: boolean; onClose: () => void; testId?: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  // onClose 每次重畫都可能是新的函式；放在 ref 裡，事件不用重掛
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  /** 量 anchor 和自己的大小，算位置 */
  const place = useCallback(() => {
    const el = ref.current;
    if (!el || !anchor) return;
    const next = placePopover(anchor.getBoundingClientRect(), { w: el.offsetWidth, h: el.offsetHeight }, { w: window.innerWidth, h: window.innerHeight });
    setPos((p) => (p && p.left === next.left && p.top === next.top ? p : next));
  }, [anchor]);

  // 畫出來之後、瀏覽器顯示之前先放好位置；內容變了（大小可能變）也重算
  useLayoutEffect(() => {
    if (open) place();
  });

  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => {
      const t = e.target as Node;
      if (ref.current?.contains(t) || anchor?.contains(t)) return;
      closeRef.current();
    };
    // Esc 只關浮動層：在 window 的捕獲階段攔下來（同 common.tsx 的 Dialog），App 的 Esc（關詳情、小卡片）收不到
    const esc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      closeRef.current();
    };
    document.addEventListener('pointerdown', outside, true);
    window.addEventListener('keydown', esc, true);
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      document.removeEventListener('pointerdown', outside, true);
      window.removeEventListener('keydown', esc, true);
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [open, anchor, place]);

  useEffect(() => {
    if (!open) setPos(null);
  }, [open]);

  if (!open || !anchor) return null;
  return createPortal(
    <div
      ref={ref}
      className="popover"
      style={pos ? { left: pos.left, top: pos.top } : { left: 0, top: 0, visibility: 'hidden' }}
      data-testid={testId}
      // React 的事件會沿著元件樹（不是 DOM）往上傳：不要傳到卡片（拖曳、換備卡的滑動）
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </div>,
    document.body,
  );
}
