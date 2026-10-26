// 網頁版卡片右邊的「⋯」動作選單（設計 §2.3）：只有圖示，只在編輯中畫（呼叫的人決定）。
// 動作照 menuItems（cardActionRun.ts，順序是 shared/cardActions.ts）畫，組與組之間一條分隔線；點了關選單、交給 runCardAction。
// 選單用 Popover（portal 到 body、蓋過地圖和下一張卡、超出視窗自己翻）；「移到{組名}」每組一項（menuItems 已經和 ctx.groupTargets 對好）。
// 「調整順序」在同一個選單裡換成子畫面（shared/ui/ReorderPanel.tsx；‹ 回到動作清單），上移、下移可以連按，合併好了才關。

import { Fragment, useRef, useState } from 'react';
import { ACTION_ICONS, type ActionId, type CardActionContext } from '../shared/cardActions.ts';
import { Icon } from './Icon.tsx';
import { menuItems, runCardAction, type ActionTarget, type ActionUi } from './cardActionRun.ts';
import { Popover } from './Popover.tsx';
import { ReorderPanel } from '../shared/ui/ReorderPanel.tsx';

/** 「⋯」按鈕和它的選單；沒有動作時不畫。disabled：畫出來但不能點（例如看主卡時的「主要」） */
export function ActionMenu({ ctx, target, ui, label, disabled = [] }: { ctx: CardActionContext; target: ActionTarget; ui: ActionUi; label: string; disabled?: ActionId[] }) {
  const [open, setOpen] = useState(false);
  const [reorder, setReorder] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const groups = menuItems(ctx, target);
  if (!groups.length) return null;
  const close = () => {
    setOpen(false);
    setReorder(false);
  };
  const run = (id: ActionId, t: ActionTarget) => {
    if (id === 'reorder') return setReorder(true);
    close();
    void runCardAction(id, t, ui);
  };
  return (
    <span className="item-menu">
      <button ref={button} type="button" className="icon-button small" aria-label={`${label} 的選單`} aria-haspopup="menu" aria-expanded={open} onClick={() => (open ? close() : setOpen(true))} data-testid="item-menu">
        <Icon name="more" />
      </button>
      <Popover anchor={button.current} open={open} onClose={close} testId="action-menu">
        {reorder && target.itemId ? (
          <div className="action-menu" aria-label={`${label} 調整順序`}>
            <button type="button" className="action-menu-back" onClick={() => setReorder(false)} data-testid="action-menu-back">
              <Icon name="back" size={16} />
              <span>調整順序</span>
            </button>
            <ReorderPanel itemId={target.itemId} onDone={close} />
          </div>
        ) : (
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
                    <Icon name={ACTION_ICONS[m.id]} size={16} />
                    <span>{m.text}</span>
                  </button>
                ))}
              </Fragment>
            ))}
          </div>
        )}
      </Popover>
    </span>
  );
}
