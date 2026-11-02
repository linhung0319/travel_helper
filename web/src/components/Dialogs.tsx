// 對話框和提示（T15m）：一次只開一個對話框（uiStore），提示幾秒後自己消失。

import { useEffect } from 'react';
import { shared } from '../appShared.ts';
import { useShared, useUi } from '../hooks.ts';
import { RejectDialog } from './Wishlist.tsx';
import { AddToDayDialog, MoveCandidateDialog, MoveDialog, PlanningConfirmDialog, SnapshotsDialog } from './Planning.tsx';
import { HistoryDialog } from './EditHistory.tsx';
import { DeleteUserPlaceDialog } from './DeleteUserPlaceDialog.tsx';
import { HowToDialog } from './HowToDialog.tsx';
import { Icon } from './Icon.tsx';

export function Dialogs() {
  const d = useUi((s) => s.dialog);
  if (!d) return null;
  switch (d.kind) {
    case 'planning':
      return <PlanningConfirmDialog />;
    case 'snapshots':
      return <SnapshotsDialog />;
    case 'add':
      return <AddToDayDialog placeId={d.placeId} day={d.day} />;
    case 'move':
      return <MoveDialog itemId={d.itemId} />;
    case 'move-candidate':
      return <MoveCandidateDialog candidateId={d.candidateId} />;
    case 'reject':
      return <RejectDialog candidateId={d.candidateId} />;
    case 'history':
      return <HistoryDialog placeId={d.placeId} field={d.field} />;
    case 'delete-user-place':
      return <DeleteUserPlaceDialog placeId={d.placeId} />;
    case 'how-to':
      return <HowToDialog />;
  }
}

/** 只出現一次的操作提示（§17.4）：下方的深色橫條，按鈕是芥子黃；8 秒沒動作就收掉 */
function HintBar() {
  const hint = useShared((s) => s.hint);
  useEffect(() => {
    if (!hint) return;
    const t = window.setTimeout(() => {
      if (shared.store.getState().hint?.seq === hint.seq) shared.clearHint();
    }, 8000);
    return () => window.clearTimeout(t);
  }, [hint]);
  if (!hint) return null;
  return (
    <div className="toast toast-ok toast-hint" role="status" data-testid="hint" onClick={() => shared.clearHint()}>
      <Icon name="check" size={16} /> <span>{hint.text}</span>
      {hint.action && (
        <button
          type="button"
          className="toast-undo"
          data-testid="hint-action"
          onClick={(e) => {
            e.stopPropagation();
            const run = hint.action!.run;
            shared.clearHint();
            void run();
          }}
        >
          {hint.action.label}
        </button>
      )}
      <button type="button" className="toast-close" aria-label="關閉提示" data-testid="hint-close">
        <Icon name="close" size={16} />
      </button>
    </div>
  );
}

export function Toast() {
  return (
    <>
      <ToastLine />
      <HintBar />
    </>
  );
}

function ToastLine() {
  const toast = useShared((s) => s.toast);
  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => {
      if (shared.store.getState().toast?.seq === toast.seq) shared.clearToast();
    }, toast.kind === 'error' || toast.action ? 6000 : 3000);
    return () => window.clearTimeout(t);
  }, [toast]);
  if (!toast) return null;
  return (
    <div className={`toast toast-${toast.kind}`} role={toast.kind === 'error' ? 'alert' : 'status'} data-testid="toast" onClick={() => shared.clearToast()}>
      {toast.kind === 'error' ? <Icon name="warn" size={16} /> : <Icon name="check" size={16} />}{' '}
      {toast.text}
      {toast.action && (
        <button
          type="button"
          className="toast-undo"
          data-testid="toast-undo"
          onClick={(e) => {
            e.stopPropagation();
            const run = toast.action!.run;
            shared.clearToast();
            run();
          }}
        >
          {toast.action.label}
        </button>
      )}
    </div>
  );
}
