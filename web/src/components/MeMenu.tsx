// 帳號：之後是 LINE 的名字和大頭照（T25）。
// - MeMenu：手機「我」分頁的帳號列；dev server 下點了打開開發用選單（T15m 的假登入）。
// - AccountMenu（第七輪）：網頁右欄右上的頭像選單，裝使用者名稱、討論、預約、下載行程，dev server 下多一段「切換使用者（開發用）」。
// 開發用的內容（切換使用者、重設假資料、假裝別人改了行程、編輯的閒置時間）兩邊共用 DevTools。

import { useEffect, useRef, useState } from 'react';
import { shared } from '../appShared.ts';
import { mockBackend } from '../backend/index.ts';
import { dayTarget, TRIP_TARGET } from '../backend/types.ts';
import { appStore } from '../store.ts';
import { useApp, useData, usePlan, useShared, useUi } from '../hooks.ts';
import { noteRows } from '../lib/reservations.ts';
import { exportJson } from '../shared/exportJson.ts';
import { useCommentCount } from '../shared/placeLists.ts';
import { openMapPanel } from '../uiStore.ts';
import { setIdleMinutes } from './Planning.tsx';
import { initial } from './common.tsx';
import { Icon } from './Icon.tsx';

/** 開發用：切換使用者、假裝別人改了行程、重設假資料、編輯閒置時間；done 是做完後要收起選單 */
function DevTools({ done }: { done: () => void }) {
  const me = useShared((s) => s.me);
  const members = useShared((s) => s.members);
  const idle = useUi((s) => s.idleMinutes);
  const mock = mockBackend();
  if (!me || !mock) return null;
  const switchTo = async (id: string) => {
    done(); // 先收起選單（reloadMe 要等一下，不然馬上再點頭像會變成「關」）
    mock.setMe(id);
    await shared.reloadMe();
  };
  const reset = async (kind: 'full' | 'flights-only') => {
    // 直接用 import.meta.env.DEV 判斷，build 時整段拿掉，種子資料不會出現在 dist/
    if (!import.meta.env.DEV) return;
    const { devSeed } = await import('../dev-fixtures/seed.ts');
    mock.reset(devSeed(kind));
    appStore.getState().setPlanning(false);
    await shared.load();
    done();
  };
  return (
    <>
      <p className="muted small">切換使用者（開發用）</p>
      {members.map((m) => (
        <button key={m.id} type="button" role="menuitemradio" aria-checked={m.id === me.id} className={m.id === me.id ? 'on' : ''} onClick={() => void switchTo(m.id)} data-member={m.id}>
          <span className="avatar">{initial(m.displayName)}</span> {m.displayName}
        </button>
      ))}
      <hr />
      <button
        type="button"
        onClick={() => {
          mock.simulateOtherEdit();
          done();
        }}
        data-testid="dev-other-edit"
      >
        <Icon name="users" size={16} /> 假裝別人改了行程（下次存檔會「別人改過了」）
      </button>
      <button type="button" onClick={() => void reset('full')}>
        <Icon name="undo" size={16} /> 重設假資料
      </button>
      <button type="button" onClick={() => void reset('flights-only')}>
        <Icon name="plane" size={16} /> 重設成只有航班的行程
      </button>
      <label className="small">
        編輯閒置
        <select value={idle} onChange={(e) => setIdleMinutes(Number(e.target.value))}>
          <option value={10}>10 分鐘</option>
          <option value={1}>1 分鐘（測試用）</option>
        </select>
        後結束編輯
      </label>
    </>
  );
}

/** 手機「我」分頁的帳號列 */
export function MeMenu() {
  const me = useShared((s) => s.me);
  const [open, setOpen] = useState(false);
  const mock = mockBackend();
  if (!me) return null;
  return (
    <span className="me-menu">
      <button type="button" className="me-button" aria-expanded={open} onClick={() => setOpen(!open)} title={mock ? '（開發用）切換使用者' : me.displayName} data-testid="me-button">
        {me.pictureUrl ? <img src={me.pictureUrl} alt="" /> : <span className="avatar">{initial(me.displayName)}</span>}
        <span className="me-name">{me.displayName}</span>
      </button>
      {import.meta.env.DEV && open && mock && (
        <div className="dev-menu" role="menu" data-testid="dev-menu">
          <p className="dev-title">開發用（正式版是 LINE 登入）</p>
          <DevTools done={() => setOpen(false)} />
        </div>
      )}
    </span>
  );
}

/**
 * 網頁右欄右上的頭像選單：使用者名稱、討論（整趟・這天）、預約（N 未訂）、下載行程，dev 下多一段切換使用者。
 * 數字照目前選的那天（選「整趟」是整趟），和打開的視窗範圍一致。Esc、點外面收起（Esc 只收選單，不再往外關詳情）。
 */
export function AccountMenu() {
  const me = useShared((s) => s.me);
  const day = useApp((s) => s.day);
  const itinerary = useData((s) => s.itinerary);
  const byId = useData((s) => s.byId);
  const plan = usePlan((s) => s.plan);
  const reservations = useShared((s) => s.reservations);
  const comments = useCommentCount(day === 'all' ? TRIP_TARGET : dayTarget(day));
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const mock = mockBackend();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation(); // App 的 Esc（關詳情）在 window 冒泡階段，這裡先攔下
      setOpen(false);
    };
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('pointerdown', onDown, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('pointerdown', onDown, true);
    };
  }, [open]);

  if (!me) return null;
  const pending = noteRows(itinerary, plan, byId, reservations).filter((r) => r.status === 'pending' && (day === 'all' || r.date === day)).length;
  const go = (fn: () => void) => () => {
    setOpen(false);
    fn();
  };
  return (
    <span className="me-menu account-menu" ref={ref}>
      <button type="button" className="account-button" aria-haspopup="menu" aria-expanded={open} aria-label={`${me.displayName}的選單`} title={me.displayName} onClick={() => setOpen(!open)} data-testid="account-menu">
        {me.pictureUrl ? <img src={me.pictureUrl} alt="" /> : <span className="avatar">{initial(me.displayName)}</span>}
        <Icon name="chevron" size={16} />
      </button>
      {open && (
        <div className="dev-menu account-popover" role="menu" data-testid="account-popover">
          <p className="account-name">{me.displayName}</p>
          <button type="button" role="menuitem" onClick={go(() => openMapPanel('comments'))} data-testid="account-comments">
            <Icon name="chat" size={20} /> 討論 <span className="account-sub">整趟 · 這天</span>
            {comments > 0 && <span className="account-n">{comments}</span>}
          </button>
          <button type="button" role="menuitem" onClick={go(() => openMapPanel('reservations'))} data-testid="account-reservations">
            <Icon name="clipboard" size={20} /> 預約
            {pending > 0 && <span className="account-n warn">{pending} 未訂</span>}
          </button>
          <button type="button" role="menuitem" disabled={!itinerary} onClick={go(exportJson)} data-testid="account-export">
            <Icon name="download" size={20} /> 下載行程
          </button>
          {import.meta.env.DEV && mock && (
            <>
              <hr />
              <DevTools done={() => setOpen(false)} />
            </>
          )}
        </div>
      )}
    </span>
  );
}
