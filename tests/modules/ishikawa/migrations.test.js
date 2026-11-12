/**
 * Tests for modules/ishikawa/domain/migrations.js — Schritt '0→1.0' aus dem
 * gespeicherten Zustand der Altform, und die beiden Beispiele.
 */
import { suite, test, assertEqual, assertDeepEqual } from '../../test-utils.js';
import { from0 } from '../../../js/modules/ishikawa/domain/migrations.js';
import { State } from '../../../js/modules/ishikawa/domain/model.js';
import { EXP_COLS, CAT_KEYS } from '../../../js/modules/ishikawa/domain/constants.js';
import { resolveDateOffset } from '../../../js/core/date-offset.js';

const BASE = new URL('../../../js/modules/ishikawa/resources/examples/projects/', import.meta.url);

/** Eine Zeile der Altform `toJSON`. */
const oldRow = (id, over = {}) => ({
  id, stableId: `H-${String(id).padStart(3, '0')}`, parentId: null, category: '',
  name: `R${id}`, description: '', ratings: {}, status: 'open', ...over,
});

/**
 * Die Datumsangaben eines Beispiels wie beim Laden auflösen ("+7d" → Datum).
 * @param {any} data @returns {any}
 */
function resolveDates(data) {
  const out = JSON.parse(JSON.stringify(data));
  for (const e of out.experiments ?? []) {
    e.startDate = resolveDateOffset(e.startDate);
    e.endDate = resolveDateOffset(e.endDate);
  }
  for (const f of out.facts ?? []) f.date = resolveDateOffset(f.date);
  return out;
}

/** @param {string} file @returns {Promise<any>} */
async function example(file) {
  const res = await fetch(new URL(file, BASE), { cache: 'no-cache' });
  return res.json();
}

suite('ishikawa Migration — Beispiele', () => {
  for (const file of ['ishikawa-lieferzeit-zu-lang.json', 'ishikawa-hubschrauber-flyer.json']) {
    test(`${file}: lädt ohne Reparatur, Experten bekommen EXP_COLS[i], Rest unverändert`, async () => {
      const raw = resolveDates(await example(file));
      const reports = [];
      const m = State.fromJSON(raw, { onRepair: (name) => reports.push(name) });
      assertDeepEqual(reports, []);
      assertDeepEqual(m.experts, raw.experts.map((e, i) => ({ ...e, color: EXP_COLS[i] })));
      assertDeepEqual(m.rows, raw.rows);
      assertDeepEqual(m.experiments, raw.experiments);
      assertDeepEqual(m.facts, raw.facts);
      assertEqual(m.problem, raw.problem);
      for (const k of Object.keys(raw.catLabels)) assertEqual(m.catLabels[k], raw.catLabels[k]);
    });
  }
});

suite('ishikawa Migration — from0', () => {
  test('Waise wird Hauptursache ohne Kategorie', () => {
    const out = from0({ rows: [oldRow(1), oldRow(2, { parentId: 99, category: 'man' })] });
    assertEqual(out.rows[1].parentId, null);
    assertEqual(out.rows[1].category, '');
  });

  test('Zeile ohne ratings bekommt {}', () => {
    const r = oldRow(1);
    delete r.ratings;
    assertDeepEqual(from0({ rows: [r] }).rows[0].ratings, {});
  });

  test('Zeile ohne Beschreibung, Name, Kategorie oder Status bekommt die Vorgabe', () => {
    const out = from0({ rows: [{ id: 1, parentId: null, ratings: {} }] });
    assertEqual(out.rows[0].name, '');
    assertEqual(out.rows[0].description, '');
    assertEqual(out.rows[0].category, '');
    assertEqual(out.rows[0].status, 'open');
  });

  test('catLabels als Array → Vorgabe; fremder Schlüssel foo entfällt', () => {
    const empty = Object.fromEntries(CAT_KEYS.map((k) => [k, '']));
    assertDeepEqual(from0({ catLabels: [] }).catLabels, empty);
    assertDeepEqual(from0({ catLabels: { man: 'Mensch', foo: 'x' } }).catLabels, { ...empty, man: 'Mensch' });
  });

  test('images als Array → { inScope: [], outScope: [] }', () => {
    assertDeepEqual(from0({ images: [] }).images, { inScope: [], outScope: [] });
    assertDeepEqual(from0({}).images, { inScope: [], outScope: [] });
  });

  test('Experten ohne Farbe bekommen EXP_COLS nach Index, vorhandene bleiben', () => {
    const out = from0({ experts: [{ id: 1, name: 'A' }, { id: 2, name: 'B', color: '#123456' }, { id: 3, name: 'C' }] });
    assertDeepEqual(out.experts.map((e) => e.color), [EXP_COLS[0], '#123456', EXP_COLS[2]]);
  });

  test('Zeilen ohne stableId: H-001, H-002 in Reihenfolge', () => {
    const a = oldRow(1); delete a.stableId;
    const b = oldRow(2); delete b.stableId;
    assertDeepEqual(from0({ rows: [a, b] }).rows.map((r) => r.stableId), ['H-001', 'H-002']);
  });

  test('stableId-Vergabe über Snapshot-Zeilen hinweg ohne Doppel', () => {
    const a = oldRow(1); delete a.stableId;
    const s = oldRow(9); delete s.stableId;
    const out = from0({
      rows: [a, oldRow(2, { stableId: 'H-002' })],
      snapshots: [{ id: 1, name: 'S', date: '', data: { problem: '', experts: [], rows: [oldRow(5, { stableId: 'H-004' }), s] } }],
    });
    const all = [...out.rows, ...out.snapshots[0].data.rows].map((r) => r.stableId);
    assertDeepEqual(all, ['H-005', 'H-002', 'H-004', 'H-006']);
    assertEqual(new Set(all).size, all.length);
  });

  test('Altzeile { id: "r1", cat, text, votes } entfällt', () => {
    const out = from0({ rows: [{ id: 'r1', cat: 'method', text: 'x', votes: 4 }, oldRow(1)] });
    assertDeepEqual(out.rows.map((r) => r.id), [1]);
  });

  test('Kosten als Text werden Zahl, leer wird null', () => {
    const x = {
      id: 1, title: '', description: '', responsible: '', status: 'planned',
      startDate: '', endDate: '', costMoney: '12,5', costHours: '', hypothesisIds: [],
    };
    const out = from0({ experiments: [x] });
    assertEqual(out.experiments[0].costMoney, 12.5);
    assertEqual(out.experiments[0].costHours, null);
  });

  test('Altstand mit Waise und ohne stableId lädt über die Kette ohne Reparatur', () => {
    const reports = [];
    const m = State.fromJSON({
      problem: 'p',
      experts: [{ id: 1, name: 'A', color: '#000' }],
      catLabels: {},
      rows: [
        { id: 1, parentId: null, category: 'man', name: 'T', status: 'open', ratings: { 1: 5 } },
        { id: 5, parentId: 999, category: '', name: 'O', status: 'open', ratings: { 1: 1 } },
      ],
    }, { onRepair: (n) => reports.push(n) });
    assertDeepEqual(reports, []);
    assertDeepEqual(m.rows.map((r) => [r.stableId, r.parentId]), [['H-001', null], ['H-002', null]]);
  });
});
