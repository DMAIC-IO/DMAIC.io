/**
 * Tests for dmaic-calendar/domain (Model, Migrationen 0→1.1 und 1.0→1.1)
 * und viewmodel/forms.js (EventForm, TodoEventForm).
 */
import { suite, test, assertEqual, assertDeepEqual, assertThrows, assertTrue } from '../test-utils.js';
import { setModelContext, confirmOf, currentOf } from '../../js/core/model.js';
import { State } from '../../js/modules/dmaic-calendar/domain/model.js';
import { from0, from10 } from '../../js/modules/dmaic-calendar/domain/migrations.js';
import { EventForm, TodoEventForm } from '../../js/modules/dmaic-calendar/viewmodel/forms.js';

const errOf = (fn) => { try { fn(); } catch (e) { return e; } return null; };

suite('dmaic-calendar Model: Kommandos', () => {
  test('addEvent: Vorgaben, Phase aus dem Kontext, id zurück', () => {
    const m = new State();
    setModelContext(m, { cycle: 'eightd' });
    const id = m.addEvent({ title: ' Kick-off ', date: '2026-11-09' });
    assertEqual(typeof id, 'string');
    const [e] = m.events;
    assertDeepEqual({ ...e }, { id, title: 'Kick-off', date: '2026-11-09', time: '09:00', duration: 60, desc: '', phase: 'prepare' });
  });

  test('addEvent: Ablehnungen tragen param', () => {
    const m = new State();
    assertEqual(errOf(() => m.addEvent({ title: '', date: '2026-11-09' })).param, 'title');
    assertEqual(errOf(() => m.addEvent({ title: 'x', date: '2026-02-30' })).param, 'date');
    assertEqual(errOf(() => m.addEvent({ title: 'x', date: '2026-11-09', time: '09:02' })).param, 'time');
    assertEqual(errOf(() => m.addEvent({ title: 'x', date: '2026-11-09', duration: 3 })).param, 'duration');
    assertEqual(errOf(() => m.addEvent({ title: 'x', date: '2026-11-09', phase: 'nope' })).param, 'phase');
  });

  test('updateEvent: nur die genannten Felder, current liefert den Stand', () => {
    const m = new State();
    const id = m.addEvent({ title: 'A', date: '2026-11-09', phase: 'measure' });
    assertDeepEqual(currentOf(m, 'updateEvent', { id }), { title: 'A', date: '2026-11-09', time: '09:00', duration: 60, desc: '', phase: 'measure' });
    m.updateEvent({ id, time: '11:15', duration: 45 });
    assertEqual(m.events[0].time, '11:15');
    assertEqual(m.events[0].duration, 45);
    assertEqual(m.events[0].title, 'A');
    assertEqual(errOf(() => m.updateEvent({ id, date: '' })).param, 'date');
    assertEqual(errOf(() => m.updateEvent({ id: 'nope', title: 'x' })).param, 'id');
    assertEqual(errOf(() => currentOf(m, 'updateEvent', { id: 'nope' })).param, 'id');
  });

  test('fremde Phase bleibt beim Bearbeiten erhalten', () => {
    const m = State.fromJSON({ events: [{ id: 'e', title: 'T', date: '2026-11-09', time: '09:00', duration: 60, desc: '', phase: 'containment' }] });
    setModelContext(m, { cycle: 'dmaic' });
    m.updateEvent({ id: 'e', title: 'T2' });
    assertEqual(m.events[0].phase, 'containment');
  });

  test('removeEvent: Rückfrage mit Titel, dann entfernt', () => {
    const m = new State();
    const id = m.addEvent({ title: 'Weg', date: '2026-11-09' });
    assertDeepEqual(confirmOf(m, 'removeEvent', { id }), { key: 'confirm.removeEvent', params: { title: 'Weg' } });
    m.removeEvent({ id });
    assertEqual(m.events.length, 0);
  });
});

suite('dmaic-calendar Model: Ansicht und Invarianten', () => {
  test('Achse und Wochentage: Setter lehnt verdrehte Werte ab', () => {
    const m = new State();
    assertEqual(errOf(() => { m.axisFrom = 22; }).invariant, 'axisOrder');
    assertEqual(m.axisFrom, 6);
    assertEqual(errOf(() => { m.dayFrom = 6; m.dayTo = 2; }).invariant, 'dayOrder');
    assertEqual(m.dayTo, 6);
  });
  test('Ansichtswerte gespeichert, verdrehte fallen beim Laden auf die Vorgabe', () => {
    const m = State.fromJSON({ events: [], viewMode: 'week', axisFrom: 8, axisTo: 18, dayFrom: 0, dayTo: 4 });
    assertEqual(m.viewMode, 'week');
    assertEqual(m.axisTo, 18);
    const bad = State.fromJSON({ events: [], axisFrom: 20, axisTo: 8 });
    assertEqual(bad.axisFrom, 6);
    assertEqual(bad.axisTo, 22);
    const json = m.toJSON();
    assertEqual(json._schema.version, '1.1');
    assertEqual(json.viewMode, 'week');
  });
  test('hasContent nur durch Termine', () => {
    const m = State.fromJSON({ events: [], viewMode: 'week' });
    assertEqual(m.hasContent(), false);
  });
});

