// 建議（interaction-design §6）：每天可以有好幾則，另有「整趟」一格。誰都能寫；只有寫的人能改、能刪；
// 規劃模式下的人標狀態（已採用／不採用＋一句話）。

import { useState } from 'react';
import { addItem } from '@travel-helper/engine';
import type { Itinerary } from '@travel-helper/engine/types';
import { appStore } from '../store.ts';
import { shared } from '../appShared.ts';
import { addProposer } from '../sharedStore.ts';
import { useApp, useData, useShared } from '../hooks.ts';
import { closeDialog, openDialog } from '../uiStore.ts';
import { dayLabel, shortDayLabel, tripDates } from '../lib/trip.ts';
import { findItemRef, itemsWithPlace } from '../lib/planView.ts';
import type { Suggestion } from '../backend/types.ts';
import { Dialog, MemberName, PlaceChip, stamp } from './common.tsx';

const DATES = tripDates();

export const dayName = (day: string) => (day === 'trip' ? '整趟' : dayLabel(day));

function StatusBadge({ s }: { s: Suggestion }) {
  if (s.status === 'pending') return <span className="badge status-pending">待處理</span>;
  if (s.status === 'adopted') return <span className="badge badge-good">已採用</span>;
  return <span className="badge status-declined">不採用</span>;
}

export function SuggestionCard({ s, showDay = false }: { s: Suggestion; showDay?: boolean }) {
  const me = useShared((x) => x.me?.id);
  const planning = useApp((x) => x.planning);
  const itinerary = useData((x) => x.itinerary);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const mine = s.author === me;
  const adoptedDays = [...new Set((s.adoptedItemIds ?? []).flatMap((id) => findItemRef(itinerary, id)?.date ?? []))];
  return (
    <article className={`suggestion status-${s.status}`} data-testid="suggestion" data-id={s.id} data-author={s.author}>
      <header className="suggestion-head">
        <StatusBadge s={s} />
        {showDay && <span className="suggestion-day">{dayName(s.day)}</span>}
        <span className="muted small">
          <MemberName id={s.author} />・{stamp(s.createdAt)}
          {s.updatedAt !== s.createdAt && s.status === 'pending' ? '（改過）' : ''}
        </span>
      </header>
      <p className="suggestion-text">{s.text}</p>
      {s.placeIds.length > 0 && (
        <div className="chips">
          {s.placeIds.map((id) => (
            <PlaceChip key={id} id={id} />
          ))}
        </div>
      )}
      {s.status !== 'pending' && (
        <p className="suggestion-status small">
          <MemberName id={s.statusBy} /> 標成{s.status === 'adopted' ? '已採用' : '不採用'}
          {adoptedDays.length > 0 && `：排在 ${adoptedDays.map(shortDayLabel).join('、')}`}
          {s.statusNote && `：「${s.statusNote}」`}
        </p>
      )}
      <div className="suggestion-actions">
        {mine && !confirmDelete && (
          <>
            <button type="button" className="text-button" onClick={() => openDialog({ kind: 'suggest', editing: s })}>
              ✏️ 改
            </button>
            <button type="button" className="text-button" onClick={() => setConfirmDelete(true)}>
              🗑 刪除
            </button>
          </>
        )}
        {mine && confirmDelete && (
          <>
            <span className="small">確定刪除這則建議？</span>
            <button type="button" className="text-button danger" onClick={() => void shared.deleteSuggestion(s.id)}>
              刪除
            </button>
            <button type="button" className="text-button" onClick={() => setConfirmDelete(false)}>
              取消
            </button>
          </>
        )}
        {planning && s.status === 'pending' && (
          <>
            <button type="button" className="text-button good" onClick={() => openDialog({ kind: 'adopt', suggestionId: s.id })}>
              ✅ 採用
            </button>
            <button type="button" className="text-button" onClick={() => openDialog({ kind: 'decline', suggestionId: s.id })}>
              🙅 不採用
            </button>
          </>
        )}
        {planning && s.status !== 'pending' && (
          <button type="button" className="text-button" onClick={() => void shared.setSuggestionStatus(s.id, 'pending')}>
            ↩︎ 改回待處理
          </button>
        )}
      </div>
    </article>
  );
}

/** 這一天的建議（day 是日期或 'trip'）；待處理的在前面 */
export function SuggestionList({ day, empty }: { day: string; empty?: string }) {
  const suggestions = useShared((s) => s.suggestions);
  const list = suggestions
    .filter((s) => s.day === day)
    .sort((a, b) => Number(b.status === 'pending') - Number(a.status === 'pending') || a.createdAt.localeCompare(b.createdAt));
  if (!list.length) return <p className="muted small">{empty ?? '還沒有建議。'}</p>;
  return (
    <div className="suggestion-list">
      {list.map((s) => (
        <SuggestionCard key={s.id} s={s} />
      ))}
    </div>
  );
}

