// 轉向（或拉視窗寬度）跨過 DESKTOP_QUERY 時，把開著的東西帶到另一個版面（interaction-design §1「平板」）：
// 詳情、展開的行程卡、現在看的分頁。兩邊的狀態各存一份（網頁 appStore／uiStore、手機 mobileStore），所以要搬。
// AI 對話、提議本來就在共用的 store（ai.store、appStore），不用搬，只要決定轉過去看哪一頁（§16.2）。
import { appStore } from './store.ts';
import { ai } from './appAi.ts';
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
  // 正在跟 AI 說話（回覆中、打到一半、帶著晶片）：到 AI 分頁；有提議：到行程頁看提議列
  const c = ai.store.getState();
  const talking = c.status !== 'idle' || !!c.draftText.trim() || c.contexts.length > 0;
  const tab: MobileTab = talking ? 'ai' : s.proposal ? 'trip' : m.tab === 'ai' || m.tab === 'me' ? m.tab : TAB_OF_MODE[mode];
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
  // 有提議：右欄看行程，提議列和差異才看得到
  if (s.proposal && s.mode !== 'map') s.setMode('map');
  if (m.tab === 'trip' && m.expanded) uiStore.setState({ expandedItem: m.expanded });
  if (m.detail) {
    const { placeId, from, tab } = m.detail;
    // 先關手機的整頁（它推過一筆 history，closePlace 會退掉）
    m.closePlace();
    appStore.getState().openDetail(placeId, MODE_OF_TAB[from] ?? appStore.getState().mode, tab);
  }
}
