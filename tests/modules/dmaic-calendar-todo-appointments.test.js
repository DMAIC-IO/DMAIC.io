/**
 * Tests for modules/dmaic-calendar/domain/todo-appointments.js — je
 * vorgemerkter Aufgabe mit Text und ISO-Zieldatum ein Termin mit fester id,
 * Beginn und Dauer aus der Aufgabe oder 09:00/30 min, Phase der
 * Aufgabenliste; alles andere fällt weg.
 */
import { suite, test, assertDeepEqual } from '../test-utils.js';
import { todoAppointments } from '../../js/modules/dmaic-calendar/domain/todo-appointments.js';

const item = (over) => ({ id: 'a', text: 'Audit', owner: '', due: '2026-06-05', status: 'open', cal: true, ...over });

suite('dmaic-calendar: Aufgabentermine', () => {
  test('ein Termin je vorgemerkter Aufgabe, Vorgaben 09:00 und 30 Minuten, Phase der Liste', () => {
    assertDeepEqual(todoAppointments([{ instanceId: 'L1', phase: 'measure', items: [item({ text: '  Audit  ' })] }]), [{
      id: 'todo:L1:a', todo: { instanceId: 'L1', itemId: 'a' }, title: 'Audit',
      date: '2026-06-05', time: '09:00', duration: 30, phase: 'measure',
    }]);
  });

  test('Beginn und Dauer aus der Aufgabe', () => {
    const [ev] = todoAppointments([{ instanceId: 'L1', phase: 'define', items: [item({ time: '14:30', duration: 45 })] }]);
    assertDeepEqual([ev.time, ev.duration], ['14:30', 45]);
  });

  test('ohne Marke, ohne Text, ohne ISO-Datum fällt die Aufgabe weg; Status zählt nicht', () => {
    const items = [
      item({ id: 'x1', cal: false }), item({ id: 'x2', text: '  ' }), item({ id: 'x3', due: 'KW 23' }),
      item({ id: 'x4', due: '' }), item({ id: 'x5', due: '05.06.2026' }), item({ id: 'ok', status: 'done' }),
    ];
    assertDeepEqual(todoAppointments([{ instanceId: 'L', phase: 'define', items }]).map((e) => e.id), ['todo:L:ok']);
  });

  test('mehrere Listen in Folge; kaputte Lesungen fallen weg', () => {
    const reads = [
      { instanceId: 'L1', phase: 'define', items: [item({ id: 'a' }), item({ id: 'b' })] },
      null,
      { instanceId: 'L2', phase: 'define', items: 'x' },
      { instanceId: 'L3', phase: 'define', items: [item({ id: 'a' }), null] },
    ];
    assertDeepEqual(todoAppointments(/** @type {any} */ (reads)).map((e) => e.id), ['todo:L1:a', 'todo:L1:b', 'todo:L3:a']);
    assertDeepEqual(todoAppointments(/** @type {any} */ (null)), []);
  });
});
