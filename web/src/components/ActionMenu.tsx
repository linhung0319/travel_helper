// 網頁版卡片右邊的「⋯」動作選單（設計 §2.3）：只有圖示，只在編輯中畫（呼叫的人決定）。
// 動作照 menuGroups（shared/cardActions.ts）的順序，組與組之間一條分隔線；點了關選單、交給 runCardAction（cardActionRun.ts）。
// 選單用 Popover（portal 到 body、蓋過地圖和下一張卡、超出視窗自己翻）；「👥 移到{組名}」每組一項，和 ctx.groupTargets 照位置對上。

import { Fragment, useRef, useState } from 'react';
import { ACTION_LABELS, type ActionId, type CardActionContext } from '../shared/cardActions.ts';
import { menuGroups, runCardAction, type ActionTarget, type ActionUi } from './cardActionRun.ts';
import { Popover } from './Popover.tsx';

/** 紅字的動作（刪掉東西的） */
const DANGER = new Set<ActionId>(['delete', 'lodging-clear']);

/** 「⋯」按鈕和它的選單；沒有動作時不畫。disabled：畫出來但不能點（例如看主卡時的「👑 主要」） */
export function ActionMenu({ ctx, target, ui, label, disabled = [] }: { ctx: CardActionContext; target: ActionTarget; ui: ActionUi; label: string; disabled?: ActionId[] }) {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const groups = menuGroups(ctx);
  if (!groups.length) return null;
  const targets = ctx.groupTargets ?? [];
  let nth = 0; // 第幾個 group-in
  const run = (id: ActionId, t: ActionTarget) => {
    setOpen(false);
    void runCardAction(id, t, ui);
  };
  return (
    <span className="item-menu">
      <button ref={button} type="button" className="icon-button small" aria-label={`${label} 的選單`} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)} data-testid="item-menu">
        ⋯
      </button>
      <Popover anchor={button.current} open={open} onClose={() => setOpen(false)} testId="action-menu">
        <div className="action-menu" role="menu" aria-label={`${label} 的選單`}>
          {groups.map((group, gi) => (
            <Fragment key={gi}>
              {gi > 0 && <hr className="action-menu-sep" />}
              {group.map((id) => {
                const g = id === 'group-in' ? targets[nth++] : null;
                const text = g ? `👥 移到${g.name}` : ACTION_LABELS[id];
                const t = g ? { ...target, split: { id: g.splitId, group: g.groupId, name: g.name } } : target;
                return (
                  <button
                    key={g ? `${id}:${g.splitId}:${g.groupId}` : id}
                    type="button"
                    role="menuitem"
                    className={DANGER.has(id) ? 'danger' : undefined}
                    disabled={disabled.includes(id)}
                    onClick={() => run(id, t)}
                    data-testid={`action-${id}`}
                    {...(g ? { 'data-group': g.groupId } : {})}
                  >
                    {text}
                  </button>
                );
              })}
            </Fragment>
          ))}
        </div>
      </Popover>
    </span>
  );
}
