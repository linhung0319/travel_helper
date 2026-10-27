// 優點、缺點兩串（第八輪：網頁行程卡、探索／想去的卡展開時用，詳情的簡介是完整的那份）。樣式沿用詳情的 .pros／.cons。
import type { Summary } from '../../data/types.ts';

/** max：每串最多幾條（卡片裡只放前幾條，全部看詳情） */
export function ProsCons({ summary, max }: { summary: Summary | null | undefined; max?: number }) {
  const pros = (summary?.pros ?? []).slice(0, max);
  const cons = (summary?.cons ?? []).slice(0, max);
  if (!pros.length && !cons.length) return null;
  return (
    <div className="pros-cons" data-testid="pros-cons">
      {pros.length > 0 && (
        <ul className="pros">
          {pros.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      )}
      {cons.length > 0 && (
        <ul className="cons">
          {cons.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
