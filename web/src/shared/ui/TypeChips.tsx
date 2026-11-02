// 篩選列下面那一列類型晶片（全部、景點、餐廳、住宿）：手機、網頁，探索、想去長得一樣（T33 網頁也用）。testid 是 `${prefix}-type-<類型>`。
// selected：AI 一次套多個類型時，選到的都標亮（套用的篩選晶片拿掉了，只有這裡看得到）；沒給或空的就看 value。

import type { ExploreType, Feed } from '../../lib/explore.ts';
import { TYPE_LABELS } from '../../lib/filter.ts';
import { Chip } from './Chip.tsx';

const TYPE_CHIPS: { type: ExploreType | 'all'; label: string }[] = [
  { type: 'all', label: '全部' },
  ...(['spot', 'restaurant', 'lodging'] as const).map((t) => ({ type: t, label: TYPE_LABELS[t] })),
];

export function TypeChips({ value, selected, onPick, prefix, testId, extra }: { value: Feed['type']; selected?: string[]; onPick: (type: ExploreType | 'all') => void; prefix: string; testId?: string; extra?: { label: string; on: boolean; onClick: () => void; testId: string } }) {
  const on = (type: string) => !extra?.on && (selected?.length ? selected.includes(type) : value === type);
  return (
    <div className="m-chips fb-chips" data-testid={testId}>
      {TYPE_CHIPS.map((c) => (
        <Chip key={c.type} on={on(c.type)} onClick={() => onPick(c.type)} testId={`${prefix}-type-${c.type}`}>
          {c.label}
        </Chip>
      ))}
      {extra && (
        <Chip on={extra.on} onClick={extra.onClick} testId={extra.testId}>
          {extra.label}
        </Chip>
      )}
    </div>
  );
}
