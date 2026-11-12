/**
 * Tests for modules/ishikawa/domain/model.js — Vorgaben, Schema-Literale,
 * Invarianten (Ablehnung beim Schreiben, Reparatur beim Laden), Auslassungen
 * in read() und die Ableitungen.
 */
import { suite, test, assert, assertEqual, assertDeepEqual } from '../../test-utils.js';
import { State } from '../../../js/modules/ishikawa/domain/model.js';
import {
  CAT_KEYS, STATUS_KEYS, EXP_STATUS, EXP_COLS,
} from '../../../js/modules/ishikawa/domain/constants.js';
import { EXP_COLS as MIGRATION_EXP_COLS } from '../../../js/modules/ishikawa/domain/migrations.js';
import { schemaAgentEntry, readSchemaModel } from '../../../js/core/agent/agent-schema.js';
import { evaluateDerived } from '../../../js/core/derived.js';
import paretoChart from '../../../js/widgets/pareto-chart/schema.js';

/** @param {() => void} fn @returns {any} der geworfene Fehler */
function thrown(fn) {
  try { fn(); } catch (e) { return e; }
  return null;
}

const SCHEMA = { _schema: { name: 'ishikawa', version: '1.0' } };

/** Eine vollständige Zeile der Form 1.0. */
const row = (id, over = {}) => ({
  id, stableId: `H-${String(id).padStart(3, '0')}`, parentId: null, category: '',
  name: `R${id}`, description: '', ratings: {}, status: 'open', ...over,
});

/** Ein gespeicherter Stand der Form 1.0 mit Vorgaben für fehlende Felder. */
const saved = (over = {}) => ({
  ...SCHEMA,
  problem: '',
  experts: [],
  catLabels: Object.fromEntries(CAT_KEYS.map((k) => [k, ''])),
  rows: [],
  snapshots: [],
  experiments: [],
  facts: [],
  images: { inScope: [], outScope: [] },
  ...over,
});

const IMG = 'data:image/png;base64,AAAA';

suite('ishikawa Model — Vorgaben', () => {
  test('leeres Model: alle Felder leer, hasContent false', () => {
    const m = new State();
    assertEqual(m.problem, '');
    assertDeepEqual(m.experts, []);
    assertDeepEqual(m.rows, []);
    assertDeepEqual(m.snapshots, []);
    assertDeepEqual(m.experiments, []);
    assertDeepEqual(m.facts, []);
    assertDeepEqual(m.images, { inScope: [], outScope: [] });
    assertDeepEqual(m.catLabels, Object.fromEntries(CAT_KEYS.map((k) => [k, ''])));
    assertDeepEqual(m.paretoEdits, {});
    assertEqual(m.hasContent(), false);
  });

  test('ein Experte, ein Experiment, ein Fakt oder ein Bild → hasContent true', () => {
    const cases = {
      experts: { experts: [{ id: 1, name: 'A', color: '#000000' }] },
      experiments: { experiments: [{
        id: 1, title: '', description: '', responsible: '', status: 'planned',
        startDate: '', endDate: '', costMoney: null, costHours: null, hypothesisIds: [],
      }] },
      facts: { facts: [{ id: 1, name: '', description: '', date: '', owner: '' }] },
      inScope: { images: { inScope: [{ id: 1, dataUrl: IMG, caption: '' }], outScope: [] } },
      outScope: { images: { inScope: [], outScope: [{ id: 1, dataUrl: IMG, caption: '' }] } },
    };
    for (const [name, over] of Object.entries(cases)) {
      assertEqual(State.fromJSON(saved(over)).hasContent(), true, name);
    }
  });

  test('Listen im Schema gleich den Konstanten', () => {
    const f = State.schema.fields;
    assertDeepEqual([...f.catLabels.keys], [...CAT_KEYS]);
    const rowShape = f.rows.item.shape;
    assertDeepEqual([...rowShape.category.values], ['', ...CAT_KEYS]);
    assertDeepEqual([...rowShape.status.values], [...STATUS_KEYS]);
    const snapRow = f.snapshots.item.shape.data.shape.rows.item.shape;
    assertDeepEqual([...snapRow.category.values], ['', ...CAT_KEYS]);
    assertDeepEqual([...snapRow.status.values], [...STATUS_KEYS]);
    assertDeepEqual([...f.experiments.item.shape.status.values], [...EXP_STATUS]);
  });

  test('EXP_COLS der Migration gleich der Konstante', () => {
    assertDeepEqual([...MIGRATION_EXP_COLS], [...EXP_COLS]);
  });

  test('Feldnamen der Zeilen in rows und snapshots[].data.rows gleich', () => {
    const f = State.schema.fields;
    const live = Object.keys(f.rows.item.shape);
    const snap = Object.keys(f.snapshots.item.shape.data.shape.rows.item.shape);
    assertDeepEqual(snap, live);
    assertDeepEqual(
      Object.keys(f.snapshots.item.shape.data.shape.experts.item.shape),
      Object.keys(f.experts.item.shape),
    );
  });

  test('Ansicht: Editor-Einstellungen des Pareto-Widgets', () => {
    assertEqual(State.schema.view.paretoEdits, paretoChart.edits());
  });
});

