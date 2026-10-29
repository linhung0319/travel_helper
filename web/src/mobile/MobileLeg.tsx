// 手機版時間軸上兩張卡中間的交通（第六輪 §3.5，第八輪 §13.6 改成交通卡）：shared/ui/LegLine.tsx「計程車 9 分」、下一行膠囊或台數（T29c），右邊「map ↗」。
// 資料準備和網頁版的交通一樣（LegRow.tsx 的 useLegView）：點了這段就展開（一次只開一段，地圖只畫這段）；
// 展開後是補充資訊框和步驟（LegRow 的 LegDetail，和網頁同一套）。等待那一行接在交通下面，是純文字、不能點（§2.4）。
// 點交通時，選到的卡片取消（地圖只看這段）。
// 編輯中：每段右邊有「改」；交通編輯器不會自己展開，按「改」才從下面升起來——底部面板 m-leg-sheet（和「⋯」動作面板同一種：上方暗的、點暗處或 Esc 關，
// 第五輪的編輯狀態 LegEditor：方式、分鐘、備註、完成），只有一個「完成」；大眾運輸的步驟接在編輯器裡（只能看：班次表會被面板蓋住，站名、標籤不能點），這時時間軸上那一行下面不再重複。
// 交通也是放置區（dropOnLegProps）：拖到這裡＝排在這段通往的那張卡前面。

import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { TimelineEntry, VisitItem } from '@travel-helper/engine';
import { useData } from '../hooks.ts';
import { legMapsUrl, legTitle, waitNote } from '../lib/planView.ts';
import { LegDetail, LegEditor, useLegView } from '../components/LegRow.tsx';
import { dropOnLegProps } from '../components/planDrag.ts';
import { uiStore } from '../uiStore.ts';
import { LegLine } from '../shared/ui/LegLine.tsx';
import { mobileStore } from './mobileStore.ts';

const closeEditor = () => uiStore.setState({ legOpen: null, legEdit: null });

/** 交通編輯器的底部面板：蓋在行程頁（.m-trip）上面，點暗處或 Esc 關 */
function LegSheet({ title, children }: { title: string; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeEditor();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const host = document.querySelector('[data-testid="m-trip"]');
  if (!host) return null;
  return createPortal(
    <div className="m-asheet-root">
      <div className="m-sheet-dim" data-testid="m-sheet-dim" onClick={closeEditor} aria-hidden />
      <section className="m-asheet m-leg-sheet" role="dialog" aria-label={title} data-testid="m-leg-sheet">
        <div className="m-asheet-grab" aria-hidden>
          <span />
        </div>
        <div className="m-asheet-head">
          <strong className="m-ellipsis">{title}</strong>
        </div>
        <div className="m-asheet-body">{children}</div>
      </section>
    </div>,
    host,
  );
}

/** 一段交通（一行，點了展開步驟；編輯中按「改」打開底部面板）；不用移動時不畫 */
export function MobileLeg({ entry, date }: { entry: TimelineEntry; date: string }) {
  const v = useLegView(entry, date);
  if (!v) return null;
  const { leg, key, open, editing, editable, planning, target, spec, from, to, mode } = v;
  const detail = open ? <LegDetail v={v} date={date} /> : null;
  const nameOf = (p: typeof from) => (p ? p.name.zh || p.name.ja : '');
  return (
    <li className={`m-leg ll-li ${open ? 'open' : ''} ${editing ? 'editing' : ''}`} data-testid="m-leg" data-leg={key} {...dropOnLegProps(entry.itemId, date, planning)}>
      <LegLine
        mode={leg.mode}
        title={legTitle(leg) || '交通 0 分'}
        warnCount={v.warns}
        chips={v.chips}
        sub={v.sub}
        note={v.note}
        mapsHref={from && to ? legMapsUrl(from, to, mode) : null}
        onToggle={() => {
          if (!open) mobileStore.getState().focusItem(null);
          v.toggleOpen();
        }}
        open={open}
        expandable={v.expandable}
        onEdit={editable && !editing ? () => {
          mobileStore.getState().focusItem(null);
          v.startEdit();
        } : null}
      >
        {!editing && detail}
      </LegLine>
      {editing && target && (
        <LegSheet title={`交通：${nameOf(from) || '出發'} → ${nameOf(to) || '下一站'}`}>
          <LegEditor key={JSON.stringify(spec)} target={target} spec={spec} leg={leg}>
            {/* 面板蓋住地圖那側的班次表，步驟只能看（站名、標籤不能點） */}
            <LegDetail v={v} date={date} readOnly />
          </LegEditor>
        </LegSheet>
      )}
    </li>
  );
}

/** 到了要等（指定開始時間、還沒開門）：交通下面一行純文字；不用等就不畫 */
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
