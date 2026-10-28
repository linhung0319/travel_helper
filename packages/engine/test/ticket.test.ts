// 買票站（T29c spec §8.6）：isTicketRide 的表格測試
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isTicketRide, type TicketRideInfo } from '../src/index.ts';

const kin = (line: string): TicketRideInfo => ({ kind: 'timetable', mode: 'train', line, operator: 'kintetsu' });
const jr: TicketRideInfo = { kind: 'timetable', mode: 'train', line: '快速みえ', operator: 'JR東海' };
const loop: TicketRideInfo = { kind: 'headway', mode: 'train', line: 'JR大阪環状線', operator: 'JR西日本' };
const bus: TicketRideInfo = { kind: 'timetable', mode: 'bus', line: 'かもめバス', operator: '三重交通' };
const ferry: TicketRideInfo = { kind: 'timetable', mode: 'ferry', line: '鳥羽市営定期船', operator: '鳥羽市' };

test('isTicketRide：買票站的判斷', () => {
  const cases: [string, TicketRideInfo[], number, boolean][] = [
    ['近鐵特急 第一程', [kin('特急（往賢島）')], 0, true],
    ['近鐵特急 前一程近鐵普通', [kin('普通（往鳥羽）'), kin('特急（往賢島）')], 1, true],
    ['近鐵普通 第一程', [kin('普通（往賢島）')], 0, false],
    ['近鐵急行 第一程', [kin('急行（往鳥羽）')], 0, false],
    ['しまかぜ', [kin('しまかぜ（往賢島）')], 0, true],
    ['班距型 JR 環狀線', [loop], 0, false],
    ['巴士', [bus], 0, false],
    ['JR 第一程', [jr], 0, true],
    ['JR 前一程同業者', [jr, jr], 1, false],
    ['JR 前一程近鐵', [kin('普通（往鳥羽）'), jr], 1, true],
    ['船 第一程', [ferry], 0, true],
    ['船 前一程巴士', [bus, ferry], 1, true],
  ];
  for (const [name, rides, i, want] of cases) assert.equal(isTicketRide(rides, i), want, name);
});