suite('dmaic-calendar Migration 0→1.1', () => {
  test('Altstand ohne _schema lädt gleichnamig', () => {
    const m = State.fromJSON({
      events: [{ id: 'a', title: 'A', date: '2026-11-09', time: '09:00', duration: 60, desc: '', phase: 'define' }],
      axisFrom: 7, axisTo: 19, dayFrom: 0, dayTo: 4, viewMode: 'week',
    });
    assertEqual(m.events[0].id, 'a');
    assertEqual(m.axisFrom, 7);
    assertEqual(m.viewMode, 'week');
  });
  test('from0 repariert Altlasten wie der alte Lader', () => {
    const out = from0({ events: [
      { title: '', date: '2026-11-09', time: '09:03', duration: 2, phase: 'zzz', source: 'x' },
      { title: 'ohne Datum', date: '' },
      { id: 't', title: 'T', date: '2026-11-10', source: 'todo' },
    ] });
    assertEqual(out.events.length, 1, 'ohne Datum und der Spiegeltermin fallen weg');
    const [a] = out.events;
    assertTrue(typeof a.id === 'string' && a.id !== '');
    assertDeepEqual({ ...a, id: 'x' }, { id: 'x', title: '—', date: '2026-11-09', time: '09:00', duration: 60, desc: '', phase: 'define' });
  });
});

suite('dmaic-calendar Migration 1.0→1.1', () => {
  const OWN = { id: 'e', title: 'Eigen', date: '2026-11-09', time: '09:00', duration: 60, desc: '', phase: 'define' };
  const MIRROR = { id: 'todo-1', title: 'Bericht', date: '2026-11-12', time: '09:00', duration: 30, desc: '', phase: 'define', source: 'todo' };

  test('from10 verwirft Spiegeltermine, eigene bleiben unverändert', () => {
    const out = from10({ events: [OWN, MIRROR], viewMode: 'week' });
    assertDeepEqual(out, { events: [OWN], viewMode: 'week' });
  });

  test('ein gespeicherter Stand 1.0 lädt streng ohne Spiegel und als 1.1', () => {
    const m = State.fromJSON({ _schema: { name: 'dmaic-calendar', version: '1.0' }, events: [OWN, MIRROR], viewMode: 'month' });
    assertDeepEqual(m.events.map((e) => e.id), ['e']);
    assertEqual(m.toJSON()._schema.version, '1.1');
    assertEqual(Object.hasOwn(m.toJSON().events[0], 'source'), false);
  });
});

suite('dmaic-calendar TodoEventForm', () => {
  test('fromParams: Ende aus Beginn und Dauer, ohne Beschreibung und Phase', () => {
    assertDeepEqual(TodoEventForm.fromParams({ title: 'A', date: '2026-11-09', time: '08:00', duration: 45 }),
      { title: 'A', date: '2026-11-09', time: '08:00', end: '08:45' });
  });
  test('toParams: Dauer aus Ende minus Beginn; Ende vor Beginn wirft mit param end', () => {
    assertDeepEqual(TodoEventForm.toParams({ title: 'A', date: '2026-11-09', time: '08:00', end: '09:15' }),
      { title: 'A', date: '2026-11-09', time: '08:00', duration: 75 });
    assertEqual(errOf(() => TodoEventForm.toParams({ title: 'A', date: '2026-11-09', time: '09:00', end: '08:00' })).param, 'end');
  });
});

suite('dmaic-calendar EventForm', () => {
  test('fromParams: Ende aus Beginn und Dauer', () => {
    const v = EventForm.fromParams({ title: 'A', date: '2026-11-09', time: '09:30', duration: 45, desc: '', phase: 'define' });
    assertEqual(v.end, '10:15');
    assertEqual(v.time, '09:30');
  });
  test('fromParams: Ende bis Mitternacht bleibt auf dem 5-Minuten-Raster', () => {
    const v = EventForm.fromParams({ title: 'A', date: '2026-11-09', time: '23:00', duration: 60, desc: '', phase: 'define' });
    assertEqual(v.end, '23:55');
  });
  test('toParams: Dauer aus Ende minus Beginn; Ende vor Beginn wirft mit param end', () => {
    assertDeepEqual(EventForm.toParams({ title: 'A', date: '2026-11-09', time: '09:00', end: '10:30', desc: 'd', phase: 'measure' }),
      { title: 'A', date: '2026-11-09', time: '09:00', duration: 90, desc: 'd', phase: 'measure' });
    const err = errOf(() => EventForm.toParams({ title: 'A', date: '2026-11-09', time: '10:00', end: '10:00', desc: '', phase: 'define' }));
    assertEqual(err.param, 'end');
    assertTrue(/^invalid end "10:00"; allowed: a time after 10:00$/.test(err.message));
  });
});
