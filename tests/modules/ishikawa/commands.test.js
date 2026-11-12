/**
 * Tests for the commands of modules/ishikawa/domain/model.js — ids,
 * Ursachenbaum, Experten, Bewertungen, Snapshots, Experimente, Fakten, Bilder
 * und die Rückfragen (`confirm`).
 */
import { suite, test, assertEqual, assertDeepEqual } from '../../test-utils.js';
import { State } from '../../../js/modules/ishikawa/domain/model.js';
import { CAT_KEYS, EXP_COLS } from '../../../js/modules/ishikawa/domain/constants.js';
import { confirmOf, currentOf } from '../../../js/core/model.js';
import { todayISO } from '../../../js/core/local-date.js';

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

/** Ein Experiment der Form 1.0. */
const exp = (id, over = {}) => ({
  id, title: `X${id}`, description: '', responsible: '', status: 'planned',
  startDate: '', endDate: '', costMoney: null, costHours: null, hypothesisIds: [], ...over,
});

/** Ein Fakt der Form 1.0. */
const fact = (id, over = {}) => ({ id, name: `F${id}`, description: '', date: '', owner: '', ...over });

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

const load = (over) => State.fromJSON(saved(over));
const IMG = 'data:image/png;base64,AAAA';
const ids = (list) => list.map((x) => x.id);

suite('ishikawa Kommandos — ids', () => {
  test('addRow nach Laden eines Stands mit id 7 → id 8, angehängt als Hauptursache', () => {
    const m = load({ rows: [row(7)] });
    const out = m.addRow();
    assertDeepEqual(out, { id: 8, stableId: 'H-008' });
    assertDeepEqual(m.rows[1], {
      id: 8, stableId: 'H-008', parentId: null, category: '', name: '', description: '', ratings: {}, status: 'open',
    });
  });

  test('stableId über Zeilen und Snapshot-Zeilen: H-012 im Snapshot → neue H-013', () => {
    const m = load({
      rows: [row(1)],
      snapshots: [{ id: 1, name: 'S', date: '', data: { problem: '', experts: [], rows: [row(12)] } }],
    });
    assertEqual(m.addRow().stableId, 'H-013');
  });

  test('leeres Model: erste Zeile id 1, H-001; Experte, Experiment, Fakt id 1', () => {
    const m = new State();
    assertDeepEqual(m.addRow(), { id: 1, stableId: 'H-001' });
    assertEqual(m.addExpert({ name: 'Anna' }), 1);
    assertEqual(m.addExperiment(), 1);
    assertEqual(m.addFact(), 1);
  });

  test('Bild-id über beide Galerien', () => {
    const m = load({ images: { inScope: [{ id: 4, dataUrl: IMG, caption: '' }], outScope: [] } });
    assertEqual(m.addImage({ scope: 'outScope', dataUrl: IMG, caption: 'b' }), 5);
    assertDeepEqual(m.images.outScope, [{ id: 5, dataUrl: IMG, caption: 'b' }]);
  });
});

