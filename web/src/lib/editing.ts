// 編輯中時，時間軸面板（有完整藍條）有沒有在畫面上：沒有的話（探索、想去、聊天、詳情）要另外顯示精簡的「編輯中」條。

/** 電腦版：右欄是「行程」分頁且沒開詳情；手機：下方面板在「行程」分頁、沒開詳情、而且不是收在最低（peek 時藍條在畫面外） */
export function dayPanelShowing(s: { mode: 'map' | 'explore' | 'wish'; detailId: string | null; sheet: { tab: string; snap: string } }, desktop: boolean): boolean {
  if (s.detailId) return false;
  return desktop ? s.mode === 'map' : s.sheet.tab === 'day' && s.sheet.snap !== 'peek';
}
