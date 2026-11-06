// 篩選面板（手機、網頁同一份內容），一組一排晶片，點了馬上套用（interaction-design §35.5）。選項和字在 shared/filterOptions.ts。
// 給了 theme（地區頁、想去）只畫那個主題的組（themePanel：書架區段切過的條件不進來，想去最前面「誰想去」），標題「篩選 · 志摩的景點」
// （想去沒選地區是「想去的景點」），腳「清除」「看 N 個景點」。沒有主題（搜尋、AI 結果集）畫 listPanel：類型一排晶片＋選了的那幾類的組，
// 標題「篩選 · 志摩・賢島」，腳「全部清除」「顯示 N 個」。地區、子地區在篩選列，面板裡沒有。
// 外框兩種：手機是從下面出來的底部面板（掛到 body，蓋過底部分頁）；網頁是右欄的抽屜（掛到 .side-panel，蓋住分頁下面的整個右欄，自己捲動，頭和腳固定）。

import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useData } from '../../hooks.ts';
import { listPanel, sheetTitle, themeApplied, themePanel, type FilterGroup, type FilterSource } from '../filterOptions.ts';
import { THEME_LABELS, scopeName, type Theme } from '../../lib/shelves.ts';
import type { FilterKey } from '../../lib/filter.ts';
import { placeLabel } from '../../lib/listConditions.ts';
import { Button } from './Button.tsx';
import { Chip } from './Chip.tsx';
import type { FilterModel } from './FilterBar.tsx';

export type FilterSurface = 'desktop' | 'mobile';

/** 抽屜的位置：右欄裡分頁列的下面 */
function drawerTop(host: HTMLElement): number {
  const tabs = host.querySelector<HTMLElement>('.side-tabs');
  return tabs ? tabs.offsetTop + tabs.offsetHeight : 0;
}

export function FilterSheet({ source, surface, model, count, host, onClose, theme = null }: { source: FilterSource; surface: FilterSurface; model: FilterModel; count: number; host: HTMLElement | null; onClose(): void; theme?: Theme | null }) {
  const areas = useData((s) => s.areas);
  const { filter } = model;

  // Esc 只關面板：捕獲階段先攔下，App 的 Esc（關詳情）收不到
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  const groupNode = (id: string, title: string, items: { key: FilterKey | 'bounds'; value: string; label: string; note?: string; on: boolean }[]): ReactNode => (
    <section className="fs-group" key={id} data-group={id}>
      <h3 className="fs-h">{title}</h3>
      <div className="fs-chips">
        {items.map((it) => (
          <Chip key={it.value} on={it.on} onClick={() => (it.key === 'bounds' ? model.setInView(!model.inView) : model.pick(it.key, it.value))} testId={`filter-opt-${id}-${it.value}`}>
            {it.label}
            {it.note && <span className="fs-note">{it.note}</span>}
          </Chip>
        ))}
      </div>
    </section>
  );

  // 地圖只有網頁有；沒有選項的組（探索的想去）不畫
  const render = (g: FilterGroup): ReactNode[] => {
    if (g.desktopOnly && surface !== 'desktop') return [];
    const items = g.options(areas, source).map((o) => ({ key: g.key, ...o, on: g.key === 'bounds' ? model.inView : (filter[g.key] as string[]).includes(o.value) }));
    return items.length ? [groupNode(g.id, g.title, items)] : [];
  };
  const body = (theme ? themePanel(theme, source) : listPanel(filter.types, source)).flatMap(render);
  // 想去沒選地區：「篩選 · 想去的景點」；選了：「篩選 · 賢島的景點」（最小那層）
  const where = theme ? (filter.areas.length === 1 ? scopeName(filter, areas) : source === 'wish' ? '想去' : null) : placeLabel(filter, areas);
  const title = sheetTitle(where, theme);
  const applied = theme ? themeApplied(theme, filter, source) > 0 || model.inView : true;

  const panel = (
    <div className={`fs-panel fs-${surface}`} role="dialog" aria-label={title} data-testid="filter-sheet" style={surface === 'desktop' && host ? { top: drawerTop(host) } : undefined} onClick={(e) => e.stopPropagation()}>
      <header className="fs-head">
        <h2 className="fs-title" data-testid="filter-title">
          {title}
        </h2>
        <Button kind="icon" icon="close" aria-label="關閉篩選" onClick={onClose} data-testid="filter-close" />
      </header>
      <div className="fs-body">{body}</div>
      <footer className="fs-foot">
        <Button kind="secondary" onClick={model.clear} disabled={!applied} data-testid="filter-clear">
          {theme ? '清除' : '全部清除'}
        </Button>
        <Button kind="primary" onClick={onClose} data-testid="filter-done">
          {theme ? `看 ${count} 個${THEME_LABELS[theme].noun}` : `顯示 ${count} 個`}
        </Button>
      </footer>
    </div>
  );
  if (surface === 'desktop') return host ? createPortal(panel, host) : panel;
  // 掛到 body：畫在分頁內容（.m-page 自己一層）裡會被底部分頁蓋住
  return createPortal(
    <div className="fs-backdrop" onClick={onClose}>
      {panel}
    </div>,
    document.body,
  );
}
