// 探索、想去的卡點了原地展開的內容（第八輪 §13.3 第 1 點、第 7 點，網頁）：介紹的前兩句、優缺點各兩條、「詳細資料 ›」。
// 照片牆的卡展開時橫跨兩欄（PlaceWall 的 openId），清單的列在原地往下長。按「詳細資料」才開詳情；點展開區塊的空白處不收起（同行程卡）。
import type { Place } from '../../data/types.ts';
import { Button } from './Button.tsx';
import { ProsCons } from './ProsCons.tsx';
import { firstSentences } from './TripCard.tsx';

export function PlaceOpenBody({ place, onDetail }: { place: Place; onDetail: () => void }) {
  const intro = firstSentences(place.summary?.text);
  return (
    <div className="po-body" data-testid="place-open" onClick={(e) => e.stopPropagation()}>
      {intro && <p className="po-intro">{intro}</p>}
      <ProsCons summary={place.summary} max={2} />
      <div className="po-actions">
        <Button kind="primary" size="sm" onClick={onDetail} data-testid="place-open-detail">
          詳細資料 ›
        </Button>
      </div>
    </div>
  );
}
