// 編輯中時，時間軸面板（有完整藍條）有沒有在畫面上：沒有的話（探索、想去、詳情）要另外顯示精簡的「編輯中」條。
// 網頁版用；手機版（第六輪）自己畫編輯中的版面。

/** 右欄是「行程」分頁且沒開詳情 */
export function dayPanelShowing(s: { mode: 'map' | 'explore' | 'wish'; detailId: string | null }): boolean {
  if (s.detailId) return false;
  return s.mode === 'map';
}
