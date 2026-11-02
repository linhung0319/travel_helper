// 畫面畫完、有空的時候才做的事（T39）。Safari 沒有 requestIdleCallback，等一下再做。回傳的函式取消

let mapLoaded: () => void = () => {};
const mapReady = new Promise<void>((resolve) => {
  mapLoaded = resolve;
});

/** 地圖畫好了（MapView 呼叫） */
export const markMapLoaded = () => mapLoaded();

/** 地圖載好才開始的事（時刻表、詳情層）：大檔案不和地圖搶網路。地圖一直載不好也只等 maxMs */
export function afterMap(fn: () => void, maxMs = 5000): void {
  void Promise.race([mapReady, new Promise((r) => setTimeout(r, maxMs))]).then(() => whenIdle(fn, 1000));
}

export function whenIdle(fn: () => void, timeoutMs = 1000): () => void {
  if (typeof requestIdleCallback === 'function') {
    const id = requestIdleCallback(fn, { timeout: timeoutMs });
    return () => cancelIdleCallback(id);
  }
  const id = setTimeout(fn, Math.min(timeoutMs, 500));
  return () => clearTimeout(id);
}
