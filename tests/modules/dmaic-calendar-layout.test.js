/**
 * Tests for dmaic-calendar/domain/layout.js — Monats- und Wochenrechnung.
 */
import { suite, test, assertEqual, assertDeepEqual } from '../test-utils.js';
import * as L from '../../js/modules/dmaic-calendar/domain/layout.js';

const EV = (id, date, time, phase = 'define', duration = 60) => ({ id, title: id, date, time, duration, desc: '', phase });

suite('dmaic-calendar layout: Zeit und Datum', () => {
  test('mtt, ttm, fmtDur', () => {
    assertEqual(L.mtt(545), '09:05');
    assertEqual(L.mtt(-5), '00:00');
    assertEqual(L.mtt(1500), '23:59');
    assertEqual(L.ttm('13:45'), 825);
    assertEqual(L.fmtDur(30), '30min');
    assertEqual(L.fmtDur(60), '1h');
    assertEqual(L.fmtDur(90), '1h 30min');
  });
  test('isoOf, mondayOf, isoDow, shiftWeek', () => {
    assertEqual(L.isoOf(new Date(2026, 10, 6)), '2026-11-06');
    assertEqual(L.isoOf(L.mondayOf(new Date(2026, 10, 8))), '2026-11-02');
    assertEqual(L.isoDow(new Date(2026, 10, 8)), 6);
    assertEqual(L.shiftWeek('2026-11-02', -1), '2026-10-26');
  });
});

suite('dmaic-calendar layout: Monat und Woche', () => {
  const events = [EV('a', '2026-11-03', '10:00'), EV('b', '2026-11-03', '08:00', 'measure'), EV('c', '2026-12-01', '09:00')];

  test('monthCells: volle Wochen, iso auch in Füllzellen, Termine nur im Monat', () => {
    const cells = L.monthCells(events, 2026, 10, null);
    assertEqual(cells.length % 7, 0);
    assertEqual(cells[0].iso, '2026-10-26');
    assertEqual(cells[0].other, true);
    const nov3 = cells.find((c) => c.iso === '2026-11-03');
    assertDeepEqual(nov3.events.map((e) => e.id), ['b', 'a']);
    assertEqual(cells.find((c) => c.iso === '2026-12-01')?.events.length ?? 0, 0);
  });

  test('Phasenfilter', () => {
    assertDeepEqual(L.eventsOn(events, '2026-11-03', 'measure').map((e) => e.id), ['b']);
    assertDeepEqual(L.byPhase(events, null).map((e) => e.id), ['a', 'b', 'c']);
  });

  test('Woche, Stunden, Halbstunden', () => {
    assertDeepEqual(L.weekDates('2026-11-02', 0, 4), ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06']);
    assertDeepEqual(L.hourList(8, 11), [8, 9, 10]);
    assertDeepEqual(L.slotList(8, 10), [480, 510, 540, 570]);
    assertDeepEqual(L.dayRange(2, 4), [2, 3, 4]);
    assertEqual(L.minToPx(540, 8), 60);
  });

  test('slotAt und clampStart', () => {
    assertEqual(L.slotAt(150, 6, 22), 510);
    assertEqual(L.slotAt(-10, 6, 22), 360);
    assertEqual(L.slotAt(99999, 6, 22), 1290);
    assertEqual(L.clampStart(300, 60, 6, 22), 360);
    assertEqual(L.clampStart(1300, 60, 6, 22), 1260);
  });

  test('nextEvents und upcomingEvents', () => {
    assertDeepEqual(L.nextEvents(events, '2026-11-03', 5).map((e) => e.id), ['b', 'a', 'c']);
    assertDeepEqual(L.upcomingEvents(events, '2026-11-03', 14).map((e) => e.id), ['b', 'a']);
  });
});
