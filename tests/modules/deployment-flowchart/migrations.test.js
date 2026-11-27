/**
 * Deployment-Flowchart: Migration '0→1.0' (domain/migrations.js) — die Fälle
 * des alten `fromJSON` in der neuen Form, Bahnen nach `order`, fremde
 * Schlüssel entfallen; dazu die Altinstanzen des Altprojekts gegen das `read()`
 * der Altform und Handfälle, die erst die Reparatur heilt.
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../../test-utils.js';
import { from0 } from '../../../js/modules/deployment-flowchart/domain/migrations.js';
import { State } from '../../../js/modules/deployment-flowchart/domain/model.js';

async function fetchJson(path) {
  const res = await fetch(new URL(path, import.meta.url), { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return res.json();
}

/** @param {() => any} fn @returns {any} der geworfene Fehler */
function errorOf(fn) {
  try { fn(); } catch (err) { return err; }
  throw new Error('Expected function to throw');
}

const plain = (v) => JSON.parse(JSON.stringify(v));

suite('Deployment-Flowchart Migration 0→1.0', () => {
  test('leerer Altstand: keine Schritte, keine Bahnen', () => {
    assertDeepEqual(from0({}), { steps: [], lanes: [], expanded: [] });
    assertDeepEqual(from0({ steps: 'kaputt', lanes: 7 }), { steps: [], lanes: [], expanded: [] });
  });

  test('fromJSON preserves both steps and lanes (Altfall)', () => {
    const m = State.fromJSON({ steps: [{ id: 'a', title: 'A', laneId: 'sales' }], lanes: [{ id: 'sales', name: 'Sales', order: 0 }] });
    assertEqual(m.steps[0].laneId, 'sales');
    assertDeepEqual(plain(m.lanes), [{ id: 'sales', name: 'Sales' }]);
  });

  test('fromJSON lazy-creates the Unassigned lane when a step references it (Altfall)', () => {
    const out = from0({ steps: [{ id: 'a', title: 'A' }], lanes: [] });
    assertEqual(out.steps[0].laneId, 'unassigned');
    assertDeepEqual(out.lanes, [{ id: 'unassigned', name: '' }]);
    assertEqual(State.fromJSON({ steps: [{ id: 'a', title: 'A' }] }).lanes[0].id, 'unassigned');
  });

  test('fromJSON does not create the Unassigned lane when no step needs it (Altfall)', () => {
    const out = from0({ steps: [{ id: 'a', laneId: 'sales' }], lanes: [{ id: 'sales', name: 'Sales', order: 0 }] });
    assertEqual(out.lanes.some((l) => l.id === 'unassigned'), false);
  });

  test('Bahnen stabil nach order; ohne Zahl zählt die Position; order entfällt', () => {
    const out = from0({ lanes: [
      { id: 'c', name: 'C', order: 2 },
      { id: 'x', name: 'X' },
      { id: 'a', name: 'A', order: 0 },
      { id: 'b', name: 'B', order: 2 },
      'kaputt',
    ] });
    assertDeepEqual(out.lanes.map((l) => l.id), ['a', 'x', 'c', 'b']);
    assertDeepEqual(Object.keys(out.lanes[0]), ['id', 'name']);
  });

  test('Bahn ohne id bekommt lane0m<Position>, bei Kollision mit _; name ohne Text wird leer', () => {
    const out = from0({ lanes: [{ name: 7 }, { id: 'lane0m0', name: 'Y' }] });
    assertDeepEqual(out.lanes, [{ id: 'lane0m0_', name: '' }, { id: 'lane0m0', name: 'Y' }]);
    assertDeepEqual(from0({ lanes: [{ name: 'Q' }] }).lanes, from0({ lanes: [{ name: 'Q' }] }).lanes, 'fest, nicht zufällig');
  });

  test('Schritte: laneId nicht leer, sonst unassigned; expanded wandert; fremde Schlüssel entfallen', () => {
    const out = from0({ steps: [
      { id: 'a', title: 'A', laneId: '', expanded: true, owner: 'MW', substeps: [{ id: 'x', title: 'X', z: 1 }] },
      { id: 'b', laneId: 42 },
      null,
    ] });
    assertDeepEqual(out.steps, [
      { id: 'a', title: 'A', description: '', laneId: 'unassigned', substeps: [{ id: 'x', title: 'X' }] },
      { id: 'b', title: '', description: '', laneId: 'unassigned', substeps: [] },
    ]);
    assertDeepEqual(out.expanded, ['a']);
    assertDeepEqual(out.lanes, [{ id: 'unassigned', name: '' }]);
  });

  test('Schritte und Unterschritte ohne id bekommen eindeutige Ersatz-ids', () => {
    const out = from0({ steps: [{ title: 'A', substeps: [{ title: 'x' }, { title: 'y' }] }, { title: 'B' }, { id: 's0m0', title: 'C' }] });
    assertDeepEqual(out.steps.map((s) => s.id), ['s0m0_', 's0m1', 's0m0']);
    assertDeepEqual(out.steps[0].substeps.map((s) => s.id), ['ss0m0_0', 'ss0m0_1']);
  });

  test('Altprojekt lädt ohne Reparatur und gleicht dem read() der Altform (Bahnen nach order, expanded als Liste, ohne Fremdschlüssel)', async () => {
    const fx = await fetchJson('./legacy-project.json');
    const old = await fetchJson('./legacy-read.json');
    const [a, b] = Object.values(fx.moduleStates);
    for (const [raw, want] of [[a, old.a], [b, old.b]]) {
      const m = State.fromJSON(plain(raw));
      const expected = {
        steps: want.steps.map((s) => ({
          id: s.id, title: s.title, description: s.description, laneId: s.laneId,
          substeps: s.substeps.map((x) => ({ id: x.id, title: x.title })),
        })),
        lanes: [...want.lanes].sort((x, y) => x.order - y.order).map((l) => ({ id: l.id, name: l.name })),
      };
      assertDeepEqual(plain({ steps: m.steps, lanes: m.lanes }), expected);
      assertDeepEqual(plain(m.expanded), want.steps.filter((s) => s.expanded).map((s) => s.id));
    }
    assertDeepEqual(State.fromJSON(plain(a)).lanes.map((l) => l.name), ['Vertrieb', 'Fertigung', '', 'Kunde']);
  });

  test('doppelte Bahn-id: nur mit Reparatur, die spätere entfällt', () => {
    const raw = { lanes: [{ id: 'l', name: 'A' }, { id: 'l', name: 'B' }] };
    assertEqual(errorOf(() => State.fromJSON(plain(raw))).invariant, 'uniqueLaneIds');
    assertDeepEqual(plain(State.fromJSON(plain(raw), { repair: true }).lanes), [{ id: 'l', name: 'A' }]);
  });

  test('unbekannte laneId: nur mit Reparatur, Schritt nach unassigned, Bahn hinten', () => {
    const raw = { steps: [{ id: 'a', laneId: 'weg' }], lanes: [{ id: 'l', name: 'L' }] };
    assertEqual(errorOf(() => State.fromJSON(plain(raw))).invariant, 'knownLanes');
    const m = State.fromJSON(plain(raw), { repair: true });
    assertEqual(m.steps[0].laneId, 'unassigned');
    assertDeepEqual(plain(m.lanes), [{ id: 'l', name: 'L' }, { id: 'unassigned', name: '' }]);
  });

  test('unassigned mit Namen: nur mit Reparatur, Name leer', () => {
    const raw = { lanes: [{ id: 'unassigned', name: 'Frei' }] };
    assertEqual(errorOf(() => State.fromJSON(plain(raw))).invariant, 'reservedLane');
    assertEqual(State.fromJSON(plain(raw), { repair: true }).lanes[0].name, '');
  });

  test('fromJSON hebt den Altstand auf _schema 1.0', () => {
    const json = State.fromJSON({ steps: [{ id: 'a', expanded: true }] }).toJSON();
    assertEqual(json._schema.version, '1.0');
    assertDeepEqual(json.expanded, ['a']);
    assertTrue(Array.isArray(json.lanes));
  });
});