/** 寫建議／改自己的建議 */
export function SuggestDialog({ day: initialDay, placeIds: initialPlaces, editing }: { day?: string; placeIds?: string[]; editing?: Suggestion }) {
  const selection = useApp((s) => s.selection);
  const selectedDay = useApp((s) => s.day);
  const [day, setDay] = useState(editing?.day ?? initialDay ?? (selectedDay === 'all' ? 'trip' : selectedDay));
  const [placeIds, setPlaceIds] = useState<string[]>(editing?.placeIds ?? initialPlaces ?? []);
  const [text, setText] = useState(editing?.text ?? '');
  const [busy, setBusy] = useState(false);
  const extra = selection.filter((id) => !placeIds.includes(id));
  const submit = async () => {
    setBusy(true);
    const r = editing ? await shared.updateSuggestion(editing.id, { day, text, placeIds }) : await shared.createSuggestion({ day, text, placeIds });
    setBusy(false);
    if (r.ok) closeDialog();
  };
  return (
    <Dialog
      title={editing ? '改建議' : '寫建議'}
      onClose={closeDialog}
      testId="suggest-dialog"
      footer={
        <>
          <button type="button" className="button" onClick={closeDialog}>
            取消
          </button>
          <button type="button" className="button primary" disabled={!text.trim() || busy} onClick={() => void submit()} data-testid="suggest-submit">
            {busy ? '送出中…' : editing ? '儲存' : '送出'}
          </button>
        </>
      }
    >
      <label className="field">
        <span className="field-label">哪一天</span>
        <select value={day} onChange={(e) => setDay(e.target.value)} data-testid="suggest-day">
          <option value="trip">整趟（哪天都可以）</option>
          {DATES.map((d) => (
            <option key={d} value={d}>
              {dayLabel(d)}
            </option>
          ))}
        </select>
      </label>
      <div className="field">
        <span className="field-label">地點（可以不選）</span>
        <div className="chips">
          {placeIds.map((id) => (
            <PlaceChip key={id} id={id} onRemove={() => setPlaceIds(placeIds.filter((x) => x !== id))} />
          ))}
          {extra.length > 0 && (
            <button type="button" className="text-button" onClick={() => setPlaceIds([...placeIds, ...extra])}>
              ＋ 加入帶進聊天的 {extra.length} 個點
            </button>
          )}
          {placeIds.length === 0 && extra.length === 0 && <span className="muted small">在地點的詳情按「寫建議」，就會帶進來。</span>}
        </div>
      </div>
      <label className="field">
        <span className="field-label">想說的話</span>
        <textarea
          rows={4}
          value={text}
          maxLength={4000}
          placeholder="例如：想早上去，人比較少。媽媽膝蓋不好，希望不要爬階梯。"
          onChange={(e) => setText(e.target.value)}
          data-testid="suggest-text"
        />
      </label>
      <p className="muted small">大家都看得到；只有你自己能改、能刪。</p>
    </Dialog>
  );
}

/**
 * 採用（規劃模式）：建議裡的點已經在行程裡就勾那個項目，還沒排的可以順便排進去。
 * 一次存檔（先存快照），再把建議標成已採用；行程項目記下誰提的。
 */
