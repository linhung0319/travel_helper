// 探索的概覽、選了一區之後的頂端和書架（T42，interaction-design §20）。手機、網頁共用；開詳情、換地區這些動作由呼叫的畫面給。
// 概覽：一區一張卡（照片、區名、一句特色、二月注意第一則、代表的點），代表的點是文字加類型圓章，點了開詳情；「看志摩 ›」進那一區。
// 選了一區：一句特色（選了子地區換成子地區的）、子地區一列、「2 月注意（N）」收合；下面幾排書架（lib/shelves.ts），每排 3 張小卡、「全部 ›」套那組條件。
// 樣式在 ui.css（.xo-*、.xa-*、.xs-*）。

import { useMemo, useState } from 'react';
import { appStore } from '../../store.ts';
import { useData } from '../../hooks.ts';
import { displayName } from '../../data/normalize.ts';
import { shelfFilter, shelfRows } from '../../lib/shelves.ts';
import type { Filter } from '../../lib/filter.ts';
import type { Area, Place } from '../../data/types.ts';
import { Photo } from '../../components/Photo.tsx';
import { Chip } from './Chip.tsx';
import { ChipScroller } from './ChipScroller.tsx';
import { TierMark } from './TierMark.tsx';
import { TypeSeal } from './TypeLabel.tsx';
import { VoteHeart } from './VoteHeart.tsx';

export type HomeSurface = 'desktop' | 'mobile';

const placeName = (p: Place) => p.name.zh || p.name.ja;

/** 網頁：滑鼠移上去指到地圖上的點 */
const hoverProps = (surface: HomeSurface, id: string) =>
  surface === 'desktop' ? { onMouseEnter: () => appStore.getState().hover(id), onMouseLeave: () => appStore.getState().hover(null) } : {};

/** 概覽：一區一張卡 */
export function ExploreOverview({ surface, onOpen, onPickArea }: { surface: HomeSurface; onOpen: (id: string) => void; onPickArea: (area: string) => void }) {
  const areas = useData((s) => s.areas);
  return (
    <div className={`xo xo-${surface}`} data-testid="explore-overview">
      {areas.map((a) => (
        <AreaCard key={a.id} area={a} surface={surface} onOpen={onOpen} onPick={() => onPickArea(a.id)} />
      ))}
    </div>
  );
}

function AreaCard({ area, surface, onOpen, onPick }: { area: Area; surface: HomeSurface; onOpen: (id: string) => void; onPick: () => void }) {
  const byId = useData((s) => s.byId);
  const reps = (area.intro?.highlights ?? []).map((id) => byId.get(id)).filter((p): p is Place => !!p);
  // 照片：第一個有照片的代表點
  const cover = reps.find((p) => p.photos.length > 0) ?? reps[0];
  const name = displayName(area.name, area.id);
  const feb = area.intro?.february?.[0]?.text;
  return (
    <article className="xo-card" data-testid="overview-card" data-area={area.id}>
      <div className="xo-top">
        <button type="button" className="xo-photo" onClick={onPick} aria-label={`看${name}`} tabIndex={-1}>
          {cover && <Photo place={cover} width={240} />}
        </button>
        <div className="xo-text">
          <h3 className="xo-name">
            <button type="button" onClick={onPick} data-testid="overview-name">
              {name}
            </button>
          </h3>
          {area.intro?.summary && <p className="xo-summary">{area.intro.summary}</p>}
          {feb && (
            <p className="xo-feb" data-testid="overview-feb">
              2 月：{feb}
            </p>
          )}
        </div>
      </div>
      <div className="xo-reps">
        {reps.map((p) => (
          <button key={p.id} type="button" className="xo-rep" onClick={() => onOpen(p.id)} data-testid="overview-rep" data-id={p.id} {...hoverProps(surface, p.id)}>
            <TypeSeal type={p.type} size="sm" />
            {placeName(p)}
          </button>
        ))}
        <button type="button" className="xo-go" onClick={onPick} data-testid="overview-go">
          看{name} ›
        </button>
      </div>
    </article>
  );
}

