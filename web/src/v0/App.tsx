import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MapView, type MapViewHandle } from './MapView';
import { AREA_COLORS, TYPE_COLORS, TYPE_LABELS, areas, findIssues, fixturePoints, realPoints, unionBbox } from './data';
import { POINT_TYPES, type Issue, type Point, type PointType } from './types';

const ALL_BBOX = unionBbox(areas.map((a) => a.bbox));
const FIXTURE_KEY = 'travel-helper:useFixtures';

function readStoredBool(key: string, fallback: boolean): boolean {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : v === '1';
  } catch {
    return fallback;
  }
}

function writeStoredBool(key: string, value: boolean) {
  try {
    localStorage.setItem(key, value ? '1' : '0');
  } catch {
    // 無痕模式等情況存不了，不影響使用
  }
}

const ISSUE_LABELS: Record<Issue['kind'], string> = {
  'bad-coords': '座標錯誤',
  'outside-region': '超出伊勢志摩',
  'outside-area': '不在區域 bbox 內',
  'duplicate-id': 'ID 重複',
  'no-sources': '沒有來源',
};

const URL_RE = /(https?:\/\/[^\s"]+)/g;

/** 把 JSON 文字裡的網址變成可以點的連結 */
function Linkified({ text }: { text: string }) {
  const parts = text.split(URL_RE);
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <a key={i} href={part} target="_blank" rel="noreferrer">
            {part}
          </a>
        ) : (
          part
        ),
      )}
    </>
  );
}

function areaName(id: string | null): string {
  if (!id) return '（沒有 area）';
  const a = areas.find((x) => x.id === id);
  return a ? (a.name.zh ?? a.name.ja) : `${id}（不在 areas.json）`;
}

function PointDetail({ point, issues }: { point: Point; issues: Issue[] }) {
  const c = point.coords;
  return (
    <div className="detail">
      <h3>
        <span className="dot" style={{ background: TYPE_COLORS[point.type] }} />
        {point.label}
        {point.fixture && <span className="badge">假資料</span>}
      </h3>
      <dl>
        <dt>ID</dt>
        <dd>
          <code>{point.id}</code>
        </dd>
        <dt>類別</dt>
        <dd>{TYPE_LABELS[point.type]}</dd>
        <dt>區域</dt>
        <dd>{areaName(point.area)}</dd>
        <dt>座標</dt>
        <dd>
          {c ? (
            <>
              <code>
                {c[0]}, {c[1]}
              </code>{' '}
              <a href={`https://www.google.com/maps?q=${c[1]},${c[0]}`} target="_blank" rel="noreferrer">
                Google 地圖
              </a>
            </>
          ) : (
            '（無）'
          )}
        </dd>
        <dt>檔案</dt>
        <dd>
          <code>{point.file}</code>
        </dd>
      </dl>
      {issues.length > 0 && (
        <ul className="issues-inline">
          {issues.map((iss, i) => (
            <li key={i}>⚠️ {iss.message}</li>
          ))}
        </ul>
      )}
      <h4>來源（{point.sources.length}）</h4>
      <ul className="sources">
        {point.sources.map((s, i) => (
          <li key={i}>
            <span className="muted">[{s.type}]</span>{' '}
            <a href={s.url} target="_blank" rel="noreferrer">
              {s.url}
            </a>
            <span className="muted">
              {' '}
              {s.retrieved}
              {s.note ? `：${s.note}` : ''}
            </span>
          </li>
        ))}
      </ul>
      <details open>
        <summary>原始 JSON</summary>
        <pre className="json">
          <Linkified text={JSON.stringify(point.raw, null, 2)} />
        </pre>
      </details>
    </div>
  );
}

