// 兩張卡中間的交通（第七輪 Task 8，網頁、手機共用）：一行細字，沒有外框。
// 線條圖示、方式、時間、距離（text）；備註接在後面；右邊「地圖 ↗」（外部連結，文字加底線），編輯中多一顆「改」（按了才打開交通編輯器）。
// 大眾運輸點文字展開步驟（children 放在這一行下面）；網頁、手機的資料準備在 components/LegRow.tsx 的 useLegView。

import type { ReactNode } from 'react';
import type { Leg } from '@travel-helper/engine';
import { ModeIcon } from '../../components/ModeIcon.tsx';
import { Icon } from '../../components/Icon.tsx';

export interface LegLineProps {
  mode: Leg['mode'];
  /** 「計程車 9 分・3.4km」 */
  text: string;
  note?: string | null;
  /** Google Maps 路線的網址；沒有就不畫「地圖 ↗」 */
  mapsHref?: string | null;
  /** 點文字展開／收起（大眾運輸的步驟）；沒有就不能點 */
  onToggle?: (() => void) | null;
  open?: boolean;
  /** 後面畫小箭頭（有步驟可以展開：大眾運輸） */
  expandable?: boolean;
  /** 編輯中可以改這段：畫「改」 */
  onEdit?: (() => void) | null;
}

/** 一行交通；children（步驟、編輯器）接在這一行下面 */
export function LegLine({ mode, text, note, mapsHref, onToggle, open = false, expandable = false, onEdit, children }: LegLineProps & { children?: ReactNode }) {
  const body = (
    <>
      <ModeIcon mode={mode} size="s" />
      <span className="ll-text">
        <span className="ll-title" data-testid="leg-line-text">
          {text}
        </span>
        {note && (
          <span className="ll-note ic-text" data-testid="leg-note-text">
            <Icon name="pen" size={16} /> {note}
          </span>
        )}
      </span>
      {onToggle && expandable && (
        <span className="ll-chev" aria-hidden>
          <Icon name="chevron" size={16} />
        </span>
      )}
    </>
  );
  return (
    <>
      <div className={`ll ${open ? 'open' : ''}`} data-testid="leg-line">
        {onToggle ? (
          <button type="button" className="ll-main" aria-pressed={open} aria-expanded={open} onClick={onToggle}>
            {body}
          </button>
        ) : (
          <span className="ll-main">{body}</span>
        )}
        {mapsHref && (
          <a className="ll-maps" href={mapsHref} target="_blank" rel="noreferrer" aria-label="在 Google Maps 開路線" data-testid="leg-maps">
            地圖 ↗
          </a>
        )}
        {onEdit && (
          <button type="button" className="ll-edit" onClick={onEdit} data-testid="leg-edit">
            改
          </button>
        )}
      </div>
      {children}
    </>
  );
}
