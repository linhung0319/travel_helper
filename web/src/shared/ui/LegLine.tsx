// 兩張卡中間的交通（第八輪 §13.6 交通卡，網頁、手機共用）：比資料卡窄、有框的小卡，縮在時間軸連線的右邊；
// 交通方式的小圓點（線條圖示）放在連線上（連線在資料卡小照片的中線，ui.css 的 ll-li::before）。
// 第一行「計程車 34 分」，第二行距離、台數、含等車（sub），備註再一行；字和資料卡的時間、副標一樣大。
// 右邊「map ↗」（Google Maps 路線，外部連結），編輯中多一顆「改」（按了才打開交通編輯器）。
// 大眾運輸點卡片展開步驟（children 放在卡片裡、標題下面）；網頁、手機的資料準備在 components/LegRow.tsx 的 useLegView。

import type { ReactNode } from 'react';
import type { Leg } from '@travel-helper/engine';
import { ModeIcon } from '../../components/ModeIcon.tsx';
import { Icon } from '../../components/Icon.tsx';

export interface LegLineProps {
  mode: Leg['mode'];
  /** 「計程車 34 分」 */
  title: string;
  /** 第二行：距離、台數、含等車…（用「・」接起來） */
  sub?: string[];
  note?: string | null;
  /** Google Maps 路線的網址；沒有就不畫「map ↗」 */
  mapsHref?: string | null;
  /** 點卡片展開／收起（大眾運輸的步驟）；沒有就不能點 */
  onToggle?: (() => void) | null;
  open?: boolean;
  /** 後面畫小箭頭（有步驟可以展開：大眾運輸） */
  expandable?: boolean;
  /** 編輯中可以改這段：畫「改」 */
  onEdit?: (() => void) | null;
}

/** 一張交通卡；children（步驟、編輯器）接在卡片裡、標題下面 */
export function LegLine({ mode, title, sub = [], note, mapsHref, onToggle, open = false, expandable = false, onEdit, children }: LegLineProps & { children?: ReactNode }) {
  const body = (
    <>
      <span className="ll-text" data-testid="leg-line-text">
        <span className="ll-title">{title}</span>
        {sub.length > 0 && <span className="ll-sub">{sub.join('・')}</span>}
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
    <div className={`ll ${open ? 'open' : ''}`} data-testid="leg-line">
      {/* 連線上的交通方式小圓點 */}
      <span className="ll-dot">
        <ModeIcon mode={mode} size="s" />
      </span>
      <div className="ll-card">
        <div className="ll-head">
          {onToggle ? (
            <button type="button" className="ll-main" aria-pressed={open} aria-expanded={open} onClick={onToggle}>
              {body}
            </button>
          ) : (
            <span className="ll-main">{body}</span>
          )}
          {mapsHref && (
            <a className="ll-maps" href={mapsHref} target="_blank" rel="noreferrer" aria-label="在 Google Maps 開路線" data-testid="leg-maps">
              map ↗
            </a>
          )}
          {onEdit && (
            <button type="button" className="ll-edit" onClick={onEdit} data-testid="leg-edit">
              改
            </button>
          )}
        </div>
        {children}
      </div>
    </div>
  );
}
