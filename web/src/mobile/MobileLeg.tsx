// 手機版時間軸上兩張卡中間的交通（第六輪 §3.5）：壓成一行「🚕 計程車 9 分・3.4km」，右邊是「Google Map」。
// 資料準備和網頁版的交通卡一樣（LegRow.tsx 的 useLegView）：點了這段就展開（一次只開一段，地圖只畫這段）；
// 大眾運輸展開後是步驟（LegRow 的 LegSteps，排成一欄）。等待那一行接在交通下面，是純文字、不能點（§2.4）。
// 點交通時，選到的卡片取消（地圖只看這段）。編輯中的改交通方式、選班次是 Task 11。

import type { TimelineEntry, VisitItem } from '@travel-helper/engine';
import { useData } from '../hooks.ts';
import { legMapsUrl, legTitle, waitNote } from '../lib/planView.ts';
import { LegSteps, useLegView } from '../components/LegRow.tsx';
import { ModeIcon } from '../components/ModeIcon.tsx';
import { mobileStore } from './mobileStore.ts';

/** 一段交通（一行，點了展開步驟）；不用移動時不畫 */
export function MobileLeg({ entry, date }: { entry: TimelineEntry; date: string }) {
  const v = useLegView(entry, date);
  if (!v) return null;
  const { leg, key, open, editing, saving, target, from, to, mode, sub, steps, transit, note } = v;
  const text = [legTitle(leg) || '交通 0 分', ...sub].join('・');
  return (
    <li className={`m-leg ${open ? 'open' : ''}`} data-testid="m-leg" data-leg={key}>
      <div className="m-leg-row">
        <button
          type="button"
          className="m-leg-text"
          aria-pressed={open}
          aria-expanded={transit ? open : undefined}
          onClick={() => {
            if (!open) mobileStore.getState().focusItem(null);
            v.toggleOpen();
          }}
        >
          <ModeIcon mode={leg.mode} size="s" />
          <span className="m-ellipsis">
            {text}
            {note && <span className="m-leg-note"> 📝 {note}</span>}
          </span>
          {transit && (
            <span className={`m-leg-chev ${open ? 'open' : ''}`} aria-hidden>
              ▸
            </span>
          )}
        </button>
        {from && to && (
          <a className="m-leg-maps" href={legMapsUrl(from, to, mode)} target="_blank" rel="noreferrer" data-testid="leg-maps">
            Google Map
          </a>
        )}
      </div>
      {open && transit && <LegSteps steps={steps} leg={leg} date={date} legKey={key} target={target} editing={editing} saving={saving} />}
    </li>
  );
}

/** 到了要等（📌、還沒開門）：交通下面一行純文字；不用等就不畫 */
export function MobileWait({ entry, visit }: { entry: TimelineEntry; visit: VisitItem | null }) {
  const byId = useData((s) => s.byId);
  const text = waitNote(entry, visit, entry.placeId ? byId.get(entry.placeId) : undefined);
  if (!text) return null;
  return (
    <li className="m-wait" data-testid="tl-wait">
      {text}
    </li>
  );
}