export default function App() {
  const mapRef = useRef<MapViewHandle>(null);
  const panelRef = useRef<HTMLElement>(null);
  const [useFixtures, setUseFixtures] = useState(() => readStoredBool(FIXTURE_KEY, false));
  const [visibleTypes, setVisibleTypes] = useState<Record<PointType, boolean>>({
    station: true,
    spot: true,
    lodging: true,
    restaurant: true,
  });
  const [showBbox, setShowBbox] = useState(true);
  const [showLabels, setShowLabels] = useState(true);
  const [candidates, setCandidates] = useState<string[]>([]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(true);

  const points = useMemo(() => (useFixtures ? [...realPoints, ...fixturePoints] : realPoints), [useFixtures]);
  const byKey = useMemo(() => new Map(points.map((p) => [p.key, p])), [points]);
  const issues = useMemo(() => findIssues(points), [points]);
  const flaggedKeys = useMemo(() => new Set(issues.map((i) => i.pointKey)), [issues]);

  const counts = useMemo(() => {
    const byType = Object.fromEntries(POINT_TYPES.map((t) => [t, 0])) as Record<PointType, number>;
    // 區域 × 類別，用來看哪一區還缺資料
    const byArea = new Map<string, Record<PointType, number>>();
    for (const p of points) {
      byType[p.type]++;
      const k = p.area ?? '（無）';
      if (!byArea.has(k)) byArea.set(k, Object.fromEntries(POINT_TYPES.map((t) => [t, 0])) as Record<PointType, number>);
      byArea.get(k)![p.type]++;
    }
    return { byType, byArea };
  }, [points]);

  const selected = selectedKey ? byKey.get(selectedKey) ?? null : null;

  // 選取區塊在面板最上面；選了點就捲回頂端，手機上才看得到
  useEffect(() => {
    if (selectedKey || candidates.length > 0) panelRef.current?.scrollTo({ top: 0 });
  }, [selectedKey, candidates]);

  const onPick = useCallback((keys: string[]) => {
    setCandidates(keys);
    setSelectedKey(keys.length === 1 ? keys[0] : null);
    if (keys.length > 0) setPanelOpen(true);
  }, []);

  const selectPoint = (key: string) => {
    setSelectedKey(key);
    const p = byKey.get(key);
    if (p?.coords) mapRef.current?.flyTo(p.coords);
    setPanelOpen(true);
  };

  const toggleFixtures = (v: boolean) => {
    setUseFixtures(v);
    writeStoredBool(FIXTURE_KEY, v);
    setCandidates([]);
    setSelectedKey(null);
  };

  return (
    <div className={`app ${panelOpen ? 'panel-open' : 'panel-closed'}`}>
      <MapView
        ref={mapRef}
        points={points}
        areas={areas}
        visibleTypes={visibleTypes}
        showBbox={showBbox}
        showLabels={showLabels}
        initialBbox={ALL_BBOX}
        selectedKey={selectedKey}
        flaggedKeys={flaggedKeys}
        onPick={onPick}
      />
      <aside className="panel" ref={panelRef}>
        <button className="panel-toggle" onClick={() => setPanelOpen((o) => !o)}>
          {panelOpen ? '▼ 收起面板' : '▲ 打開面板'}
          {selected ? `（${selected.label}）` : ''}
        </button>
        <div className="panel-body">
          {(candidates.length > 1 || selected) && (
            <section>
              <h2>選取</h2>
              {candidates.length > 1 && (
                <>
                  <p className="muted">這裡有 {candidates.length} 個點重疊，選一個：</p>
                  <ul className="pick-list">
                    {candidates.map((k) => {
                      const p = byKey.get(k);
                      if (!p) return null;
                      return (
                        <li key={k}>
                          <button className={k === selectedKey ? 'active' : ''} onClick={() => setSelectedKey(k)}>
                            <span className="dot" style={{ background: TYPE_COLORS[p.type] }} />
                            {p.label} <code>{p.id}</code>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </>
              )}
              {selected && <PointDetail point={selected} issues={issues.filter((i) => i.pointKey === selected.key)} />}
              <button
                onClick={() => {
                  setCandidates([]);
                  setSelectedKey(null);
                }}
              >
                取消選取
              </button>
            </section>
          )}

          <section>
            <h2>圖層</h2>
            {POINT_TYPES.map((t) => (
              <label key={t} className="row">
                <input
                  type="checkbox"
                  checked={visibleTypes[t]}
                  onChange={(e) => setVisibleTypes((v) => ({ ...v, [t]: e.target.checked }))}
                />
                <span className="dot" style={{ background: TYPE_COLORS[t] }} />
                {TYPE_LABELS[t]}（{counts.byType[t]}）
              </label>
            ))}
            <label className="row">
              <input type="checkbox" checked={showBbox} onChange={(e) => setShowBbox(e.target.checked)} />
              區域 bbox 框線
            </label>
            <label className="row">
              <input type="checkbox" checked={showLabels} onChange={(e) => setShowLabels(e.target.checked)} />
              名稱標籤（放大後顯示）
            </label>
            <label className="row">
              <input type="checkbox" checked={useFixtures} onChange={(e) => toggleFixtures(e.target.checked)} />
              顯示假資料（web/src/dev-fixtures，{fixturePoints.length} 筆）
            </label>
          </section>

          <section>
            <h2>跳到區域</h2>
            <div className="buttons">
              <button onClick={() => mapRef.current?.fitBbox(ALL_BBOX)}>伊勢志摩全區</button>
              {areas.map((a) => (
                <button key={a.id} onClick={() => mapRef.current?.fitBbox(a.bbox)} style={{ borderColor: AREA_COLORS[a.id] }}>
                  {a.name.zh ?? a.name.ja}
                </button>
              ))}
            </div>
          </section>

          <section>
            <h2>檢查（{issues.length}）</h2>
            {issues.length === 0 ? (
              <p className="muted">沒有發現問題。</p>
            ) : (
              <ul className="issue-list">
                {issues.map((iss, i) => {
                  const p = byKey.get(iss.pointKey)!;
                  return (
                    <li key={i}>
                      <button onClick={() => selectPoint(p.key)}>
                        <strong>{ISSUE_LABELS[iss.kind]}</strong> {p.label} <code>{p.id}</code>
                      </button>
                      <div className="muted">{iss.message}</div>
                    </li>
                  );
                })}
              </ul>
            )}
            <p className="muted">紅框的點代表有問題。和 scripts/validate 一樣，bbox 只是大致範圍，不在框內只是提醒。</p>
          </section>

          <section>
            <h2>各區筆數</h2>
            <table className="counts">
              <thead>
                <tr>
                  <th>區域</th>
                  {POINT_TYPES.map((t) => (
                    <th key={t}>{TYPE_LABELS[t]}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...counts.byArea.entries()].map(([areaId, c]) => (
                  <tr key={areaId}>
                    <td>{areaName(areaId === '（無）' ? null : areaId)}</td>
                    {POINT_TYPES.map((t) => (
                      <td key={t} className={c[t] === 0 ? 'zero' : ''}>
                        {c[t]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>
      </aside>
    </div>
  );
}
