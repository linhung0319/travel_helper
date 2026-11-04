// 探索的概覽、選了一區之後的頂端和書架（T42，interaction-design §20）。手機、網頁共用；開詳情、換地區這些動作由呼叫的畫面給。
// 概覽（T52 改版，interaction-design §26）：一區一張卡（那區的代表照片、住幾晚、一句特色、二月注意第一則、四格書架的數字、一行子地區、代表的點），
// 代表的點是文字加類型圓章，點了開詳情；「看志摩 ›」進那一區。
// 選了一區（T50）：「2 月注意（N）」收合；下面幾排書架（lib/shelves.ts），每排 3 張小卡（右上角類型圓章）、「全部 ›」套那組條件。
// 一句特色只在概覽；子地區列（RegionChips）由呼叫的畫面放進篩選列（FilterBar 的 subRow），緊接在地區列下面。
// 樣式在 ui.css（.xo-*、.xa-*、.xs-*）。

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { appStore } from '../../store.ts';
import { useData } from '../../hooks.ts';
import { dataStore, ensureDetails, fullPlace } from '../../dataStore.ts';
import { displayName } from '../../data/normalize.ts';
import { shelfCounts, shelfFilter, shelfRows } from '../../lib/shelves.ts';
import { areaStayLine } from '../../lib/tripSkeleton.ts';
import { whenNearViewport } from '../../lib/nearViewport.ts';
import type { Filter } from '../../lib/filter.ts';
import type { Area, Photo as PhotoData, Place } from '../../data/types.ts';
import { Photo } from '../../components/Photo.tsx';
import { Chip } from './Chip.tsx';
import { ChipScroller } from './ChipScroller.tsx';
import { TierMark } from './TierMark.tsx';
import { TypeSeal } from './TypeLabel.tsx';

export type HomeSurface = 'desktop' | 'mobile';

const placeName = (p: Place) => p.name.zh || p.name.ja;

/** 網頁：滑鼠移上去指到地圖上的點 */
const hoverProps = (surface: HomeSurface, id: string) =>
  surface === 'desktop' ? { onMouseEnter: () => appStore.getState().hover(id), onMouseLeave: () => appStore.getState().hover(null) } : {};

/** 概覽的動作：開詳情、進那一區、進那一區那排書架的全部（filter 是 shelfFilter）、進那一區再選那個子地區 */
export interface OverviewActions {
  onOpen: (id: string) => void;
  onPickArea: (area: string) => void;
  onShelf: (area: string, filter: Filter) => void;
  onPickRegion: (area: string, region: string) => void;
}

/** 概覽：一區一張卡 */
export function ExploreOverview({ surface, ...actions }: { surface: HomeSurface } & OverviewActions) {
  const areas = useData((s) => s.areas);
  return (
    <div className={`xo xo-${surface}`} data-testid="explore-overview">
      {areas.map((a) => (
        <AreaCard key={a.id} area={a} surface={surface} {...actions} />
      ))}
    </div>
  );
}

/** 子地區一行放幾個，其他寫「+N」 */
const REGIONS_SHOWN = 5;

/** 照片右下的一行：作者 · 授權（資料裡的「Wikimedia: 」拿掉） */
const creditOf = (p: PhotoData | undefined) => (p ? [p.credit?.replace(/^Wikimedia:\s*/, ''), p.license].filter(Boolean).join(' · ') : '');

/**
 * 概覽的一張卡（T52）：上半是那區的代表照片（區名壓在左下、住幾晚在右上、作者和授權在右下），
 * 下面一句特色、二月注意第一則、四格書架的數字（點了進那區那排的全部；0 的灰掉）、一行子地區（前 5 個加「+N」），最後一列代表的點和「看志摩 ›」。
 */
