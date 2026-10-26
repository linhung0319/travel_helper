// T15m 共用的小元件：對話框外框、地點標籤、成員名字、頭像、紀錄的時間。

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { appStore } from '../store.ts';
import { commands } from '../appCommands.ts';
import { useData, useShared } from '../hooks.ts';
import { memberName } from '../sharedStore.ts';
import { TYPE_COLORS } from '../lib/typeStyle.ts';
import { Icon } from './Icon.tsx';

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
        {p && <i className="ui-type-dot" style={{ background: TYPE_COLORS[p.type] }} aria-hidden="true" />}
        {name}
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

/** 名字的第一個字（頭像用） */
export const initial = (name: string) => [...name][0] ?? '?';

/** 圓形頭像：有照片用照片，沒有就是名字第一個字（和 MeMenu 一樣）；自己是綠色 */
export function Avatar({ id }: { id: string }) {
  const members = useShared((s) => s.members);
  const me = useShared((s) => s.me?.id);
  const m = members.find((x) => x.id === id);
  const name = id === me ? '我' : memberName(members, id);
  return (
    <span className={`avatar ${id === me ? 'me' : ''}`} title={name}>
      {m?.pictureUrl ? <img src={m.pictureUrl} alt="" /> : initial(memberName(members, id))}
    </span>
  );
}

/**
 * 疊在一起的頭像（像 FB）：最多 max 個，其他寫「+N」。點了跳出名單；
 * 給了 dislikes 時名單分「想去誰」「不想去誰」兩行（頭像只畫 ids）。
 */
export function AvatarStack({ ids, max = 4, dislikes }: { ids: string[]; max?: number; dislikes?: string[] }) {
  const members = useShared((s) => s.members);
  const me = useShared((s) => s.me?.id);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);
  if (!ids.length && !dislikes?.length) return null;
  const names = (list: string[]) => list.map((id) => (id === me ? '我' : memberName(members, id))).join('、');
  const more = ids.length - max;
  return (
    <span className="avatar-stack" ref={ref}>
      <button
        type="button"
        className="avatar-stack-button"
        aria-expanded={open}
        aria-label={`${dislikes ? '想去 ' : ''}${names(ids)}`}
        onClick={(e) => {
          e.stopPropagation();
          setOpen(!open);
        }}
        data-testid="avatar-stack"
      >
        <span className="avatars">
          {ids.slice(0, max).map((id) => (
            <Avatar key={id} id={id} />
          ))}
        </span>
        {more > 0 && <span className="avatar-more small">+{more}</span>}
      </button>
      {open && (
        <NameList ids={ids} dislikes={dislikes} />
      )}
    </span>
  );
}

/** 名單（點頭像或 ▾ 跳出的）：沒給 dislikes 就只列 ids；給了分「❤️ 誰」「👎 誰」兩行 */
export function NameList({ ids, dislikes, className = '' }: { ids: string[]; dislikes?: string[]; className?: string }) {
  const members = useShared((s) => s.members);
  const me = useShared((s) => s.me?.id);
  const names = (list: string[]) => list.map((id) => (id === me ? '我' : memberName(members, id))).join('、');
  return (
    <span className={`avatar-list small ${className}`} role="dialog" aria-label="名單" data-testid="avatar-list" onClick={(e) => e.stopPropagation()}>
      {dislikes ? (
        <>
          {ids.length > 0 && (
            <span className="ic-text">
              <Icon name="heart" size={16} filled /> {names(ids)}
            </span>
          )}
          {dislikes.length > 0 && (
            <span className="ic-text">
              <Icon name="thumb-down" size={16} /> {names(dislikes)}
            </span>
          )}
        </>
      ) : (
        <span>{names(ids)}</span>
      )}
    </span>
  );
}

/** 紀錄的時間（建議、修改、快照）：月/日 時:分。這是「什麼時候寫的」，用瀏覽器的時間就好；行程的時間一律是日本時間字串 */
export function stamp(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
