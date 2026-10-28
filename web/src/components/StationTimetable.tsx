import { useEffect, useState } from 'react';
import { appStore } from '../store.ts';
import { useApp, useData } from '../hooks.ts';
import { dataSource } from '../data/index.ts';
import { departuresAround, googleTransitUrl, jorudanUrl, terminusName } from '../lib/timetable.ts';
import { JP_HOLIDAYS, timetableDayType, TRIP_START } from '../lib/trip.ts';
import { urbanLinesAt } from '../lib/legView.ts';
import { busDayType, type UrbanRoute } from '@travel-helper/engine';
import { stopsOn } from '../lib/itinerary.ts';
import type { Place, StationTimetable } from '../data/types.ts';
import { DayGrid12 } from '../shared/ui/DayGrid12.tsx';

export const DEFAULT_STATION_TIME = '09:00';

/** 車站面板：哪一天（12 天的日期格）、指定時間前後的班次（上下行）、外部查詢連結（PLAN T11） */
export function StationTimetablePanel({ place }: { place: Place }) {
  const day = useApp((s) => s.day);
  const stationTime = useApp((s) => s.stationTime);
  const days = useData((s) => s.days);
  const stationNames = useData((s) => s.stationNames);
  const [tt, setTt] = useState<StationTimetable | null | 'loading'>('loading');
  // 行程裡排到這一站的時間（例如「09:30 鳥羽站」）優先
  const planned = days.get(place.id)?.find((d) => day === 'all' || d.date === day);
  const [date, setDate] = useState(day !== 'all' ? day : (planned?.date ?? TRIP_START));
  useEffect(() => {
    if (day !== 'all') setDate(day);
  }, [day]);

  useEffect(() => {
    let alive = true;
    setTt('loading');
    dataSource.loadTimetable(place.id).then(
      (t) => alive && setTt(t),
      () => alive && setTt(null),
    );
    return () => {
      alive = false;
    };
  }, [place.id]);

  // 班距型路線（大阪的地鐵、JR、南海）：有停這一站的每條線一行，不列班次（spec §8.11）
  const [urban, setUrban] = useState<UrbanRoute[]>([]);
  useEffect(() => {
    let alive = true;
    dataSource.loadEngineTimetables().then(
      (t) => alive && setUrban(t.urban),
      () => alive && setUrban([]),
    );
    return () => {
      alive = false;
    };
  }, []);
  const urbanLines = urbanLinesAt(place.id, urban, busDayType(date, [...JP_HOLIDAYS]));
  const itinerary = useData((s) => s.itinerary);
  const plannedTime = stopsOn(itinerary, date).find((s) => s.place === place.id)?.time ?? null;
  const time = stationTime ?? plannedTime ?? DEFAULT_STATION_TIME;
  const dayType = timetableDayType(date);

  return (
    <section className="detail-section station" data-testid="station-panel">
      <h3>時刻表</h3>
      {/* 日期用 12 天的日期格（和「移到第幾天」同一個元件，不用原生下拉，設計 §2.3） */}
      <div className="station-days">
        <DayGrid12 mode="single" picked={[date]} onChange={([d]) => d && setDate(d)} testId={(d) => `station-day-${d}`} />
      </div>
      <div className="station-controls">
        <label>
          時間
          <input
            type="time"
            value={time}
            step={60}
            onChange={(e) => appStore.getState().setStationTime(e.target.value || null)}
            data-testid="station-time"
          />
        </label>
        <span className="muted small">{dayType === 'holiday' ? '土休日' : '平日'}班次</span>
      </div>
      {tt === 'loading' && <p className="muted">載入中…</p>}
      {urbanLines.length > 0 && (
        <ul className="urban-lines" data-testid="urban-lines">
          {urbanLines.map((l) => (
            <li key={l.line} data-testid="urban-line">
              <strong>{l.line}</strong>
              <span className="muted small">
                {l.headwayMin != null ? `約 ${l.headwayMin} 分一班` : '班距沒查到'}・首班 {l.first ?? '沒查到'}／末班 {l.last ?? '沒查到'}
              </span>
            </li>
          ))}
        </ul>
      )}
      {tt === null && urbanLines.length === 0 && <p className="muted">這一站沒有時刻表資料，請用下面的連結查。</p>}
      {tt && tt !== 'loading' && (
        <>
          <div className="directions">
            {departuresAround(tt, dayType, time).map((d) => (
              <div key={d.direction} className="direction">
                <h4>{d.label}</h4>
                {d.before.length + d.after.length === 0 ? (
                  <p className="muted small">沒有班次</p>
                ) : (
                  <table className="trains">
                    <tbody>
                      {d.before.map((t, i) => (
                        <tr key={`b${i}`} className="past">
                          <td className="dep">{t.dep}</td>
                          <td>{t.type}</td>
                          <td>{terminusName(t.to, stationNames)}</td>
                        </tr>
                      ))}
                      <tr className="now-line" aria-hidden>
                        <td colSpan={3}>{time}</td>
                      </tr>
                      {d.after.map((t, i) => (
                        <tr key={`a${i}`}>
                          <td className="dep">{t.dep}</td>
                          <td>
                            {t.type}
                            {t.note && <span className="muted small">（{t.note}）</span>}
                          </td>
                          <td>{terminusName(t.to, stationNames)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            ))}
          </div>
          <p className="muted small">
            時刻表{tt.validFrom ? ` ${tt.validFrom} 起` : ''}（{tt.retrieved} 取得，
            <a href={tt.source} target="_blank" rel="noreferrer">
              來源
            </a>
            ）。實際班次出發前用 Google Maps 確認。
          </p>
        </>
      )}
      <ul className="links">
        <li>
          <a href={googleTransitUrl(place.coords)} target="_blank" rel="noreferrer">
            Google Maps 路線
          </a>
        </li>
        <li>
          <a href={jorudanUrl(place.name.ja)} target="_blank" rel="noreferrer">
            ジョルダン
          </a>
        </li>
      </ul>
    </section>
  );
}
