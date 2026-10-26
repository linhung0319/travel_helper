// 照片牆的兩欄瀑布（兩邊共用）：兩個 flex 欄，第 i 張放第 i % 2 欄，每一排照排名從左到右
// （CSS columns 會先排滿左欄，順序就亂了）；每張的高度各自照照片比例。樣式在 ui.css。

import { useMemo, type ReactNode } from 'react';
import type { Place } from '../../data/types.ts';

/** items 依排名排好；render 畫一張（通常是 PlaceTile）；total 是篩完的總數（寫在 data-count，分批畫時用） */
export function PlaceWall({ items, render, testId, total }: { items: Place[]; render: (place: Place, index: number) => ReactNode; testId?: string; total?: number }) {
  const columns = useMemo(() => {
    const out: { place: Place; index: number }[][] = [[], []];
    items.forEach((place, index) => out[index % 2].push({ place, index }));
    return out;
  }, [items]);
  return (
    <div className="pw" data-testid={testId} data-count={total ?? items.length}>
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
}
