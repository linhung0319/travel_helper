// 網頁版卡片右邊的「⋯」動作選單（設計 §2.3）：只有圖示，只在編輯中畫（呼叫的人決定）。
// 動作照 menuItems（cardActionRun.ts，順序是 shared/cardActions.ts）畫，組與組之間一條分隔線；點了關選單、交給 runCardAction。
// 選單用 Popover（portal 到 body、蓋過地圖和下一張卡、超出視窗自己翻）；「👥 移到{組名}」每組一項（menuItems 已經和 ctx.groupTargets 對好）。

import { Fragment, useRef, useState } from 'react';
import type { ActionId, CardActionContext } from '../shared/cardActions.ts';
import { menuItems, runCardAction, type ActionTarget, type ActionUi } from './cardActionRun.ts';
import { Popover } from './Popover.tsx';

/** 「⋯」按鈕和它的選單；沒有動作時不畫。disabled：畫出來但不能點（例如看主卡時的「👑 主要」） */
export function ActionMenu({ ctx, target, ui, label, disabled = [] }: { ctx: CardActionContext; target: ActionTarget; ui: ActionUi; label: string; disabled?: ActionId[] }) {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const groups = menuItems(ctx, target);
  if (!groups.length) return null;
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
              {group.map((m) => (
                <button
                  key={m.key}
                  type="button"
                  role="menuitem"
                  className={m.danger ? 'danger' : undefined}
                  disabled={disabled.includes(m.id)}
                  onClick={() => run(m.id, m.target)}
                  data-testid={`action-${m.id}`}
                  {...(m.group ? { 'data-group': m.group } : {})}
                >
                  {m.text}
                </button>
              ))}
            </Fragment>
          ))}
        </div>
      </Popover>
    </span>
  );
}
