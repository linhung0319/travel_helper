// 轉向（或拉視窗寬度）跨過 DESKTOP_QUERY 時，把開著的東西帶到另一個版面（interaction-design §1「平板」）：
// 詳情、展開的行程卡、現在看的分頁。兩邊的狀態各存一份（網頁 appStore／uiStore、手機 mobileStore），所以要搬。
// AI 對話本來就在共用的 store（uiStore.chatDraft、chatDemoStore），不用搬。
import { appStore } from './store.ts';
import { uiStore } from './uiStore.ts';
import { mobileStore, type MobileTab } from './mobile/mobileStore.ts';

const TAB_OF_MODE = { map: 'trip', explore: 'explore', wish: 'wish' } as const;
const MODE_OF_TAB: Partial<Record<MobileTab, 'map' | 'explore' | 'wish'>> = { trip: 'map', explore: 'explore', wish: 'wish' };

/** 網頁版 → 手機版：右欄的分頁變成底部分頁（手機在 AI、我分頁時不動），詳情變整頁，展開的卡照樣展開 */
export function toMobile() {
  const s = appStore.getState();
  const m = mobileStore.getState();
  const expanded = uiStore.getState().expandedItem;
  const { detailId, detailTab, mode } = s;
  const tab: MobileTab = m.tab === 'ai' || m.tab === 'me' ? m.tab : TAB_OF_MODE[mode];
  // setTab 換分頁會取消選中、收起卡：只在真的換分頁時叫
  if (tab !== m.tab) m.setTab(tab);
  if (tab === 'trip' && expanded) mobileStore.setState({ expanded, focused: expanded });
  if (detailId) {
    s.closeDetail();
    mobileStore.getState().openPlace(detailId, tab, detailTab ?? undefined);
  }
}

/** 手機版 → 網頁版：底部分頁變成右欄的分頁（AI、我分頁時不動），整頁詳情變網頁的詳情，展開的卡照樣展開 */
export function toDesktop() {
  const m = mobileStore.getState();
  const s = appStore.getState();
  const mode = MODE_OF_TAB[m.tab];
  if (mode && mode !== s.mode) s.setMode(mode);
  if (m.tab === 'trip' && m.expanded) uiStore.setState({ expandedItem: m.expanded });
  if (m.detail) {
    const { placeId, from, tab } = m.detail;
    // 先關手機的整頁（它推過一筆 history，closePlace 會退掉）
    m.closePlace();
    appStore.getState().openDetail(placeId, MODE_OF_TAB[from] ?? appStore.getState().mode, tab);
  }
}