suite('ishikawa Kommandos — Ursachenbaum', () => {
  test('addSubRow: Unterursache ohne Kategorie direkt hinter dem Teilbaum des Elternknotens', () => {
    const m = load({ rows: [row(1, { category: 'man' }), row(2, { parentId: 1 }), row(3, { category: 'method' })] });
    const out = m.addSubRow({ parentId: 1 });
    assertDeepEqual(out, { id: 4, stableId: 'H-004' });
    assertDeepEqual(ids(m.rows), [1, 2, 4, 3]);
    assertEqual(m.rows[2].parentId, 1);
    assertEqual(m.rows[2].category, '');
  });

  test('addSubRow mit unbekanntem Elternknoten → param parentId', () => {
    assertEqual(thrown(() => load({ rows: [row(1)] }).addSubRow({ parentId: 9 }))?.param, 'parentId');
  });

  test('setRowField setzt die genannten Felder; Unterursache mit Kategorie → param category', () => {
    const m = load({ rows: [row(1), row(2, { parentId: 1 })] });
    m.setRowField({ rowId: 1, name: 'Ofen', category: 'machine', status: 'testing' });
    assertDeepEqual([m.rows[0].name, m.rows[0].category, m.rows[0].status], ['Ofen', 'machine', 'testing']);
    m.setRowField({ rowId: 2, description: 'zu kalt', category: '' });
    assertEqual(m.rows[1].description, 'zu kalt');
    assertEqual(thrown(() => m.setRowField({ rowId: 2, category: 'man' }))?.param, 'category');
    assertEqual(thrown(() => m.setRowField({ rowId: 1, status: 'done' }))?.param, 'status');
    assertEqual(thrown(() => m.setRowField({ rowId: 1, key: 'name' }))?.param, 'key');
    assertEqual(m.rows[1].category, '');
  });

  test('removeRow entfernt den Teilbaum und dessen stableIds aus hypothesisIds', () => {
    const m = load({
      rows: [row(1), row(2, { parentId: 1 }), row(3, { parentId: 2 }), row(4)],
      experiments: [exp(1, { hypothesisIds: ['H-001', 'H-003', 'H-004'] }), exp(2, { hypothesisIds: ['H-002'] })],
    });
    m.removeRow({ rowId: 1 });
    assertDeepEqual(ids(m.rows), [4]);
    assertDeepEqual(m.experiments.map((x) => x.hypothesisIds), [['H-004'], []]);
  });

  test('moveRowBefore: Teilbaum vor die Zielzeile, Elternknoten des Ziels, Unterursache ohne Kategorie', () => {
    const m = load({ rows: [
      row(1, { category: 'man' }), row(2, { parentId: 1 }),
      row(3, { category: 'method' }), row(4, { parentId: 3 }), row(5, { parentId: 4 }),
    ] });
    m.moveRowBefore({ rowId: 3, targetRowId: 2 });
    assertDeepEqual(ids(m.rows), [1, 3, 4, 5, 2]);
    const r3 = m.rows.find((r) => r.id === 3);
    assertEqual(r3.parentId, 1);
    assertEqual(r3.category, '');
    assertEqual(m.rows.find((r) => r.id === 4).parentId, 3);
  });

  test('moveRowBefore in den eigenen Teilbaum → wirft mit param targetRowId, nichts bewegt', () => {
    const m = load({ rows: [row(1), row(2, { parentId: 1 }), row(3, { parentId: 2 }), row(4)] });
    const err = thrown(() => m.moveRowBefore({ rowId: 1, targetRowId: 3 }));
    assertEqual(err?.param, 'targetRowId');
    assertDeepEqual(m.rows.map((r) => [r.id, r.parentId]), [[1, null], [2, 1], [3, 2], [4, null]]);
  });

  test('moveRowBefore auf sich selbst ändert nichts', () => {
    const m = load({ rows: [row(1), row(2)] });
    m.moveRowBefore({ rowId: 2, targetRowId: 2 });
    assertDeepEqual(ids(m.rows), [1, 2]);
  });

  test('moveRowBefore mit targetRowId null: hinter die letzte Geschwisterzeile, Elternknoten bleibt', () => {
    const m = load({ rows: [
      row(1), row(2, { parentId: 1 }), row(3, { parentId: 2 }), row(4, { parentId: 1 }), row(5, { parentId: 4 }), row(6),
    ] });
    m.moveRowBefore({ rowId: 2, targetRowId: null });
    assertDeepEqual(ids(m.rows), [1, 4, 5, 2, 3, 6]);
    assertEqual(m.rows.find((r) => r.id === 2).parentId, 1);
  });

  test('moveRowBefore mit unbekannter Zeile → param rowId bzw. targetRowId', () => {
    const m = load({ rows: [row(1)] });
    assertEqual(thrown(() => m.moveRowBefore({ rowId: 9, targetRowId: 1 }))?.param, 'rowId');
    assertEqual(thrown(() => m.moveRowBefore({ rowId: 1, targetRowId: 9 }))?.param, 'targetRowId');
  });
});

