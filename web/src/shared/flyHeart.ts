// 第一次按 ♡（interaction-design §17.4）：愛心從按的地方飛進想去分頁，看得出它去哪了。分頁看不到時不提示，等下次。

const WISH_TAB = '[data-testid="m-tab-wish"],[data-testid="side-tab-wish"]';

/** 想去分頁現在看得到才回傳：手機編輯行程時分頁列藏起來、被別的東西蓋住都算看不到 */
export function visibleWishTab(): HTMLElement | null {
  const el = document.querySelector<HTMLElement>(WISH_TAB);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (!r.width || !r.height) return null;
  const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  return hit && el.contains(hit) ? el : null;
}

/** 飛完才 resolve；系統設定減少動態時不飛 */
export async function flyHeart(from: DOMRect, to: HTMLElement): Promise<void> {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || !to.animate) return;
  const end = to.getBoundingClientRect();
  const size = 22;
  const x0 = from.left + from.width / 2 - size / 2;
  const y0 = from.top + from.height / 2 - size / 2;
  const x1 = end.left + end.width / 2 - size / 2;
  const y1 = end.top + end.height / 2 - size / 2;
  const el = document.createElement('span');
  el.className = 'ui-fly-heart';
  el.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M12 21s-8-4.900-10-10C.8 7.600 3.200 4 7 4c2.200 0 3.900 1.200 5 3 1.100-1.800 2.800-3 5-3 3.800 0 6.200 3.600 5 7-2 5.100-10 10-10 10z"/></svg>';
  el.setAttribute('aria-hidden', 'true');
  document.body.appendChild(el);
  const run = el.animate(
    [
      { transform: `translate(${x0}px, ${y0}px) scale(1)` },
      { transform: `translate(${(x0 + x1) / 2}px, ${(y0 + y1) / 2}px) scale(1.4)`, offset: 0.35 },
      { transform: `translate(${x1}px, ${y1}px) scale(0.6)` },
    ],
    { duration: 500, easing: 'ease-in-out', fill: 'forwards' },
  );
  await run.finished.catch(() => {});
  el.remove();
  to.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.12)' }, { transform: 'scale(1)' }], { duration: 300 });
}
