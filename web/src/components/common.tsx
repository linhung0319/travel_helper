// T15m 共用的小元件：對話框外框、地點標籤、成員名字、紀錄的時間。

import { useEffect, useRef, type ReactNode } from 'react';
import { appStore } from '../store.ts';
import { commands } from '../appCommands.ts';
import { useData, useShared } from '../hooks.ts';
import { memberName } from '../sharedStore.ts';
import { TYPE_ICONS } from '../lib/typeStyle.ts';

/** 對話框：手機從下面滑上來、電腦在中間。Esc、點背景關掉 */
export function Dialog({ title, onClose, children, footer, testId }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; testId?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    ref.current?.querySelector<HTMLElement>('textarea, input, select, button.primary')?.focus();
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);
  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div ref={ref} className="dialog" role="dialog" aria-modal="true" aria-label={title} data-testid={testId} onClick={(e) => e.stopPropagation()}>
        <header className="dialog-head">
          <h2>{title}</h2>
          <button type="button" className="icon-button" aria-label="關閉" onClick={onClose}>
            ✕
          </button>
        </header>
        <div className="dialog-body">{children}</div>
        {footer && <footer className="dialog-foot">{footer}</footer>}
      </div>
    </div>
  );
}

/** 可以點的地點標籤：地圖跳過去、點會閃，再點一下開詳情（interaction-design §4） */
export function PlaceChip({ id, onRemove }: { id: string; onRemove?: () => void }) {
  const p = useData((s) => s.byId.get(id));
  const name = p ? p.name.zh || p.name.ja : id;
  return (
    <span className="place-chip">
      <button
        type="button"
        className="place-chip-main"
        onClick={() => {
          if (!p) return;
          const s = appStore.getState();
          if (s.previewId === id) s.openDetail(id);
          else {
            commands.focus(id);
            s.openPreview(id);
          }
        }}
      >
        {p ? TYPE_ICONS[p.type] : '❓'} {name}
      </button>
      {onRemove && (
        <button type="button" className="place-chip-x" aria-label={`拿掉 ${name}`} onClick={onRemove}>
          ✕
        </button>
      )}
    </span>
  );
}

export function MemberName({ id }: { id: string | null | undefined }) {
  const members = useShared((s) => s.members);
  const me = useShared((s) => s.me?.id);
  return <span className="member">{id && id === me ? '我' : memberName(members, id)}</span>;
}

/** 紀錄的時間（建議、修改、快照）：月/日 時:分。這是「什麼時候寫的」，用瀏覽器的時間就好；行程的時間一律是日本時間字串 */
export function stamp(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
