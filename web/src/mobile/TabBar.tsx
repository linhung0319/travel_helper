// 手機版底部的 5 個分頁（第六輪 §3.1）：探索、想去（顯示數字）、行程、AI、我。固定在最下面，編輯中藏起來（MobileApp 決定）。

import { Icon, type IconName } from '../components/Icon.tsx';
import { useLiked } from '../shared/placeLists.ts';
import { mobileStore, useMobile, type MobileTab } from './mobileStore.ts';

const TABS: { tab: MobileTab; icon: IconName; label: string }[] = [
  { tab: 'explore', icon: 'search', label: '探索' },
  { tab: 'wish', icon: 'heart', label: '想去' },
  { tab: 'trip', icon: 'calendar', label: '行程' },
  { tab: 'ai', icon: 'spark', label: 'AI' },
  { tab: 'me', icon: 'user', label: '我' },
];

/** 底部分頁列：選到的那個 aria-current="page" */
export function TabBar() {
  const current = useMobile((s) => s.tab);
  const wishCount = useLiked().size;
  return (
    <nav className="m-tabbar" aria-label="分頁" data-testid="m-tabbar">
      {TABS.map(({ tab, icon, label }) => (
        <button
          key={tab}
          type="button"
          className={`m-tab ${current === tab ? 'on' : ''}`}
          aria-current={current === tab ? 'page' : undefined}
          onClick={() => mobileStore.getState().setTab(tab)}
          data-testid={`m-tab-${tab}`}
        >
          <span className="m-tab-icon" aria-hidden>
            <Icon name={icon} size={24} />
          </span>
          <span className="m-tab-label">
            {label}
            {tab === 'wish' && wishCount > 0 && (
              <span className="m-tab-count" data-testid="m-tab-count">
                {wishCount}
              </span>
            )}
          </span>
        </button>
      ))}
    </nav>
  );
}