suite('ishikawa Kommandos — Experten und Bewertungen', () => {
  test('addExpert: getrimmter Name, Farbe nach Anzahl; doppelt oder leer → param name', () => {
    const m = new State();
    assertEqual(m.addExpert({ name: '  Anna ' }), 1);
    assertEqual(m.addExpert({ name: 'Bert' }), 2);
    assertDeepEqual(m.experts, [
      { id: 1, name: 'Anna', color: EXP_COLS[0] },
      { id: 2, name: 'Bert', color: EXP_COLS[1] },
    ]);
    assertEqual(thrown(() => m.addExpert({ name: 'anna' }))?.param, 'name');
    assertEqual(thrown(() => m.addExpert({ name: '  ' }))?.param, 'name');
    assertEqual(m.experts.length, 2);
  });

  test('renameExpert auf vergebenen Namen → wirft; eigener Name in anderer Schreibung geht', () => {
    const m = load({ experts: [{ id: 1, name: 'Anna', color: '#000000' }, { id: 2, name: 'Bert', color: '#111111' }] });
    assertEqual(thrown(() => m.renameExpert({ expertId: 2, name: 'ANNA' }))?.param, 'name');
    assertEqual(m.experts[1].name, 'Bert');
    m.renameExpert({ expertId: 1, name: 'anna' });
    assertEqual(m.experts[0].name, 'anna');
    assertEqual(thrown(() => m.renameExpert({ expertId: 9, name: 'X' }))?.param, 'expertId');
  });

  test('removeExpert entfernt die Bewertungen in rows, nicht in Snapshots', () => {
    const experts = [{ id: 1, name: 'Anna', color: '#000000' }, { id: 2, name: 'Bert', color: '#111111' }];
    const m = load({
      experts,
      rows: [row(1, { ratings: { 1: 3, 2: 5 } })],
      snapshots: [{ id: 1, name: 'S', date: '', data: { problem: '', experts, rows: [row(1, { ratings: { 1: 3, 2: 5 } })] } }],
    });
    m.removeExpert({ expertId: 1 });
    assertDeepEqual(ids(m.experts), [2]);
    assertDeepEqual(m.rows[0].ratings, { 2: 5 });
    assertDeepEqual(m.snapshots[0].data.rows[0].ratings, { 1: 3, 2: 5 });
    assertDeepEqual(ids(m.snapshots[0].data.experts), [1, 2]);
  });

  test('setRating: ganze Zahl 0..9, null löscht; sonst param value', () => {
    const m = load({ experts: [{ id: 1, name: 'Anna', color: '#000000' }], rows: [row(1)] });
    m.setRating({ rowId: 1, expertId: 1, value: 7 });
    assertDeepEqual(m.rows[0].ratings, { 1: 7 });
    m.setRating({ rowId: 1, expertId: 1, value: null });
    assertDeepEqual(m.rows[0].ratings, {});
    m.setRating({ rowId: 1, expertId: 1, value: null });
    assertDeepEqual(m.rows[0].ratings, {});
    for (const bad of [10, -1, 2.5, 'drei', '']) {
      assertEqual(thrown(() => m.setRating({ rowId: 1, expertId: 1, value: bad }))?.param, 'value', String(bad));
    }
    m.setRating({ rowId: 1, expertId: 1, value: '3' });
    assertDeepEqual(m.rows[0].ratings, { 1: 3 });
    assertEqual(thrown(() => m.setRating({ rowId: 1, expertId: 2, value: 1 }))?.param, 'expertId');
  });
});

