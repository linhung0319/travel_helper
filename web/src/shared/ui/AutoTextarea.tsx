// 留言用的輸入框：一開始一行，字多了自己長高，到 CSS 的 max-height 後在裡面捲。不用 field-sizing：LINE 內建瀏覽器的舊版 WebKit 不支援。

import { useLayoutEffect, useRef, type KeyboardEvent, type TextareaHTMLAttributes } from 'react';

/** Enter 送出（和問 AI 一樣）：Shift＋Enter 換行，輸入法選字中的 Enter 不算 */
export const isSendEnter = (e: KeyboardEvent) => e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && e.keyCode !== 229;

export function AutoTextarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const fit = () => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight + el.offsetHeight - el.clientHeight}px`;
  };
  useLayoutEffect(fit, [props.value]);
  // 寬度變了（轉向、改視窗大小）字換行的位置也變；只看寬度，自己改高度不用重量
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    let width = el.offsetWidth;
    const ro = new ResizeObserver(() => {
      if (el.offsetWidth === width) return;
      width = el.offsetWidth;
      fit();
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return <textarea {...props} ref={ref} rows={1} />;
}