suite('ishikawa Model — Invarianten', () => {
  test('anna neben Anna wird mit uniqueExpertNames abgelehnt', () => {
    const m = new State();
    m.experts = [{ id: 1, name: 'Anna', color: '#000000' }];
    const err = thrown(() => { m.experts = [...m.experts, { id: 2, name: 'anna', color: '#111111' }]; });
    assertEqual(err?.invariant, 'uniqueExpertNames');
    assertEqual(m.experts.length, 1);
  });

  test('doppelte Expertennamen beim Laden: spätere bekommen " (2)"', () => {
    const m = State.fromJSON(saved({ experts: [
      { id: 1, name: 'Anna', color: '#000000' },
      { id: 2, name: 'anna', color: '#111111' },
      { id: 3, name: 'Bert', color: '#222222' },
    ] }), { repair: true });
    assertDeepEqual(m.experts.map((e) => e.name), ['Anna', 'anna (2)', 'Bert']);
  });

  test('Zyklus a→b→a beim Laden: repariert, beide Hauptursachen', () => {
    const repaired = [];
    const m = State.fromJSON(saved({ rows: [row(1, { parentId: 2 }), row(2, { parentId: 1 }), row(3)] }),
      { repair: true, onRepair: (n) => repaired.push(n) });
    assertDeepEqual(m.rows.map((r) => r.parentId), [null, null, null]);
    assert(repaired.includes('rows'), 'rows gemeldet');
  });

  test('Zyklus ohne Reparatur: Laden wirft mit validParents', () => {
    const err = thrown(() => State.fromJSON(saved({ rows: [row(1, { parentId: 2 }), row(2, { parentId: 1 })] })));
    assertEqual(err?.invariant, 'validParents');
  });

  test('parentId ohne Zeile beim Laden: Hauptursache', () => {
    const m = State.fromJSON(saved({ rows: [row(1), row(2, { parentId: 99 })] }), { repair: true });
    assertEqual(m.rows[1].parentId, null);
  });

  test('Zyklus mit Anhang: nur die Zyklusglieder werden Hauptursachen', () => {
    const m = State.fromJSON(saved({ rows: [
      row(1, { parentId: 2 }), row(2, { parentId: 1 }), row(3, { parentId: 1 }),
    ] }), { repair: true });
    assertDeepEqual(m.rows.map((r) => r.parentId), [null, null, 1]);
  });

  test('Unterursache mit Kategorie: Kategorie wird beim Laden leer', () => {
    const m = State.fromJSON(saved({ rows: [row(1, { category: 'man' }), row(2, { parentId: 1, category: 'machine' })] }),
      { repair: true });
    assertEqual(m.rows[0].category, 'man');
    assertEqual(m.rows[1].category, '');
  });

  test('Unterursache mit Kategorie beim Schreiben: abgelehnt', () => {
    const m = State.fromJSON(saved({ rows: [row(1, { category: 'man' })] }));
    const err = thrown(() => { m.rows = [...m.rows, row(2, { parentId: 1, category: 'man' })]; });
    assertEqual(err?.invariant, 'subRowsWithoutCategory');
  });

  test('doppelte Zeilen-id: spätere Zeile entfällt; doppelte stableId: neue stableId', () => {
    const m = State.fromJSON(saved({ rows: [
      row(1), row(1, { stableId: 'H-009' }), row(2, { stableId: 'H-001' }),
    ] }), { repair: true });
    assertDeepEqual(m.rows.map((r) => r.id), [1, 2]);
    assertDeepEqual(m.rows.map((r) => r.stableId), ['H-001', 'H-002']);
  });

  test('doppelte Zeilen-id beim Schreiben: abgelehnt mit uniqueRowIds', () => {
    const m = State.fromJSON(saved({ rows: [row(1)] }));
    const err = thrown(() => { m.rows = [...m.rows, row(1, { stableId: 'H-002' })]; });
    assertEqual(err?.invariant, 'uniqueRowIds');
  });

  test('entfallene Zeile: Verweise der Experimente darauf entfallen', () => {
    const m = State.fromJSON(saved({
      rows: [row(1), row(1, { stableId: 'H-007' })],
      experiments: [{
        id: 1, title: '', description: '', responsible: '', status: 'planned',
        startDate: '', endDate: '', costMoney: null, costHours: null, hypothesisIds: ['H-001', 'H-007'],
      }],
    }), { repair: true });
    assertDeepEqual(m.experiments[0].hypothesisIds, ['H-001']);
  });

  test('doppelte ids in Experten, Snapshots, Experimenten, Fakten und Bildern: spätere entfallen', () => {
    const exp = (id) => ({
      id, title: `X${id}`, description: '', responsible: '', status: 'planned',
      startDate: '', endDate: '', costMoney: null, costHours: null, hypothesisIds: [],
    });
    const fact = (id) => ({ id, name: `F${id}`, description: '', date: '', owner: '' });
    const snap = (id) => ({ id, name: `S${id}`, date: '', data: { problem: '', experts: [], rows: [] } });
    const img = (id) => ({ id, dataUrl: IMG, caption: `I${id}` });
    const m = State.fromJSON(saved({
      experts: [{ id: 1, name: 'A', color: '#000000' }, { id: 1, name: 'B', color: '#111111' }],
      snapshots: [snap(1), snap(1)],
      experiments: [exp(1), exp(1)],
      facts: [fact(1), fact(2), fact(1)],
      images: { inScope: [img(1)], outScope: [img(1), img(2)] },
    }), { repair: true });
    assertDeepEqual(m.experts.map((e) => e.name), ['A']);
    assertEqual(m.snapshots.length, 1);
    assertEqual(m.experiments.length, 1);
    assertDeepEqual(m.facts.map((f) => f.name), ['F1', 'F2']);
    assertDeepEqual(m.images.inScope.map((i) => i.caption), ['I1']);
    assertDeepEqual(m.images.outScope.map((i) => i.caption), ['I2']);
  });

  test('Bild-id doppelt über beide Galerien beim Schreiben: abgelehnt mit uniqueItemIds', () => {
    const m = new State();
    const err = thrown(() => {
      m.images = { inScope: [{ id: 1, dataUrl: IMG, caption: '' }], outScope: [{ id: 1, dataUrl: IMG, caption: '' }] };
    });
    assertEqual(err?.invariant, 'uniqueItemIds');
  });

  test('ratings mit Schlüssel eines gelöschten Experten: repariert, Snapshot-Zeilen behalten ihn', () => {
    const m = State.fromJSON(saved({
      experts: [{ id: 1, name: 'A', color: '#000000' }],
      rows: [row(1, { ratings: { 1: 5, 2: 7 } })],
      snapshots: [{ id: 1, name: 'S', date: '', data: {
        problem: '', experts: [{ id: 2, name: 'B', color: '#111111' }],
        rows: [row(1, { ratings: { 1: 5, 2: 7 } })],
      } }],
    }), { repair: true });
    assertDeepEqual(m.rows[0].ratings, { 1: 5 });
    assertDeepEqual(m.snapshots[0].data.rows[0].ratings, { 1: 5, 2: 7 });
  });
});