function AreaCard({ area, surface, onOpen, onPickArea, onShelf, onPickRegion }: { area: Area; surface: HomeSurface } & OverviewActions) {
  const byId = useData((s) => s.byId);
  const places = useData((s) => s.places);
  const itinerary = useData((s) => s.itinerary);
  const reps = (area.intro?.highlights ?? []).map((id) => byId.get(id)).filter((p): p is Place => !!p);
  const name = displayName(area.name, area.id);
  const feb = area.intro?.february?.[0]?.text;
  const onPick = () => onPickArea(area.id);
  const base = useMemo(() => ({ areas: [area.id], regions: [] as string[] }), [area.id]);
  const counts = useMemo(() => shelfCounts(places, base), [places, base]);
  const stay = useMemo(() => (itinerary ? areaStayLine(itinerary, area.id, byId) : null), [itinerary, area.id, byId]);
  const photo = area.photos?.[0];
  const credit = creditOf(photo);
  const regions = area.regions ?? [];
  const more = regions.length - REGIONS_SHOWN;
  return (
    <article className="xo-card" data-testid="overview-card" data-area={area.id}>
      <div className="xo-cover">
        <button type="button" className="xo-photo" onClick={onPick} aria-label={`看${name}`} tabIndex={-1}>
          <AreaPhoto photo={photo} alt={name} />
        </button>
        <h3 className="xo-name">
          <button type="button" onClick={onPick} data-testid="overview-name">
            {name}
          </button>
        </h3>
        {stay && (
          <span className="xo-nights" data-testid="overview-nights">
            {stay}
          </span>
        )}
        {credit &&
          (photo?.page ? (
            <a className="xo-credit" href={photo.page} target="_blank" rel="noreferrer" data-testid="overview-credit">
              {credit}
            </a>
          ) : (
            <span className="xo-credit" data-testid="overview-credit">
              {credit}
            </span>
          ))}
      </div>
      <div className="xo-text">
        {area.intro?.summary && <p className="xo-summary">{area.intro.summary}</p>}
        {feb && (
          <p className="xo-feb" data-testid="overview-feb">
            2 月：{feb}
          </p>
        )}
        <div className="xo-shelves">
          {counts.map(({ shelf, total }) => (
            <button
              key={shelf.id}
              type="button"
              className="xo-shelf"
              disabled={total === 0}
              onClick={() => onShelf(area.id, shelfFilter(shelf, base))}
              data-testid="overview-shelf"
              data-shelf={shelf.id}
            >
              <span className="xo-shelf-name">{shelf.title}</span>
              <b className="xo-shelf-n">{total}</b>
            </button>
          ))}
        </div>
        {regions.length > 1 && (
          <p className="xo-regions" data-testid="overview-regions">
            {regions.slice(0, REGIONS_SHOWN).map((r) => (
              <button key={r.id} type="button" onClick={() => onPickRegion(area.id, r.id)} data-testid="overview-region" data-region={r.id}>
                {displayName(r.name, r.id)}
              </button>
            ))}
            {more > 0 && (
              <button type="button" className="xo-more" onClick={onPick} data-testid="overview-region-more">
                +{more}
              </button>
            )}
          </p>
        )}
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

/**
 * 地區的代表照片（T51 的 areas.json photos，已經是 width=960 的縮圖網址）：快進畫面才載（T32 的做法），
 * 載好之前、沒有照片、打不開時是淡底。
 */
function AreaPhoto({ photo, alt }: { photo: PhotoData | undefined; alt: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  const [state, setState] = useState<'loading' | 'ok' | 'failed'>('loading');
  useEffect(() => {
    if (near || !photo || !ref.current) return;
    return whenNearViewport(ref.current, () => setNear(true));
  }, [near, photo]);
  return (
    <div ref={ref} className={`xo-img xo-img-${photo ? state : 'failed'}`} data-testid="overview-photo">
      {photo && near && state !== 'failed' && (
        <img src={photo.url} alt={alt} referrerPolicy="no-referrer" decoding="async" onLoad={() => setState('ok')} onError={() => setState('failed')} />
      )}
    </div>
  );
}

/**
 * 選了一區的子地區列（T50 起放在篩選列裡、緊接在地區列下面，比地區列小一號；選到的是淡靛藍底）：「全部」加各子地區，一次選一個。
 * 只有一個子地區（或沒有）時不畫。
 */
export function RegionChips({ areaId, regionId, onPick }: { areaId: string; regionId: string | null; onPick: (region: string | null) => void }) {
  const area = useData((s) => s.areas.find((a) => a.id === areaId));
  if (!area || (area.regions?.length ?? 0) <= 1) return null;
  return (
    <ChipScroller className="m-chips fb-chips xa-regions" testId="region-chips" activeKey={regionId}>
      <Chip on={!regionId} onClick={() => onPick(null)} testId="region-all">
        全部
      </Chip>
      {area.regions!.map((r) => (
        <Chip key={r.id} on={regionId === r.id} onClick={() => onPick(r.id)} testId={`region-${r.id}`}>
          {displayName(r.name, r.id)}
        </Chip>
      ))}
    </ChipScroller>
  );
}

/** 選了一區：「2 月注意（N）」收合、書架（地區的一句特色只在概覽，T50；子地區列在篩選列裡） */
export function AreaHome({ areaId, regionId, surface, onOpen, onShelfAll }: { areaId: string; regionId: string | null; surface: HomeSurface; onOpen: (id: string) => void; onShelfAll: (filter: Filter) => void }) {
  const areas = useData((s) => s.areas);
  const places = useData((s) => s.places);
  // 「住在這裡」可住 15 人在詳情層：讀這區的住宿（一區幾十間），讀到了重排
  const details = useData((s) => s.details);
  const area = areas.find((a) => a.id === areaId);
  const region = area?.regions?.find((r) => r.id === regionId);
  const base = useMemo(() => ({ areas: [areaId], regions: regionId ? [regionId] : [] }), [areaId, regionId]);
  useEffect(() => {
    const ids = places.filter((p) => p.type === 'lodging' && p.area === areaId && p.origin !== 'user').map((p) => p.id);
    if (ids.length) void ensureDetails(ids).catch(() => {});
  }, [places, areaId]);
  const rows = useMemo(() => {
    const s = dataStore.getState();
    return shelfRows(places, base, undefined, (id) => fullPlace(s, id));
  }, [places, base, details]); // eslint-disable-line react-hooks/exhaustive-deps
  const [febOpen, setFebOpen] = useState(false);
  if (!area) return null;
  // 二月注意：選了子地區只看那個子地區的一句
  const feb = region ? (region.intro?.febNote ? [region.intro.febNote] : []) : (area.intro?.february ?? []).map((f) => f.text);
  return (
    <div className={`xa xa-${surface}`} data-testid="area-home" data-area={areaId}>
      {feb.length > 0 && (
        <div className="xa-head">
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
        </div>
      )}
      {rows.map(({ shelf, items, total }) => (
        <section key={shelf.id} className="xs" data-testid="shelf" data-shelf={shelf.id}>
          <header className="xs-head">
            <h3 className="xs-title">
              {shelf.title}
              <span className="xs-note" data-testid="shelf-note">
                {shelf.note}
              </span>
            </h3>
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

/** 書架的小卡：照片、名稱、等級；右上角類型圓章（T50 拿掉愛心，愛心留在照片牆、清單、詳情）。想去的書架（T53）在名稱下面多一行 caption（「2/7 候選」） */
export function ShelfCard({ place, surface, onOpen, caption }: { place: Place; surface: HomeSurface; onOpen: (id: string) => void; caption?: ReactNode }) {
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
        <span className="xs-seal" data-testid="shelf-seal">
          <TypeSeal type={place.type} size="lg" label />
        </span>
      </div>
      <div className="xs-name">
        <span className="xs-name-text">{placeName(place)}</span>
        <TierMark tier={place.tier} />
      </div>
      {caption && (
        <div className="xs-caption" data-testid="shelf-caption">
          {caption}
        </div>
      )}
    </div>
  );
}
