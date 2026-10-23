// 上方列的「我」：之後是 LINE 的名字和大頭照（T25）。dev server 下點了打開開發用選單（T15m 的假登入）：
// 切換使用者、重設假資料、假裝別人改了行程、規劃模式的閒置時間。

import { useState } from 'react';
import { shared } from '../appShared.ts';
import { mockBackend } from '../backend/index.ts';
import { appStore } from '../store.ts';
import { useShared, useUi } from '../hooks.ts';
import { setIdleMinutes } from './Planning.tsx';

function initial(name: string) {
  return [...name][0] ?? '?';
}

export function MeMenu() {
  const me = useShared((s) => s.me);
  const members = useShared((s) => s.members);
  const idle = useUi((s) => s.idleMinutes);
  const [open, setOpen] = useState(false);
  const mock = mockBackend();
  if (!me) return null;
  const switchTo = async (id: string) => {
    mock?.setMe(id);
    await shared.reloadMe();
    setOpen(false);
  };
  const reset = async (kind: 'full' | 'flights-only') => {
    // 直接用 import.meta.env.DEV 判斷，build 時整段拿掉，種子資料不會出現在 dist/
    if (!import.meta.env.DEV) return;
    const { devSeed } = await import('../dev-fixtures/seed.ts');
    mock?.reset(devSeed(kind));
    appStore.getState().setPlanning(false);
    await shared.load();
    setOpen(false);
  };
  return (
    <span className="me-menu">
      <button type="button" className="me-button" aria-expanded={open} onClick={() => setOpen(!open)} title={mock ? '（開發用）切換使用者' : me.displayName} data-testid="me-button">
        {me.pictureUrl ? <img src={me.pictureUrl} alt="" /> : <span className="avatar">{initial(me.displayName)}</span>}
        <span className="me-name">{me.displayName}</span>
      </button>
      {import.meta.env.DEV && open && mock && (
        <div className="dev-menu" role="menu" data-testid="dev-menu">
          <p className="dev-title">🧪 開發用（正式版是 LINE 登入）</p>
          <p className="muted small">切換使用者</p>
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
              setOpen(false);
            }}
            data-testid="dev-other-edit"
          >
            👥 假裝別人改了行程（下次存檔會「別人改過了」）
          </button>
          <button type="button" onClick={() => void reset('full')}>
            ♻️ 重設假資料
          </button>
          <button type="button" onClick={() => void reset('flights-only')}>
            ✈️ 重設成只有航班的行程
          </button>
          <label className="small">
            規劃模式閒置
            <select value={idle} onChange={(e) => setIdleMinutes(Number(e.target.value))}>
              <option value={10}>10 分鐘</option>
              <option value={1}>1 分鐘（測試用）</option>
            </select>
            後退出
          </label>
        </div>
      )}
    </span>
  );
}
