// 編輯中時，時間軸面板（有完整藍條）有沒有在畫面上：沒有的話（探索、想去、詳情）要另外顯示精簡的「編輯中」條。
// 網頁版用；手機版（第六輪）自己畫編輯中的版面。

/** 右欄是「行程」分頁，而且詳情沒有蓋住它（從行程打開的詳情浮在地圖上，時間軸還在） */
export function dayPanelShowing(s: { mode: 'map' | 'explore' | 'wish'; detailId: string | null; detailFrom?: 'map' | 'explore' | 'wish' | null }): boolean {
  if (s.detailId && s.detailFrom !== 'map') return false;
  return s.mode === 'map';
}
