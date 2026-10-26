// 篩選面板（手機、網頁同一份內容）：類型、地區（選了地區再多一組小區域）、團體、情境、想去、等級、地圖，一組一排晶片，點了馬上套用。
// 下面「全部清除」「顯示 N 個」。外框兩種：手機是從下面出來的底部面板（掛到 body，蓋過底部分頁）；
// 網頁是右欄的抽屜（掛到 .side-panel，蓋住分頁下面的整個右欄，自己捲動，頭和腳固定）。選項和字在 shared/filterOptions.ts。

import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useData } from '../../hooks.ts';
import { displayName } from '../../data/normalize.ts';
import { FILTER_GROUPS, type FilterSource } from '../filterOptions.ts';
import type { FilterKey } from '../../lib/filter.ts';
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
  const area = filter.areas.length === 1 ? areas.find((a) => a.id === filter.areas[0]) : undefined;

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

  const group = (id: string, title: string, items: { key: FilterKey | 'bounds'; value: string; label: string; on: boolean }[]): ReactNode => (
    <section className="fs-group" key={id} data-group={id}>
      <h3 className="fs-h">{title}</h3>
      <div className="fs-chips">
        {items.map((it) => (
          <Chip key={it.value} on={it.on} onClick={() => (it.key === 'bounds' ? model.setInView(!model.inView) : model.pick(it.key, it.value))} testId={`filter-opt-${id}-${it.value}`}>
            {it.label}
          </Chip>
        ))}
      </div>
    </section>
  );

  // 手機的類型在篩選列下面一列，面板不重複；地圖只有網頁有
  const body = FILTER_GROUPS.filter((g) => !(g.desktopOnly && surface !== 'desktop') && !(g.id === 'type' && surface === 'mobile')).flatMap((g) => {
    const items = g.options(areas, source).map((o) => ({ key: g.key, ...o, on: g.key === 'bounds' ? model.inView : (filter[g.key] as string[]).includes(o.value) }));
    const out = [group(g.id, g.title, items)];
    if (g.id === 'area' && area?.regions?.length) {
      out.push(group('region', `${displayName(area.name, area.id)}的小區域`, area.regions.map((r) => ({ key: 'regions' as const, value: r.id, label: displayName(r.name, r.id), on: filter.regions.includes(r.id) }))));
    }
    return out;
  });

  const panel = (
    <div className={`fs-panel fs-${surface}`} role="dialog" aria-label="篩選" data-testid="filter-sheet" style={surface === 'desktop' && host ? { top: drawerTop(host) } : undefined} onClick={(e) => e.stopPropagation()}>
      <header className="fs-head">
        <h2 className="fs-title">篩選</h2>
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
