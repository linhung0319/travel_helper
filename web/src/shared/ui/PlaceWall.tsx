// 照片牆的兩欄瀑布（兩邊共用）：兩個 flex 欄，第 i 張放第 i % 2 欄，每一排照排名從左到右
// （CSS columns 會先排滿左欄，順序就亂了）；每張的高度各自照照片比例。樣式在 ui.css。
// 網頁第八輪（§13.3）：展開的那張（openId）橫跨兩欄——它前面的照舊兩欄、它自己一整列、後面的再從左欄開始排兩欄。

import { useMemo, type ReactNode } from 'react';
import type { Place } from '../../data/types.ts';

/** items 依排名排好；render 畫一張（通常是 PlaceTile）；total 是篩完的總數（寫在 data-count，分批畫時用） */
type Cell = { place: Place; index: number };

/** 一段兩欄：第 i 張放第 i % 2 欄 */
function twoColumns(cells: Cell[]): Cell[][] {
  const out: Cell[][] = [[], []];
  cells.forEach((c, i) => out[i % 2].push(c));
  return out;
}

export function PlaceWall({ items, render, testId, total, openId = null }: { items: Place[]; render: (place: Place, index: number) => ReactNode; testId?: string; total?: number; openId?: string | null }) {
  const parts = useMemo(() => {
    const cells = items.map((place, index) => ({ place, index }));
    const at = openId ? cells.findIndex((c) => c.place.id === openId) : -1;
    if (at < 0) return { before: twoColumns(cells), open: null, after: null };
    return { before: twoColumns(cells.slice(0, at)), open: cells[at], after: twoColumns(cells.slice(at + 1)) };
  }, [items, openId]);
  const cols = (columns: Cell[][], key: string) =>
    columns.some((c) => c.length) && (
      <div key={key} className="pw-cols">
        {columns.map((col, c) => (
          <div key={c} className="pw-col">
            {col.map(({ place, index }) => (
              <div key={place.id} className="pw-cell">
                {render(place, index)}
              </div>
            ))}
          </div>
        ))}
      </div>
    );
  return (
    <div className="pw" data-testid={testId} data-count={total ?? items.length}>
      {cols(parts.before, 'before')}
      {parts.open && (
        <div className="pw-cell pw-wide" key={parts.open.place.id}>
          {render(parts.open.place, parts.open.index)}
        </div>
      )}
      {parts.after && cols(parts.after, 'after')}
    </div>
  );
}
