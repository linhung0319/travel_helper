// 編輯中時，時間軸面板（有完整藍條）有沒有在畫面上：沒有的話（探索、想去、詳情）要另外顯示精簡的「編輯中」條。
// 網頁版用；手機版（第六輪）自己畫編輯中的版面。

/** 右欄是「行程」分頁，而且詳情彈窗沒有蓋住它（蓋在地圖右側的不算，第八輪 §13.3） */
export function dayPanelShowing(s: { mode: 'map' | 'explore' | 'wish'; detailId: string | null; detailAt?: 'map' | 'side' | null }): boolean {
  if (s.detailId && s.detailAt === 'side') return false;
  return s.mode === 'map';
}