suite('ishikawa Kommandos — Snapshots', () => {
  const snapData = {
    problem: 'alt',
    experts: [{ id: 3, name: 'Cora', color: '#333333' }],
    rows: [row(1, { name: 'alt', ratings: { 3: 4 } })],
  };

  test('loadSnapshot ersetzt problem, experts, rows; entfernt hypothesisIds ohne Zeile', () => {
    const m = load({
      problem: 'neu',
      experts: [{ id: 1, name: 'Anna', color: '#000000' }],
      rows: [row(1, { ratings: { 1: 2 } }), row(2)],
      snapshots: [{ id: 5, name: 'S', date: '', data: snapData }],
      experiments: [exp(1, { hypothesisIds: ['H-001', 'H-002'] })],
    });
    m.loadSnapshot({ snapshotId: 5 });
    assertEqual(m.problem, 'alt');
    assertDeepEqual(m.experts, snapData.experts);
    assertDeepEqual(m.rows, snapData.rows);
    assertDeepEqual(m.experiments[0].hypothesisIds, ['H-001']);
    m.rows[0].name = 'geändert';
    assertEqual(m.snapshots[0].data.rows[0].name, 'alt');
  });

  test('loadSnapshot mit unbekanntem Snapshot → param snapshotId', () => {
    assertEqual(thrown(() => new State().loadSnapshot({ snapshotId: 1 }))?.param, 'snapshotId');
  });

  test('removeSnapshot entfernt nur diesen Snapshot', () => {
    const m = load({ snapshots: [
      { id: 1, name: 'A', date: '', data: snapData }, { id: 2, name: 'B', date: '', data: snapData },
    ] });
    m.removeSnapshot({ snapshotId: 1 });
    assertDeepEqual(ids(m.snapshots), [2]);
  });
});

suite('ishikawa Kommandos — Experimente', () => {
  test('addExperiment: leer, geplant, am Ende', () => {
    const m = load({ experiments: [exp(4)] });
    assertEqual(m.addExperiment(), 5);
    assertDeepEqual(m.experiments[1], {
      id: 5, title: '', description: '', responsible: '', status: 'planned',
      startDate: '', endDate: '', costMoney: null, costHours: null, hypothesisIds: [],
    });
  });

  test('setExperimentField setzt die genannten Felder', () => {
    const m = load({ experiments: [exp(1)] });
    m.setExperimentField({ experimentId: 1, title: 'T', status: 'running', startDate: '2026-11-01', costMoney: 12.5, costHours: 0 });
    const x = m.experiments[0];
    assertDeepEqual([x.title, x.status, x.startDate, x.costMoney, x.costHours], ['T', 'running', '2026-11-01', 12.5, 0]);
    m.setExperimentField({ experimentId: 1, costMoney: null, startDate: '' });
    assertDeepEqual([x.costMoney, x.startDate], [null, '']);
  });

  test('setExperimentField: Kosten sind Zahlen — "12" wird 12, "zwölf" und -1 abgelehnt, ungültiges Datum auch', () => {
    const m = load({ experiments: [exp(1)] });
    m.setExperimentField({ experimentId: 1, costMoney: '12' });
    assertEqual(m.experiments[0].costMoney, 12);
    m.setExperimentField({ experimentId: 1, costMoney: null });
    assertEqual(thrown(() => m.setExperimentField({ experimentId: 1, costMoney: 'zwölf' }))?.param, 'costMoney');
    assertEqual(thrown(() => m.setExperimentField({ experimentId: 1, costMoney: '' }))?.param, 'costMoney');
    assertEqual(thrown(() => m.setExperimentField({ experimentId: 1, costMoney: -1 }))?.param, 'costMoney');
    assertEqual(thrown(() => m.setExperimentField({ experimentId: 1, endDate: '1.2.2026' }))?.param, 'endDate');
    assertEqual(thrown(() => m.setExperimentField({ experimentId: 2, title: 'x' }))?.param, 'experimentId');
    assertEqual(m.experiments[0].costMoney, null);
  });

  test('removeExperiment entfernt nur dieses', () => {
    const m = load({ experiments: [exp(1), exp(2)] });
    m.removeExperiment({ experimentId: 1 });
    assertDeepEqual(ids(m.experiments), [2]);
  });

  test('moveExperimentBefore: vor das Ziel; null ans Ende; auf sich selbst nichts', () => {
    const m = load({ experiments: [exp(1), exp(2), exp(3)] });
    m.moveExperimentBefore({ experimentId: 3, targetExperimentId: 1 });
    assertDeepEqual(ids(m.experiments), [3, 1, 2]);
    m.moveExperimentBefore({ experimentId: 3, targetExperimentId: null });
    assertDeepEqual(ids(m.experiments), [1, 2, 3]);
    m.moveExperimentBefore({ experimentId: 2, targetExperimentId: 2 });
    assertDeepEqual(ids(m.experiments), [1, 2, 3]);
    assertEqual(thrown(() => m.moveExperimentBefore({ experimentId: 1, targetExperimentId: 9 }))?.param, 'targetExperimentId');
  });

  test('setExperimentHypotheses: bekannte Ursachen einmal; unbekannte → param hypothesisIds', () => {
    const m = load({ rows: [row(1), row(2)], experiments: [exp(1)] });
    m.setExperimentHypotheses({ experimentId: 1, hypothesisIds: ['H-002', 'H-001', 'H-002'] });
    assertDeepEqual(m.experiments[0].hypothesisIds, ['H-002', 'H-001']);
    assertEqual(thrown(() => m.setExperimentHypotheses({ experimentId: 1, hypothesisIds: ['H-009'] }))?.param, 'hypothesisIds');
    m.setExperimentHypotheses({ experimentId: 1, hypothesisIds: [] });
    assertDeepEqual(m.experiments[0].hypothesisIds, []);
  });

  test("setCauseExperiments('H-001', [2, 3]) → genau Experimente 2 und 3 nennen H-001", () => {
    const m = load({
      rows: [row(1), row(2)],
      experiments: [
        exp(1, { hypothesisIds: ['H-001', 'H-002'] }), exp(2, { hypothesisIds: ['H-002'] }),
        exp(3, { hypothesisIds: ['H-001'] }), exp(4),
      ],
    });
    m.setCauseExperiments({ stableId: 'H-001', experimentIds: [2, 3] });
    assertDeepEqual(m.experiments.map((x) => x.hypothesisIds), [['H-002'], ['H-002', 'H-001'], ['H-001'], []]);
    assertEqual(thrown(() => m.setCauseExperiments({ stableId: 'H-009', experimentIds: [] }))?.param, 'stableId');
    assertEqual(thrown(() => m.setCauseExperiments({ stableId: 'H-001', experimentIds: [9] }))?.param, 'experimentIds');
  });

  test('Startwerte der Verknüpfungsdialoge (current): Ursachen eines Experiments, Experimente einer Ursache', () => {
    const m = load({
      rows: [row(1), row(2)],
      experiments: [exp(1, { hypothesisIds: ['H-002', 'H-001'] }), exp(2, { hypothesisIds: ['H-002'] }), exp(3)],
    });
    assertDeepEqual(currentOf(m, 'setExperimentHypotheses', { experimentId: 1 }), { hypothesisIds: ['H-002', 'H-001'] });
    assertDeepEqual(currentOf(m, 'setCauseExperiments', { stableId: 'H-002' }), { experimentIds: [1, 2] });
    assertDeepEqual(currentOf(m, 'setCauseExperiments', { stableId: 'H-001' }), { experimentIds: [1] });
  });
});

