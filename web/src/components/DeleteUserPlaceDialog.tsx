// 刪除自己加的點的確認（T31）：網站自己的對話框，網頁、手機都由 App／MobileApp 底下的 <Dialogs /> 畫。
// 成功後兩邊的詳情都關掉：網頁 appStore.closeDetail()、手機 mobileStore.closePlace()（沒開著的那個是空操作）。

import { useState } from 'react';
import { appStore } from '../store.ts';
import { shared } from '../appShared.ts';
import { useData } from '../hooks.ts';
import { mobileStore } from '../mobile/mobileStore.ts';
import { closeDialog } from '../uiStore.ts';
import { Dialog } from './common.tsx';

export function DeleteUserPlaceDialog({ placeId }: { placeId: string }) {
  const place = useData((s) => s.byId.get(placeId));
  const [busy, setBusy] = useState(false);
  const name = place ? place.name.zh || place.name.ja : placeId;
  return (
    <Dialog
      title={`刪除「${name}」？`}
      onClose={closeDialog}
      testId="delete-user-place-dialog"
      footer={
        <>
          <button type="button" className="button" onClick={closeDialog}>
            取消
          </button>
          <button
            type="button"
            className="button primary"
            disabled={busy}
            data-testid="delete-user-place-confirm"
            onClick={async () => {
              setBusy(true);
              const r = await shared.deleteUserPlace(placeId);
              setBusy(false);
              if (!r.ok) return; // 失敗的提示 shared 已經跳了
              closeDialog();
              appStore.getState().closeDetail();
              mobileStore.getState().closePlace();
            }}
          >
            刪除
          </button>
        </>
      }
    >
      <p>大家都會看不到。已經排進行程的話，行程裡會顯示已刪除。</p>
    </Dialog>
  );
}
