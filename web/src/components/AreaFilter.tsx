// 地區、小區域的標籤（探索、想去共用）：選了地區地圖跳過去；有小區域時下面多一排。

import { appStore } from '../store.ts';
import { commands } from '../appCommands.ts';
import { useApp, useData } from '../hooks.ts';
import { displayName } from '../data/normalize.ts';

export function AreaFilter() {
  const filter = useApp((s) => s.filter);
  const areas = useData((s) => s.areas);
  const area = filter.areas.length === 1 ? areas.find((a) => a.id === filter.areas[0]) : undefined;
  const pickArea = (id: string | null) => {
    appStore.getState().setFilter({ areas: id ? [id] : [], regions: [] });
    if (id) commands.focus({ area: id });
  };
  return (
    <>
      <div className="ex-areas" role="group" aria-label="地區">
        <button type="button" className={`pill ${filter.areas.length === 0 ? 'on' : ''}`} onClick={() => pickArea(null)}>
          全部地區
        </button>
        {areas.map((a) => (
          <button key={a.id} type="button" className={`pill ${area?.id === a.id ? 'on' : ''}`} onClick={() => pickArea(a.id)} data-area={a.id}>
            {displayName(a.name, a.id)}
          </button>
        ))}
      </div>
      {area?.regions?.length ? (
        <div className="ex-regions" role="group" aria-label="小區域">
          {area.regions.map((r) => (
            <button
              key={r.id}
              type="button"
              className={`pill small-pill ${filter.regions.includes(r.id) ? 'on' : ''}`}
              aria-pressed={filter.regions.includes(r.id)}
              onClick={() => {
                appStore.getState().toggleFilter('regions', r.id);
                commands.focus({ region: r.id });
              }}
            >
              {displayName(r.name, r.id)}
            </button>
          ))}
        </div>
      ) : null}
    </>
  );
}
