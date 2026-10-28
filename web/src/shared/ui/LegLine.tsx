// 兩張卡中間的交通（第八輪 §13.6 交通卡，網頁、手機共用；T29c spec §8.2 改成收合兩行）：比資料卡窄、有框的小卡，縮在時間軸連線的右邊；
// 交通方式的小圓點（線條圖示）放在連線上（連線在資料卡小照片的中線，ui.css 的 ll-li::before）。
// 第一行「大眾運輸 45 分」，這段有 warning 以上的警告時後面「⚠ 數字」（不寫警告的字）；
// 第二行搭車的是走法的膠囊（每一程一顆，中間小字寫換車站），計程車是台數（sub），步行沒有第二行；備註再一行。字和資料卡的時間、副標一樣大。
// 右邊「map ↗」（Google Maps 路線，外部連結），編輯中多一顆「改」（按了才打開交通編輯器）。
// 點卡片展開（children 放在卡片裡、標題下面：補充資訊框、步驟、編輯器）；網頁、手機的資料準備在 components/LegRow.tsx 的 useLegView。

import { Fragment, type CSSProperties, type ReactNode } from 'react';
import type { Leg, TransitRide } from '@travel-helper/engine';
import { ModeIcon } from '../../components/ModeIcon.tsx';
import { Icon } from '../../components/Icon.tsx';
import { RIDE_COLOR } from '../../lib/modeIcon.ts';

/** 第二行的膠囊：每一程的方式和短名稱；stops[i] 是第 i 程和第 i+1 程中間的換車站（legView 的 legChips） */
export interface LegChips {
  rides: { mode: TransitRide['mode']; name: string }[];
  stops: string[];
}

export interface LegLineProps {
  mode: Leg['mode'];
  /** 「計程車 34 分」 */
  title: string;
  /** 第一行後面的「⚠ 數字」（這段 warning、error 等級的警告數）；0 不畫 */
  warnCount?: number;
  /** 第二行：搭車的膠囊（有就不畫 sub） */
  chips?: LegChips | null;
  /** 第二行：計程車台數（用「・」接起來） */
  sub?: string[];
  note?: string | null;
  /** Google Maps 路線的網址；沒有就不畫「map ↗」 */
  mapsHref?: string | null;
  /** 點卡片展開／收起；沒有就不能點 */
  onToggle?: (() => void) | null;
  open?: boolean;
  /** 後面畫小箭頭（點開有東西看：步驟、補充資訊框） */
  expandable?: boolean;
  /** 編輯中可以改這段：畫「改」 */
  onEdit?: (() => void) | null;
}

/** 第二行的膠囊列：交通方式圖示＋短名稱，外框用交通方式的顏色；兩程中間小字寫換車站 */
function ChipRow({ chips }: { chips: LegChips }) {
  return (
    <span className="ll-chips" data-testid="leg-chips">
      {chips.rides.map((r, i) => (
        <Fragment key={i}>
          {i > 0 && chips.stops[i - 1] && <span className="ll-chip-stop">{chips.stops[i - 1]}</span>}
          <span className="ll-chip" style={{ '--ride-c': RIDE_COLOR[r.mode] } as CSSProperties}>
            <ModeIcon mode={r.mode} size="s" />
            <span className="ll-chip-name">{r.name}</span>
          </span>
        </Fragment>
      ))}
    </span>
  );
}

/** 一張交通卡；children（補充資訊框、步驟、編輯器）接在卡片裡、標題下面 */
export function LegLine({ mode, title, warnCount = 0, chips, sub = [], note, mapsHref, onToggle, open = false, expandable = false, onEdit, children }: LegLineProps & { children?: ReactNode }) {
  const body = (
    <>
      <span className="ll-text" data-testid="leg-line-text">
        <span className="ll-line1">
          <span className="ll-title">{title}</span>
          {warnCount > 0 && (
            <span className="ll-warn" data-testid="leg-warn-count" aria-label={`${warnCount} 個提醒`}>
              <Icon name="warn" size={16} />
              {warnCount}
            </span>
          )}
        </span>
        {chips && chips.rides.length > 0 ? <ChipRow chips={chips} /> : sub.length > 0 && <span className="ll-sub">{sub.join('・')}</span>}
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
