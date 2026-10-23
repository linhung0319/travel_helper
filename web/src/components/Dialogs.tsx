// 對話框和提示（T15m）：一次只開一個對話框（uiStore），提示幾秒後自己消失。

import { useEffect } from 'react';
import { shared } from '../appShared.ts';
import { useShared, useUi } from '../hooks.ts';
import { AdoptDialog, DeclineDialog, PendingDialog, SuggestDialog } from './Suggestions.tsx';
import { AddToDayDialog, MoveDialog, PlanningConfirmDialog, SnapshotsDialog } from './Planning.tsx';
import { HistoryDialog } from './EditHistory.tsx';
import { ReservationsDialog } from './Reservations.tsx';

export function Dialogs() {
  const d = useUi((s) => s.dialog);
  if (!d) return null;
  switch (d.kind) {
    case 'suggest':
      return <SuggestDialog key={d.editing?.id ?? 'new'} day={d.day} placeIds={d.placeIds} editing={d.editing} />;
    case 'planning':
      return <PlanningConfirmDialog />;
    case 'snapshots':
      return <SnapshotsDialog />;
    case 'pending':
      return <PendingDialog />;
    case 'reservations':
      return <ReservationsDialog />;
    case 'add':
      return <AddToDayDialog placeId={d.placeId} day={d.day} />;
    case 'move':
      return <MoveDialog itemId={d.itemId} />;
    case 'adopt':
      return <AdoptDialog suggestionId={d.suggestionId} />;
    case 'decline':
      return <DeclineDialog suggestionId={d.suggestionId} />;
    case 'history':
      return <HistoryDialog placeId={d.placeId} field={d.field} />;
  }
}

export function Toast() {
  const toast = useShared((s) => s.toast);
  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => {
      if (shared.store.getState().toast?.seq === toast.seq) shared.clearToast();
    }, toast.kind === 'error' ? 6000 : 3000);
    return () => window.clearTimeout(t);
  }, [toast]);
  if (!toast) return null;
  return (
    <div className={`toast toast-${toast.kind}`} role={toast.kind === 'error' ? 'alert' : 'status'} data-testid="toast" onClick={() => shared.clearToast()}>
      {toast.kind === 'error' ? '⚠️ ' : '✓ '}
      {toast.text}
    </div>
  );
}
