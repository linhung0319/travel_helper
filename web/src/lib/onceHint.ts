// 只出現一次的提示（interaction-design §17）：記在這台裝置的瀏覽器；讀寫失敗（私密瀏覽、LINE 內建瀏覽器的限制）就當沒看過，頂多多提示一次。

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // 存不了：下次再提示
  }
}

/** 第一次呼叫回 true，之後都回 false */
export function firstTime(key: string): boolean {
  if (read(key)) return false;
  write(key, '1');
  return true;
}

/** 讀這台裝置存的 JSON；沒有或壞掉回 fallback */
export function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = read(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export const writeJson = (key: string, value: unknown) => write(key, JSON.stringify(value));
