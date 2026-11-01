// 元素快要進畫面時通知一次（T32，照片用）。不用 <img loading="lazy">：瀏覽器提早的距離很大（手機一開探索就載 38 張），也不能調。
// IntersectionObserver 的 root 要是最近的捲動容器：只設 rootMargin 而 root 是整個視窗時，
// 捲動容器外面的元素會先被容器裁掉，提早量就沒有作用。同一個容器共用一個 observer。

/** 離畫面多遠就開始載 */
const MARGIN = '300px';

type Done = () => void;
const observers = new Map<Element | null, { io: IntersectionObserver; waiting: Map<Element, Done> }>();

function nearestScroller(el: Element): Element | null {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const s = getComputedStyle(p);
    if (/auto|scroll/.test(s.overflowY) || /auto|scroll/.test(s.overflowX)) return p;
  }
  return null;
}

/** el 快要進畫面時呼叫 done 一次；回傳取消的函式 */
export function whenNearViewport(el: Element, done: Done): () => void {
  const root = nearestScroller(el);
  let entry = observers.get(root);
  if (!entry) {
    const waiting = new Map<Element, Done>();
    const io = new IntersectionObserver(
      (records) => {
        for (const r of records) {
          if (!r.isIntersecting) continue;
          waiting.get(r.target)?.();
          waiting.delete(r.target);
          io.unobserve(r.target);
        }
      },
      { root, rootMargin: MARGIN },
    );
    entry = { io, waiting };
    observers.set(root, entry);
  }
  const { io, waiting } = entry;
  waiting.set(el, done);
  io.observe(el);
  return () => {
    waiting.delete(el);
    io.unobserve(el);
    // 容器（詳情的輪播）關掉了：observer 也不留著
    if (waiting.size === 0 && root) {
      io.disconnect();
      observers.delete(root);
    }
  };
}
