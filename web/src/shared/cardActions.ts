// 時間軸卡片「⋯」選單的動作清單（設計 §2.3）。網頁版和手機版都讀這裡，
// 回傳分好組的動作 id，組與組之間畫分隔線；空陣列＝不畫「⋯」。

import type { IconName } from '../lib/icons.ts';

export type CardKind = 'visit' | 'lodging-start' | 'lodging-end' | 'free' | 'flight' | 'candidate';

export type ActionId =
  | 'main' | 'detach' | 'tags' | 'stay' | 'pin' | 'unpin' | 'reorder' | 'move'
  | 'withdraw' | 'lodging-plan' | 'lodging-clear' | 'free-length' | 'delete' | 'schedule';

export interface CardActionContext {
  kind: CardKind;
  /** 重疊卡（同一時段有備選） */
  overlap?: boolean;
  pinned?: boolean;
  /** 候選是不是自己加的 */
  mine?: boolean;
  surface: 'desktop' | 'mobile';
}

/** 這張卡的動作，分好組 */
export function cardActions(ctx: CardActionContext): ActionId[][] {
  switch (ctx.kind) {
    case 'visit': {
      const groups: ActionId[][] = [];
      if (ctx.overlap) groups.push(['main', 'detach']);
      const mid: ActionId[] = ['tags'];
      if (ctx.surface === 'mobile') mid.push('stay'); // 網頁版卡片上本來就有 −／＋
      mid.push(ctx.pinned ? 'unpin' : 'pin', 'reorder', 'move'); // 調整順序：不拖也能上移、下移、合併（第七輪 §6.4）
      groups.push(mid, ['withdraw']);
      return groups;
    }
    case 'lodging-end':
      return [['lodging-plan'], ['lodging-clear']];
    case 'free':
      // 自由時間也能調整順序（上移、下移；不能合併）
      return [['free-length', 'reorder', 'move'], ['delete']];
    case 'candidate':
      return [ctx.mine ? ['schedule', 'move'] : ['schedule'], ['delete']];
    case 'lodging-start':
    case 'flight':
      return [];
  }
}

/** 動作名稱（不含圖示；圖示在 ACTION_ICONS，畫的人把圖示放在字前面） */
export const ACTION_LABELS: Record<ActionId, string> = {
  main: '主要',
  detach: '拿出',
  tags: '標籤',
  stay: '改停留時間',
  pin: '釘選時間',
  unpin: '解除釘選',
  reorder: '調整順序',
  move: '移到第幾天…',
  withdraw: '撤下（回候選）',
  'lodging-plan': '這晚的方案',
  'lodging-clear': '清掉這晚的住宿',
  'free-length': '改時間長度',
  delete: '刪除',
  schedule: '排進這天',
};

/** 每個動作前面的線條圖示 */
export const ACTION_ICONS: Record<ActionId, IconName> = {
  main: 'star',
  detach: 'out',
  tags: 'tag',
  stay: 'clock',
  pin: 'pin',
  unpin: 'pin',
  reorder: 'sort',
  move: 'calendar-move',
  withdraw: 'undo',
  'lodging-plan': 'bed',
  'lodging-clear': 'trash',
  'free-length': 'clock',
  delete: 'trash',
  schedule: 'calendar',
};