/** 選了一區：頂端（特色、子地區、二月注意）和書架 */
export function AreaHome({ areaId, regionId, surface, onPickRegion, onOpen, onShelfAll }: { areaId: string; regionId: string | null; surface: HomeSurface; onPickRegion: (region: string | null) => void; onOpen: (id: string) => void; onShelfAll: (filter: Filter) => void }) {
  const areas = useData((s) => s.areas);
  const places = useData((s) => s.places);
  const area = areas.find((a) => a.id === areaId);
  const region = area?.regions?.find((r) => r.id === regionId);
  const base = useMemo(() => ({ areas: [areaId], regions: regionId ? [regionId] : [] }), [areaId, regionId]);
  const rows = useMemo(() => shelfRows(places, base), [places, base]);
  const [febOpen, setFebOpen] = useState(false);
  if (!area) return null;
  const summary = region ? (region.intro?.summary ?? null) : (area.intro?.summary ?? null);
  // 二月注意：選了子地區只看那個子地區的一句
  const feb = region ? (region.intro?.febNote ? [region.intro.febNote] : []) : (area.intro?.february ?? []).map((f) => f.text);
  return (
    <div className={`xa xa-${surface}`} data-testid="area-home" data-area={areaId}>
      <div className="xa-head">
        {summary && (
          <p className="xa-summary" data-testid="area-summary">
            {summary}
          </p>
        )}
        {(area.regions?.length ?? 0) > 1 && (
          <ChipScroller className="m-chips fb-chips xa-regions" testId="region-chips" activeKey={regionId}>
            <Chip on={!regionId} onClick={() => onPickRegion(null)} testId="region-all">
              全部
            </Chip>
            {area.regions!.map((r) => (
              <Chip key={r.id} on={regionId === r.id} onClick={() => onPickRegion(r.id)} testId={`region-${r.id}`}>
                {displayName(r.name, r.id)}
              </Chip>
            ))}
          </ChipScroller>
        )}
        {feb.length > 0 && (
          <div className={`xa-feb ${febOpen ? 'open' : ''}`}>
            <button type="button" className="xa-feb-toggle" aria-expanded={febOpen} onClick={() => setFebOpen(!febOpen)} data-testid="area-feb">
              2 月注意（{feb.length}）<span aria-hidden>{febOpen ? '▴' : '▾'}</span>
            </button>
            {febOpen && (
              <ul className="xa-feb-list">
                {feb.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
      {rows.map(({ shelf, items, total }) => (
        <section key={shelf.id} className="xs" data-testid="shelf" data-shelf={shelf.id}>
          <header className="xs-head">
            <h3 className="xs-title">{shelf.title}</h3>
            <button type="button" className="xs-all" onClick={() => onShelfAll(shelfFilter(shelf, base))} data-testid="shelf-all">
              全部 {total} ›
            </button>
          </header>
          <div className="xs-row">
            {items.map((p) => (
              <ShelfCard key={p.id} place={p} surface={surface} onOpen={onOpen} />
            ))}
          </div>
        </section>
      ))}
      {rows.length === 0 && <p className="muted ex-empty">這裡還沒有資料。</p>}
    </div>
  );
}

/** 書架的小卡：照片、名稱、等級；右下想去的愛心（自己擋掉，不開詳情） */
function ShelfCard({ place, surface, onOpen }: { place: Place; surface: HomeSurface; onOpen: (id: string) => void }) {
  return (
    <div
      className={`xs-card type-${place.type}`}
      role="button"
      tabIndex={0}
      aria-label={placeName(place)}
      data-testid="shelf-card"
      data-id={place.id}
      onClick={() => onOpen(place.id)}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget || (e.key !== 'Enter' && e.key !== ' ')) return;
        e.preventDefault();
        onOpen(place.id);
      }}
      {...hoverProps(surface, place.id)}
    >
      <div className="xs-photo">
        <Photo place={place} width={240} />
        <span className="pt-heart">
          <VoteHeart placeId={place.id} size="sm" />
        </span>
      </div>
      <div className="xs-name">
        <span className="xs-name-text">{placeName(place)}</span>
        <TierMark tier={place.tier} />
      </div>
    </div>
  );
}
