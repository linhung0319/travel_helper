// 手機的加地點（T33 設計 §4）：大彈窗（shared/ui/AddPlaceDialog）蓋在最上面，詳情開著時蓋在詳情上，存完或取消回到底下那一層。
// 也是一層 history（mobileStore.bindAddLayer），返回鍵先關它。

import { addPlaceStore } from '../addPlaceStore.ts';
import { AddPlaceDialog } from '../shared/ui/AddPlaceDialog.tsx';
import { bindAddLayer } from './mobileStore.ts';

const isOpen = () => {
  const s = addPlaceStore.getState();
  return !!s.draft || !!s.entry;
};

bindAddLayer({ isOpen, cancel: () => addPlaceStore.getState().cancel() }, (onChange) => addPlaceStore.subscribe(() => onChange(isOpen())));

export function AddPlacePage() {
  return <AddPlaceDialog surface="mobile" />;
}
