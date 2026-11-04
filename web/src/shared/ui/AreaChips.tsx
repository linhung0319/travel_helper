// 篩選列下面那一列地區（T42，interaction-design §20）：手機、網頁，探索、想去長得一樣。
// 順序照 areas.json 的 tripOrder（志摩 → 鳥羽 → 二見 → 伊勢 → 大阪 → 關西機場周邊）。第一顆探索叫「概覽」、想去叫「全部」，選它是沒有選地區。
// T69（interaction-design §33）：長得像分頁（文字＋底線，概覽的底線是芥子黃），跟下面的子地區小晶片分得出層級；
// 有「看什麼」時每個地區後面一個灰色小數字（counts：這個篩選在那裡有幾個），0 個的字變淡。
// 一排橫滑（ChipScroller：網頁可以用滾輪、按住拖、‹ › 箭頭，選到的鈕自動捲進畫面，T49）。
// testid 是 `${prefix}-area-<地區 ID>`，第一顆是 `${prefix}-area-all`。

import { useData } from '../../hooks.ts';
import { displayName } from '../../data/normalize.ts';
import { Chip } from './Chip.tsx';
import { ChipScroller } from './ChipScroller.tsx';

/** 分頁、子地區晶片後面的小數字（有「看什麼」時才給） */
export function ScopeCount({ n }: { n: number | undefined }) {
  if (n === undefined) return null;
  return (
    <span className="fb-n" data-testid="scope-count">
      {n}
    </span>
  );
}

export function AreaChips({ value, onPick, firstLabel, prefix, testId, counts }: { value: string | null; onPick: (area: string | null) => void; firstLabel: string; prefix: string; testId?: string; counts?: Map<string, number> | null }) {
  const areas = useData((s) => s.areas);
  return (
    <ChipScroller className="m-chips fb-chips fb-areas" testId={testId} activeKey={value}>
      <Chip on={value === null} onClick={() => onPick(null)} testId={`${prefix}-area-all`} className="ui-chip-overview">
        {firstLabel}
      </Chip>
      {areas.map((a) => {
        const n = counts?.get(a.id);
        return (
          <Chip key={a.id} on={value === a.id} onClick={() => onPick(a.id)} testId={`${prefix}-area-${a.id}`} className={n === 0 ? 'zero' : undefined}>
            {displayName(a.name, a.id)}
            <ScopeCount n={n} />
          </Chip>
        );
      })}
    </ChipScroller>
  );
}
