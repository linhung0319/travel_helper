// 探索有篩選時按「概覽」離開篩選（T69，interaction-design §33）：概覽只有一層，所以篩選拿掉，下面跳出一條「已離開「一定要去 · 鳥羽」 復原」。
// 復原回到剛才的地區和篩選；10 秒後自己收掉，或按 ✕。網頁、手機共用（狀態在 exploreArea.ts 的 lensUndo）。

import { useEffect } from 'react';
import { Icon } from '../../components/Icon.tsx';

const LIFE_MS = 10_000;

export function UndoToast({ label, onUndo, onClose }: { label: string; onUndo(): void; onClose(): void }) {
  useEffect(() => {
    const t = setTimeout(onClose, LIFE_MS);
    return () => clearTimeout(t);
  }, [label, onClose]);
  return (
    <div className="ui-undo" role="status" data-testid="lens-undo">
      <span className="ui-undo-text">已離開「{label}」</span>
      <button type="button" className="ui-undo-btn" onClick={onUndo} data-testid="lens-undo-btn">
        復原
      </button>
      <button type="button" className="ui-undo-x" aria-label="關掉" onClick={onClose}>
        <Icon name="close" size={16} />
      </button>
    </div>
  );
}
