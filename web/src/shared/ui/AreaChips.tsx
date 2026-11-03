// 篩選列下面那一列地區晶片（T42，interaction-design §20）：取代原本的類型晶片；手機、網頁，探索、想去長得一樣。
// 順序照 areas.json 的 tripOrder（志摩 → 鳥羽 → 二見 → 伊勢 → 大阪 → 關西機場周邊）。第一顆探索叫「概覽」、想去叫「全部」，選它是沒有選地區。
// 一排橫滑（ChipScroller：網頁可以用滾輪、按住拖、‹ › 箭頭，選到的鈕自動捲進畫面，T49）。
// testid 是 `${prefix}-area-<地區 ID>`，第一顆是 `${prefix}-area-all`。extra 是想去的「自己加 N」（§17.9）。

import { useData } from '../../hooks.ts';
import { displayName } from '../../data/normalize.ts';
import { Chip } from './Chip.tsx';
import { ChipScroller } from './ChipScroller.tsx';

export function AreaChips({ value, onPick, firstLabel, prefix, testId, extra }: { value: string | null; onPick: (area: string | null) => void; firstLabel: string; prefix: string; testId?: string; extra?: { label: string; on: boolean; onClick: () => void; testId: string } }) {
  const areas = useData((s) => s.areas);
  const on = (area: string | null) => !extra?.on && value === area;
  return (
    <ChipScroller className="m-chips fb-chips" testId={testId} activeKey={extra?.on ? extra.testId : value}>
      <Chip on={on(null)} onClick={() => onPick(null)} testId={`${prefix}-area-all`}>
        {firstLabel}
      </Chip>
      {areas.map((a) => (
        <Chip key={a.id} on={on(a.id)} onClick={() => onPick(a.id)} testId={`${prefix}-area-${a.id}`}>
          {displayName(a.name, a.id)}
        </Chip>
      ))}
      {extra && (
        <Chip on={extra.on} onClick={extra.onClick} testId={extra.testId}>
          {extra.label}
        </Chip>
      )}
    </ChipScroller>
  );
}