export function AdoptDialog({ suggestionId }: { suggestionId: number }) {
  const s = useShared((x) => x.suggestions.find((y) => y.id === suggestionId));
  const itinerary = useData((x) => x.itinerary);
  const selectedDay = useApp((x) => x.day);
  const fallbackDay = s && s.day !== 'trip' ? s.day : selectedDay !== 'all' ? selectedDay : DATES[0];
  const existing = (s?.placeIds ?? []).flatMap((id) => itemsWithPlace(itinerary, id).map((r) => ({ placeId: id, ref: r })));
  const missing = (s?.placeIds ?? []).filter((id) => !existing.some((e) => e.placeId === id));
  const [checked, setChecked] = useState<Set<string>>(() => new Set(existing.map((e) => e.ref.item.id)));
  const [addDay, setAddDay] = useState(fallbackDay);
  const [addIds, setAddIds] = useState<Set<string>>(() => new Set(missing));
  const [busy, setBusy] = useState(false);
  if (!s) return null;
  const toggle = (set: Set<string>, id: string) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  };
  const submit = async () => {
    setBusy(true);
    let ids = [...checked];
    const toAdd = missing.filter((id) => addIds.has(id));
    if (ids.length || toAdd.length) {
      const r = await shared.changeItinerary((it: Itinerary) => {
        let next = it;
        for (const placeId of toAdd) {
          const added = addItem(next, addDay, { type: 'visit', options: [{ place: placeId, stayMinutes: null }], addedBy: shared.store.getState().me?.id ?? null });
          next = added.itinerary;
          ids = [...ids, added.itemId];
        }
        return addProposer(next, ids, s.author);
      }, `採用 ${shared.store.getState().members.find((m) => m.id === s.author)?.displayName ?? ''}的建議 #${s.id}`);
      if (!r.ok) {
        setBusy(false);
        return;
      }
    }
    const r = await shared.setSuggestionStatus(s.id, 'adopted', { adoptedItemIds: ids });
    setBusy(false);
    if (r.ok) {
      if (toAdd.length) appStore.getState().selectDay(addDay);
      closeDialog();
    }
  };
  return (
    <Dialog
      title="採用這則建議"
      onClose={closeDialog}
      testId="adopt-dialog"
      footer={
        <>
          <button type="button" className="button" onClick={closeDialog}>
            取消
          </button>
          <button type="button" className="button primary" disabled={busy} onClick={() => void submit()} data-testid="adopt-submit">
            {busy ? '儲存中…' : '採用'}
          </button>
        </>
      }
    >
      <SuggestionCard s={s} showDay />
      {existing.length > 0 && (
        <div className="field">
          <span className="field-label">已經在行程裡（連到這則建議）</span>
          {existing.map(({ placeId, ref }) => (
            <label key={ref.item.id} className="check">
              <input type="checkbox" checked={checked.has(ref.item.id)} onChange={() => setChecked(toggle(checked, ref.item.id))} />
              <PlaceChip id={placeId} /> {shortDayLabel(ref.date)}
              {ref.split ? `・${ref.split.groupName}` : ''}
            </label>
          ))}
        </div>
      )}
      {missing.length > 0 && (
        <div className="field">
          <span className="field-label">還沒排的，順便排進</span>
          <select value={addDay} onChange={(e) => setAddDay(e.target.value)} data-testid="adopt-day">
            {DATES.map((d) => (
              <option key={d} value={d}>
                {dayLabel(d)}
              </option>
            ))}
          </select>
          {missing.map((id) => (
            <label key={id} className="check">
              <input type="checkbox" checked={addIds.has(id)} onChange={() => setAddIds(toggle(addIds, id))} />
              <PlaceChip id={id} />
            </label>
          ))}
          <p className="muted small">排在那天的最後；順序可以再用「上移／下移」調。</p>
        </div>
      )}
      {s.placeIds.length === 0 && <p className="muted small">這則建議沒有指定地點，只會標成已採用。</p>}
    </Dialog>
  );
}

export function DeclineDialog({ suggestionId }: { suggestionId: number }) {
  const s = useShared((x) => x.suggestions.find((y) => y.id === suggestionId));
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  if (!s) return null;
  const submit = async () => {
    setBusy(true);
    const r = await shared.setSuggestionStatus(s.id, 'declined', { note: note.trim() || null });
    setBusy(false);
    if (r.ok) closeDialog();
  };
  return (
    <Dialog
      title="不採用"
      onClose={closeDialog}
      testId="decline-dialog"
      footer={
        <>
          <button type="button" className="button" onClick={closeDialog}>
            取消
          </button>
          <button type="button" className="button primary" disabled={busy} onClick={() => void submit()}>
            標成不採用
          </button>
        </>
      }
    >
      <SuggestionCard s={s} showDay />
      <label className="field">
        <span className="field-label">說一句話給 <MemberName id={s.author} />（可以不寫）</span>
        <input type="text" maxLength={200} value={note} placeholder="例如：這天排不下，改到第 4 天好嗎" onChange={(e) => setNote(e.target.value)} />
      </label>
    </Dialog>
  );
}

/** 待處理的建議（規劃列上的數字點開） */
export function PendingDialog() {
  const suggestions = useShared((s) => s.suggestions);
  const pending = suggestions.filter((s) => s.status === 'pending').sort((a, b) => a.day.localeCompare(b.day) || a.createdAt.localeCompare(b.createdAt));
  return (
    <Dialog title={`待處理的建議（${pending.length}）`} onClose={closeDialog} testId="pending-dialog">
      {pending.length === 0 && <p className="muted">都處理完了 🎉</p>}
      <div className="suggestion-list">
        {pending.map((s) => (
          <SuggestionCard key={s.id} s={s} showDay />
        ))}
      </div>
    </Dialog>
  );
}
