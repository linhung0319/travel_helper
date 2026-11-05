// 鳥羽一天的假行程（T14 的完成條件）：test/toba-day.test.ts 用，也可以直接跑看輸出：
//   node --experimental-strip-types packages/engine/test/toba-day.ts
import { addItem, createItinerary, planItinerary, setLodging, type Itinerary } from '../src/index.ts';
import { realData } from './fixtures.ts';

export const TOBA_DATE = '2027-02-05';

export function tobaDay(): Itinerary {
  let it = createItinerary();
  it = setLodging(it, '2027-02-04', 'toba-todaya', 'dinner+breakfast');
  it = setLodging(it, TOBA_DATE, 'toba-todaya', 'breakfast');
  const add = (item: Parameters<typeof addItem>[2]) => {
    const r = addItem(it, TOBA_DATE, item);
    it = r.itinerary;
    return r.itemId;
  };
  add({ type: 'visit', options: [{ place: 'toba-aquarium', stayMinutes: 120 }], proposedBy: ['member-a'] });
  add({
    type: 'visit',
    options: [{ place: 'toba-amiyaki-tenbinya' }, { place: 'toba-sazanami', note: '備案' }],
    start: '12:00',
  });
  // 下午兩個選一個（合併卡）：主選珍珠島；能爬坡的人可以改去城山公園（T72 前是分組）
  add({ type: 'visit', options: [{ place: 'toba-mikimoto-pearl-island' }, { place: 'toba-castle-ruins', note: '能爬坡的人' }] });
  add({ type: 'visit', options: [{ place: 'toba-mizunuma-sazae', stayMinutes: 30 }], tags: ['snack'] });
  return it;
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('toba-day.ts')) {
  const plan = planItinerary(tobaDay(), realData());
  const day = plan.days.find((d) => d.date === TOBA_DATE);
  console.log(JSON.stringify(day, null, 1));
}