suite('ishikawa Kommandos — Fakten', () => {
  test('addFact ohne Datum → lokales Datum (todayISO)', () => {
    const m = new State();
    const id = m.addFact();
    assertDeepEqual(m.facts, [{ id, name: '', description: '', date: todayISO(), owner: '' }]);
  });

  test('setFactField setzt die genannten Felder; Datum geprüft', () => {
    const m = load({ facts: [fact(1)] });
    m.setFactField({ factId: 1, name: 'N', owner: 'O', date: '2026-10-20' });
    assertDeepEqual(m.facts[0], { id: 1, name: 'N', description: '', date: '2026-10-20', owner: 'O' });
    m.setFactField({ factId: 1, date: '' });
    assertEqual(m.facts[0].date, '');
    assertEqual(thrown(() => m.setFactField({ factId: 1, date: 'heute' }))?.param, 'date');
  });

  test('removeFact und moveFactBefore (null ans Ende)', () => {
    const m = load({ facts: [fact(1), fact(2), fact(3)] });
    m.moveFactBefore({ factId: 3, targetFactId: 2 });
    assertDeepEqual(ids(m.facts), [1, 3, 2]);
    m.moveFactBefore({ factId: 1, targetFactId: null });
    assertDeepEqual(ids(m.facts), [3, 2, 1]);
    m.removeFact({ factId: 2 });
    assertDeepEqual(ids(m.facts), [3, 1]);
  });
});

