// 想去分頁的數字：變多時跳一下（interaction-design §17.4）。掛上去時不跳，變少不跳。

import { useRef } from 'react';

export function CountBump({ n }: { n: number }) {
  const prev = useRef(n);
  const bumps = useRef(0);
  if (n > prev.current) bumps.current++;
  prev.current = n;
  return (
    <span key={bumps.current} className={bumps.current ? 'ui-bump' : undefined}>
      {n}
    </span>
  );
}
