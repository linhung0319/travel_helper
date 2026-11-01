// 加地點的彈窗（T33 設計 §4）：網頁浮在地圖上，手機是大彈窗；流程同一個。
// 第一步（entry）：貼 Google Maps 連結或日本地址，或選「在地圖上指位置」。第二步（draft）：小地圖、表單，按「確定加入」才存。
// 找得到位置才到第二步；已經有這個點就顯示那個點，不給加。判斷沿用 lib/addPlace/suggest.ts（連結、地址、去重）。
// AI 加地點、地圖右鍵、手機按住地圖、詳情的「✎ 修改」直接到第二步。

import { useEffect, useRef, useState } from 'react';
import { addPlaceStore, useAddPlace } from '../../addPlaceStore.ts';
import { backend } from '../../backend/index.ts';
import { commands } from '../../appCommands.ts';
import { useData } from '../../hooks.ts';
import { appStore } from '../../store.ts';
import { mobileStore } from '../../mobile/mobileStore.ts';
import { classifyInput } from '../../lib/addPlace/classify.ts';
import { geocodeAddress } from '../../lib/addPlace/gsi.ts';
import { resolveSuggestion, type Suggestion } from '../../lib/addPlace/suggest.ts';
import type { Place } from '../../data/types.ts';
import { Icon } from '../../components/Icon.tsx';
import { AddPlaceForm } from './AddPlaceForm.tsx';
import { AddPlaceMap } from './AddPlaceMap.tsx';
import { Button } from './Button.tsx';
import { PlaceRow, useDayStatus } from './PlaceRow.tsx';
import type { FilterSurface } from './FilterSheet.tsx';

const close = () => addPlaceStore.getState().cancel();

function openPlace(p: Place, surface: FilterSurface) {
  close();
  if (surface === 'mobile') mobileStore.getState().openPlace(p.id, mobileStore.getState().tab);
  else {
    appStore.getState().openDetail(p.id, 'explore', undefined, 'map');
    commands.focus(p.id);
  }
}

/** 第一步：貼連結是一個明確的動作，貼了馬上查；地址要按「找位置」（打到一半就查，會跳到錯的地方） */
function EntryStep({ surface, onNear }: { surface: FilterSurface; onNear(p: Place | null): void }) {
  const initial = useAddPlace((s) => s.entry?.text ?? '');
  const places = useData((s) => s.places);
  const statusOf = useDayStatus();
  const [text, setText] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Suggestion | null>(null);
  const seq = useRef(0);

  const find = async (q: string) => {
    const kind = classifyInput(q);
    if (kind === 'empty') return;
    const mine = ++seq.current;
    setBusy(true);
    setResult(null);
    const s: Suggestion = await resolveSuggestion(q, { resolveShort: (u) => backend().resolveMapLink(u), geocode: (x) => geocodeAddress(x), places }).catch(() => ({ kind: 'none' }) as Suggestion);
    if (mine !== seq.current) return;
    setBusy(false);
    if (s.kind === 'candidate') {
      onNear(s.near);
      addPlaceStore.getState().start(s.via === 'google-link' ? { via: 'google-link', coords: s.coords, name: s.name, jaName: s.name || null, link: s.link } : { via: 'address', coords: s.coords, name: '' });
      return;
    }
    setResult(s);
  };
  // 從搜尋框帶進來的是連結：直接查
  useEffect(() => {
    if (classifyInput(initial) === 'link') void find(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const name = classifyInput(text) === 'text' ? text.trim() : '';
  const notAddress = result?.kind === 'none' || result?.kind === 'notFound';
  return (
    <form
      className="apd-entry"
      onSubmit={(e) => {
        e.preventDefault();
        void find(text);
      }}
    >
      <input
        type="text"
        value={text}
        placeholder="貼 Google Maps 連結或日本地址"
        aria-label="貼 Google Maps 連結或日本地址"
        autoFocus={surface === 'desktop'}
        autoComplete="off"
        onChange={(e) => {
          const v = e.target.value;
          setText(v);
          setResult(null);
          if (classifyInput(v) === 'link') void find(v);
        }}
        data-testid="add-entry-input"
      />
      <Button kind="primary" type="submit" disabled={!text.trim() || busy} data-testid="add-entry-find">
        {busy ? '找位置中…' : '找位置'}
      </Button>
      {result?.kind === 'error' && (
        <p className="apf-error" role="alert" data-testid="add-entry-error">
          {result.message}
        </p>
      )}
      {notAddress && (
        <p className="apf-error" role="alert" data-testid="add-entry-error">
          這看起來不是連結或日本地址。可以在地圖上指位置。
        </p>
      )}
      {result?.kind === 'same' && (
        <div data-testid="add-entry-existing">
          <p className="apd-note muted">已經有這個地點了</p>
          <PlaceRow place={result.place} status={statusOf(result.place.id)} onOpen={() => openPlace(result.place, surface)} testId="place-row" />
          <Button kind="secondary" onClick={() => openPlace(result.place, surface)} data-testid="add-entry-open">
            看這個地點
          </Button>
        </div>
      )}
      {!result && (
        <ol className="aps-howto muted">
          <li>在 Google Maps 找到那個地點</li>
          <li>按「分享」，複製連結</li>
          <li>回來貼在上面</li>
        </ol>
      )}
      <p className="apd-or muted">或是</p>
      <button type="button" className="apd-pinbtn" onClick={() => addPlaceStore.getState().start({ via: notAddress && name ? 'search' : 'map', name, coords: null })} data-testid="add-entry-pin">
        <b>在地圖上指位置</b>
        <span className="muted">沒有連結也沒有地址時用</span>
      </button>
    </form>
  );
}

export function AddPlaceDialog({ surface }: { surface: FilterSurface }) {
  const entry = useAddPlace((s) => !!s.entry);
  const draft = useAddPlace((s) => !!s.draft);
  const edit = useAddPlace((s) => s.draft?.mode === 'edit');
  const [near, setNear] = useState<Place | null>(null);
  const open = entry || draft;
  useEffect(() => {
    if (!open) setNear(null);
  }, [open]);
  // Esc 關掉（捕獲階段先攔下，不再往外關詳情）；輸入法選字中不算
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.isComposing) return;
      e.stopPropagation();
      close();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open]);
  if (!open) return null;
  const title = edit ? '修改地點' : '加一個地點';
  const box = (
    <section className={`apd apd-${surface} ${draft ? 'step-confirm' : 'step-entry'}`} role="dialog" aria-label={title} data-testid="add-dialog">
      <header className="apd-head">
        <h2>{title}</h2>
        <button type="button" className="apd-x" onClick={close} aria-label="關閉" data-testid="add-close">
          <Icon name="close" size={20} />
        </button>
      </header>
      {entry && <EntryStep surface={surface} onNear={setNear} />}
      {draft && (
        <div className="apd-confirm">
          <AddPlaceMap />
          <div className="apd-form">
            {near && (
              <p className="apd-note muted" data-testid="add-near">
                附近已經有：{near.name.zh || near.name.ja}
              </p>
            )}
            <AddPlaceForm surface={surface} />
          </div>
        </div>
      )}
    </section>
  );
  if (surface === 'desktop') return box;
  return (
    <div className="apd-backdrop" data-testid="add-backdrop">
      <button type="button" className="apd-peek" onClick={close} aria-label="關閉" tabIndex={-1} />
      {box}
    </div>
  );
}
