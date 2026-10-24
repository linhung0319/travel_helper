// 搜尋欄（探索、想去共用）：打字即時篩名稱（中文、日文、假名、英文）。地圖也跟著篩。

import { appStore } from '../store.ts';
import { useApp } from '../hooks.ts';

export function SearchBox() {
  const query = useApp((s) => s.query);
  return (
    <div className="search-box">
      <span className="search-icon" aria-hidden>
        🔍
      </span>
      <input type="search" value={query} placeholder="搜尋名稱（中文、日文、英文）" aria-label="搜尋名稱" onChange={(e) => appStore.getState().setQuery(e.target.value)} data-testid="search" />
      {query && (
        <button type="button" className="search-clear" aria-label="清除搜尋" onClick={() => appStore.getState().setQuery('')}>
          ✕
        </button>
      )}
    </div>
  );
}
