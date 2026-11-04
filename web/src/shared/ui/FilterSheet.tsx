// 篩選面板（手機、網頁同一份內容），一組一排晶片，點了馬上套用。T67（interaction-design §32）照類型分段：
// 標題「篩選 · 志摩・賢島」；第一列類型；選了類型只畫那幾類的組（shared/filterOptions.ts 的 FILTER_SECTIONS），
// 沒選類型時三類各收成一列（圓章、名稱、組名小字），點了＝選那個類型；最下面是三類共用的等級、地圖（網頁）、想去（只有想去分頁）。
// 地區在篩選列下面一列、子地區在選區後的頂端（T42，interaction-design §20），面板裡沒有。
// 下面「全部清除」「顯示 N 個」。外框兩種：手機是從下面出來的底部面板（掛到 body，蓋過底部分頁）；
// 網頁是右欄的抽屜（掛到 .side-panel，蓋住分頁下面的整個右欄，自己捲動，頭和腳固定）。選項和字在 shared/filterOptions.ts。

import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useData } from '../../hooks.ts';
import { COMMON_GROUPS, FILTER_SECTIONS, TYPE_GROUP, panelLayout, sectionApplied, sectionSummary, sheetTitle, type FilterGroup, type FilterSource } from '../filterOptions.ts';
import { TYPE_LABELS, type FilterKey } from '../../lib/filter.ts';
import { placeLabel } from '../../lib/listConditions.ts';
import { TypeSeal } from './TypeLabel.tsx';
import { Button } from './Button.tsx';
import { Chip } from './Chip.tsx';
import type { FilterModel } from './FilterBar.tsx';

export type FilterSurface = 'desktop' | 'mobile';

/** 抽屜的位置：右欄裡分頁列的下面 */
function drawerTop(host: HTMLElement): number {
  const tabs = host.querySelector<HTMLElement>('.side-tabs');
  return tabs ? tabs.offsetTop + tabs.offsetHeight : 0;
}

export function FilterSheet({ source, surface, model, count, host, onClose }: { source: FilterSource; surface: FilterSurface; model: FilterModel; count: number; host: HTMLElement | null; onClose(): void }) {
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

  const groupNode = (id: string, title: string, dim: boolean, items: { key: FilterKey | 'bounds'; value: string; label: string; note?: string; on: boolean }[]): ReactNode => (
    <section className={`fs-group${dim ? ' dim' : ''}`} key={id} data-group={id} data-dim={dim || undefined}>
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
    return items.length ? [groupNode(g.id, g.title, !!g.dimmed?.(filter), items)] : [];
  };
  const { open, collapsed } = panelLayout(filter.types);
  const body = [
    ...render(TYPE_GROUP),
    ...open.map((t) => (
      <div className="fs-section" key={t} data-section={t} data-testid={`filter-section-${t}`}>
        {open.length > 1 && (
          <h3 className="fs-section-h">
            <TypeSeal type={t} size="sm" />
            {TYPE_LABELS[t]}
          </h3>
        )}
        {FILTER_SECTIONS[t].flatMap(render)}
      </div>
    )),
    ...(collapsed.length
      ? [
          <div className="fs-collapsed" key="collapsed">
            {collapsed.map((t) => {
              const n = sectionApplied(t, filter);
              return (
                <button type="button" key={t} className="fs-fold" onClick={() => model.pick('types', t)} data-testid={`filter-fold-${t}`}>
                  <TypeSeal type={t} />
                  <span className="fs-fold-name">{TYPE_LABELS[t]}</span>
                  <span className="fs-fold-sub">{sectionSummary(t)}</span>
                  {n > 0 && <span className="fs-fold-n">{n}</span>}
                  <span className="fs-fold-chev" aria-hidden>
                    ›
                  </span>
                </button>
              );
            })}
          </div>,
        ]
      : []),
    ...COMMON_GROUPS.flatMap(render),
  ];
  const title = sheetTitle(placeLabel(filter, areas));

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
        <Button kind="secondary" onClick={model.clear} data-testid="filter-clear">
          全部清除
        </Button>
        <Button kind="primary" onClick={onClose} data-testid="filter-done">
          顯示 {count} 個
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
