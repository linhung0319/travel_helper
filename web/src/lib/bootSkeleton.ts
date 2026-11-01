// index.html 的開機骨架（#boot）：JS 還沒到就畫得出來，App 有結果（好了或失敗）才拿掉（T32）

export function removeBootSkeleton(): void {
  document.getElementById('boot')?.remove();
}
