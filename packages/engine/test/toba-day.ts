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
  add({
    type: 'split',
    groups: [
      { id: 'g1', name: '長輩組', size: 6, elders: 5, kids: 0, items: [{ id: '', type: 'visit', options: [{ place: 'toba-mikimoto-pearl-island' }], selected: 0 }] },
      {
        id: 'g2',
        name: '爬坡組',
        size: 9,
        elders: 0,
        kids: 4,
        items: [
          { id: '', type: 'visit', options: [{ place: 'toba-castle-ruins' }], selected: 0 },
          { id: '', type: 'visit', options: [{ place: 'toba-hiyoriyama-observatory' }], selected: 0 },
        ],
      },
    ],
    meet: { place: 'toba-ichibangai', time: '15:45' },
  });
  add({ type: 'visit', options: [{ place: 'toba-mizunuma-sazae', stayMinutes: 30 }], meal: 'snack' });
  return it;
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('toba-day.ts')) {
  const plan = planItinerary(tobaDay(), realData());
  const day = plan.days.find((d) => d.date === TOBA_DATE);
  console.log(JSON.stringify(day, null, 1));
}