suite('ishikawa Kommandos — Bilder', () => {
  test('addImage prüft die Data-URL; setImageCaption, removeImage je Galerie', () => {
    const m = new State();
    assertEqual(thrown(() => m.addImage({ scope: 'inScope', dataUrl: 'http://x', caption: '' }))?.param, 'dataUrl');
    assertEqual(thrown(() => m.addImage({ scope: 'side', dataUrl: IMG, caption: '' }))?.param, 'scope');
    const a = m.addImage({ scope: 'inScope', dataUrl: IMG, caption: '' });
    const b = m.addImage({ scope: 'inScope', dataUrl: IMG, caption: '' });
    m.setImageCaption({ scope: 'inScope', id: a, caption: 'Halle' });
    assertEqual(m.images.inScope[0].caption, 'Halle');
    assertEqual(thrown(() => m.removeImage({ scope: 'outScope', id: a }))?.param, 'id');
    m.removeImage({ scope: 'inScope', id: a });
    assertDeepEqual(ids(m.images.inScope), [b]);
  });

  test('addImage ist nicht für den Agenten (dataUrl ist image())', () => {
    assertEqual(State.schema.commands.addImage.params.dataUrl.agentWrite, false);
  });
});

suite('ishikawa Kommandos — Rückfragen', () => {
  test('removeRow: delRowConfirmWithSubs mit count bei Unterursachen, sonst delRowConfirm', () => {
    const m = load({ rows: [row(1, { name: ' Ofen ' }), row(2, { parentId: 1 }), row(3, { parentId: 2 }), row(4, { name: '' })] });
    assertDeepEqual(confirmOf(m, 'removeRow', { rowId: 1 }),
      { key: 'delRowConfirmWithSubs', params: { name: 'Ofen', count: 2 } });
    assertDeepEqual(confirmOf(m, 'removeRow', { rowId: 4 }), { key: 'delRowConfirm', params: { name: 'H-004' } });
  });

  test('loadSnapshot, removeExperiment, removeFact, removeImage fragen; Name sonst #Position', () => {
    const m = load({
      snapshots: [{ id: 1, name: 'S', date: '', data: { problem: '', experts: [], rows: [] } }],
      experiments: [exp(1, { title: 'Test' }), exp(2, { title: ' ' })],
      facts: [fact(1, { name: '' })],
      images: { inScope: [], outScope: [{ id: 1, dataUrl: IMG, caption: '' }, { id: 2, dataUrl: IMG, caption: 'Plan' }] },
    });
    assertDeepEqual(confirmOf(m, 'loadSnapshot', { snapshotId: 1 }), { key: 'loadSnapConfirm' });
    assertDeepEqual(confirmOf(m, 'removeExperiment', { experimentId: 1 }), { key: 'delExperimentConfirm', params: { name: 'Test' } });
    assertDeepEqual(confirmOf(m, 'removeExperiment', { experimentId: 2 }), { key: 'delExperimentConfirm', params: { name: '#2' } });
    assertDeepEqual(confirmOf(m, 'removeFact', { factId: 1 }), { key: 'delFactConfirm', params: { name: '#1' } });
    assertDeepEqual(confirmOf(m, 'removeImage', { scope: 'outScope', id: 1 }), { key: 'delImageConfirm', params: { name: '#1' } });
    assertDeepEqual(confirmOf(m, 'removeImage', { scope: 'outScope', id: 2 }), { key: 'delImageConfirm', params: { name: 'Plan' } });
  });

  test('ohne Rückfrage: removeSnapshot, removeExpert', () => {
    const m = load({
      experts: [{ id: 1, name: 'A', color: '#000000' }],
      snapshots: [{ id: 1, name: 'S', date: '', data: { problem: '', experts: [], rows: [] } }],
    });
    assertEqual(confirmOf(m, 'removeSnapshot', { snapshotId: 1 }), null);
    assertEqual(confirmOf(m, 'removeExpert', { expertId: 1 }), null);
  });
});