suite('ishikawa Model — read()', () => {
  const entry = schemaAgentEntry(State);

  test('snapshots[].data und images.*[].dataUrl stehen als $omitted, rows als Baumdeskriptor', () => {
    const m = State.fromJSON(saved({
      rows: [row(1), row(2, { parentId: 1 })],
      snapshots: [{ id: 1, name: 'S', date: '', data: { problem: 'p', experts: [], rows: [] } }],
      images: { inScope: [{ id: 1, dataUrl: IMG, caption: 'c' }], outScope: [{ id: 2, dataUrl: IMG, caption: '' }] },
    }));
    const out = readSchemaModel(entry, m, { fields: ['snapshots'] });
    assertEqual(out.snapshots[0].data.$omitted, true);
    assertEqual(out.images.inScope[0].dataUrl.$omitted, true);
    assertEqual(out.images.outScope[0].dataUrl.$omitted, true);
    assertEqual(out.images.inScope[0].caption, 'c');
    const plain = readSchemaModel(entry, m);
    assertEqual(plain.rows.$bulk, true);
    assertEqual(plain.rows.kind, 'tree');
    assertEqual(entry.fields.rows.bulkKind, 'tree');
  });
});

suite('ishikawa Model — derived', () => {
  const m = State.fromJSON(saved({
    experts: [{ id: 1, name: 'A', color: '#000000' }, { id: 2, name: 'B', color: '#111111' }],
    rows: [
      row(1, { category: 'man', ratings: { 1: 4, 2: 6 } }),
      row(2, { parentId: 1, ratings: { 1: 9 } }),
      row(3, { category: 'method' }),
    ],
  }));
  const d = evaluateDerived(m, null);

  test('scores: Mittel nur über abgegebene Bewertungen, ohne Bewertung null', () => {
    assertDeepEqual(d.scores, { 'H-001': 5, 'H-002': 9, 'H-003': null });
  });

  test('paretoItems: absteigend, Unterursache in der Kategorie ihrer Hauptursache', () => {
    assertDeepEqual(d.paretoItems, [
      { stableId: 'H-002', name: 'R2', category: 'man', score: 9 },
      { stableId: 'H-001', name: 'R1', category: 'man', score: 5 },
    ]);
  });
});
