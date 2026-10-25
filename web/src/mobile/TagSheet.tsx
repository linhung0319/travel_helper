// 手機版動作面板裡的「🏷 標籤」「🏷 這晚的方案」子畫面（第六輪 §2.1、§3.5）：和網頁版的標籤彈窗同樣的內容，排成大顆的膠囊（點的範圍 44px）。
// 每組一列（用餐、誰去、安排；誰去互斥），點了立刻存、面板不關（存檔中先不能點，不然下一下會被擋掉）；分組和規則讀 shared/tagOptions.ts，存檔用 ItemTags.tsx 的 toggleVisitTag。
// 回住宿那張宿的卡只有一組「這晚的方案」（三選一、再點一下＝照住宿資料），存檔用 pickLodgingPlan。

import type { CSSProperties } from 'react';
import { useData, useShared } from '../hooks.ts';
import { findItemRef } from '../lib/planView.ts';
import { LODGING_PLANS, TAG_LABELS, tagGroupsFor, type TagGroup } from '../shared/tagOptions.ts';
import { pickLodgingPlan, tagKindOf, toggleVisitTag } from '../components/ItemTags.tsx';

/** 分組的顏色變數（選了的膠囊用） */
const groupStyle = (g: Pick<TagGroup, 'bg' | 'fg'>) => ({ '--tag-bg': g.bg, '--tag-fg': g.fg }) as CSSProperties;

/** 這晚的方案用紫色（設計 §2.1） */
const LODGING_COLORS = { bg: '#efe7fb', fg: '#5b3a9c' };

/** 卡片的標籤：每組一列；行程裡找不到這張卡（剛被移走）時不畫 */
export function TagSheet({ itemId }: { itemId: string }) {
  const visit = useData((s) => {
    const item = findItemRef(s.itinerary, itemId)?.item;
    return item?.type === 'visit' ? item : null;
  });
  const type = useData((s) => (visit ? s.byId.get(visit.options[visit.selected]?.place ?? '')?.type : undefined));
  // 存檔中再點會被擋下來（還在儲存上一個修改）：先不能點
  const saving = useShared((s) => s.saving);
  if (!visit) return null;
  const have = visit.tags ?? [];
  return (
    <div className="m-tag-sheet" data-testid="m-tag-sheet" role="menu" aria-label="標籤">
      {tagGroupsFor(tagKindOf(type)).map((g) => (
        <div key={g.id} className="m-tag-group" role="group" aria-label={g.title} style={groupStyle(g)}>
          <div className="m-tag-title">
            {g.icon} {g.title}
          </div>
          <div className="m-tag-opts">
            {g.tags.map((t) => (
              <button key={t} type="button" role="menuitemcheckbox" aria-checked={have.includes(t)} className={`m-tag-opt ${have.includes(t) ? 'on' : ''}`} disabled={saving} onClick={() => toggleVisitTag(visit, t)} data-testid={`tag-opt-${t}`}>
                {TAG_LABELS[t]}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/** 這晚的方案：三選一，再點選了的那個＝照住宿資料 */
export function LodgingPlanSheet({ date }: { date: string }) {
  const cur = useData((s) => s.itinerary?.days.find((d) => d.date === date)?.lodgingMeals ?? null);
  const saving = useShared((s) => s.saving);
  return (
    <div className="m-tag-sheet" data-testid="m-lodging-plan-sheet" role="menu" aria-label="這晚的方案">
      <div className="m-tag-group" role="group" aria-label="這晚的方案" style={groupStyle(LODGING_COLORS)}>
        <div className="m-tag-title">🛏 這晚的方案</div>
        <div className="m-tag-opts">
          {LODGING_PLANS.map((x) => (
            <button key={x.value} type="button" role="menuitemradio" aria-checked={cur === x.value} className={`m-tag-opt ${cur === x.value ? 'on' : ''}`} disabled={saving} onClick={() => pickLodgingPlan(date, cur, x.value)} data-testid={`lodging-plan-${x.value}`}>
              {x.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
