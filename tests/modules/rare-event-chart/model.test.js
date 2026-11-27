/**
 * Regelkarte seltener Ereignisse: Model (domain/model.js) — Schema, Vorgaben,
 * Schreiben über `instance.set` (`setFields`) und Ableitungen.
 */
import { suite, test, assert, assertEqual, assertDeepEqual, assertDeepClose, assertThrows } from '../../test-utils.js';
import { State, CHART_TYPE_IDS } from '../../../js/modules/rare-event-chart/domain/model.js';
import { ENGINES, engineRuns } from '../../../js/modules/rare-event-chart/domain/analyze.js';
import { evaluateDerived } from '../../../js/core/derived.js';
import { setFields } from '../../../js/core/model.js';
import controlChart from '../../../js/widgets/control-chart/schema.js';
import { sheetSource } from '../../helpers/sheet-source.js';
import { TAGE, TAGE_SEIT, COUNTS, LEGACY_RESULT, EXAMPLE_RESULT, COUNTS_RESULT } from './analyze.test.js';
import { LEGACY } from './migrations.test.js';

const plain = (v) => JSON.parse(JSON.stringify(v));
const ref = (c) => ({ instanceId: 'ws1', sheetId: 's1', columnId: c });
/** Übersetzer-Stub: zeigt Schlüssel und Parameter. */
const T = (k, p) => (p ? `«${k}:${JSON.stringify(p)}»` : `«${k}»`);

const SHEET = { seit: TAGE_SEIT, counts: COUNTS, kurz: [5], nullen: [0, -1, 3], txt: ['1,5', 2, 3] };
const SRC = sheetSource(SHEET);
/** Das Arbeitsblatt der Altprojekt-Fixture (Ids wie dort). */
const LEGACY_SRC = sheetSource({ col_rec_tage: TAGE }, { instanceId: LEGACY.columnRef.instanceId, sheetId: 'sheet_1' });

/** Stand der Altprojekt-Fixture (nach der Migration). */
const legacy = () => State.fromJSON(LEGACY);

/** @param {any} m @param {string[]} [names] @param {any} [src] */
const derived = (m, names, src = SRC) => evaluateDerived(m, src, names, T);

suite('rare-event-chart: Model — Schema und Vorgaben', () => {
  test('Kartentyp: Literal gleich CHART_TYPE_IDS und den Engines', () => {
    assertDeepEqual([...State.schema.fields.chartTypeId.values], [...CHART_TYPE_IDS]);
    assertDeepEqual([...CHART_TYPE_IDS], ['g', 't']);
    assertDeepEqual(Object.keys(ENGINES), [...CHART_TYPE_IDS]);
    assert(Object.isFrozen(CHART_TYPE_IDS));
  });

  test('Spaltenfeld: numerisch ab zwei Werten, nullbar', () => {
    const c = State.schema.fields.columnRef;
    assertEqual(c.kind, 'columnRef');
    assertDeepEqual([...c.types], ['numeric']);
    assertEqual(c.minCount, 2);
    assertEqual(c.nullable, true);
  });

  test('Felder und Ansicht: Beispielblatt und Editor-Einstellungen des Diagramms', () => {
    assertDeepEqual(Object.keys(State.schema.fields), ['chartTypeId', 'columnRef']);
    assertDeepEqual(Object.keys(State.schema.view).sort(), ['chart', 'exampleWorksheetId']);
    assertEqual(State.schema.view.chart.kind, controlChart.edits().kind);
    assertEqual(State.schema.view.exampleWorksheetId.nullable, true);
  });

  test('keine Kommandos, keine Invarianten', () => {
    assertDeepEqual(Object.keys(State.schema.commands), []);
    assertDeepEqual(Object.keys(State.schema.invariants ?? {}), []);
  });

  test('Vorgaben und kein Inhalt', () => {
    const m = new State();
    assertEqual(m.chartTypeId, 'g');
    assertEqual(m.columnRef, null);
    assertEqual(m.exampleWorksheetId, null);
    assertDeepEqual(plain(m.chart), {});
    assertEqual(m.hasContent(), false);
  });

  test('hasContent: Spalte und Kartentyp zählen (A7), Ansichtsfelder nicht', () => {
    for (const c of [{ columnRef: ref('seit') }, { chartTypeId: 't' }]) {
      const m = new State();
      setFields(m, c);
      assertEqual(m.hasContent(), true, JSON.stringify(c));
    }
    const v = new State();
    v.exampleWorksheetId = 'x';
    v.chart = { title: 'T' };
    assertEqual(v.hasContent(), false);
  });
});

suite('rare-event-chart: Model — instance.set', () => {
  test('chartTypeId: fremder Wert abgelehnt, Stand unverändert', () => {
    const m = new State();
    for (const v of ['p', 'G', '', null, 1]) {
      assertThrows(() => setFields(m, { chartTypeId: v }), undefined, String(v));
      assertEqual(m.chartTypeId, 'g', String(v));
    }
    setFields(m, { chartTypeId: 't' });
    assertEqual(m.chartTypeId, 't');
  });

  test('der Typwechsel räumt nichts auf: die Spalte bleibt (A8)', () => {
    const m = legacy();
    setFields(m, { chartTypeId: 'g' });
    assertDeepEqual(plain(m.columnRef), LEGACY.columnRef);
  });

  test('columnRef: setzen und mit null leeren; falsche Form abgelehnt', () => {
    const m = new State();
    setFields(m, { columnRef: ref('seit') });
    assertDeepEqual(plain(m.columnRef), ref('seit'));
    for (const v of ['seit', 5, { columnId: 'x' }]) {
      assertThrows(() => setFields(m, { columnRef: v }), undefined, JSON.stringify(v));
      assertDeepEqual(plain(m.columnRef), ref('seit'), JSON.stringify(v));
    }
    setFields(m, { columnRef: null });
    assertEqual(m.columnRef, null);
  });

  test('unbekanntes Feld abgelehnt', () => {
    assertThrows(() => setFields(new State(), { foo: 1 }), /unknown field/);
  });
});

suite('rare-event-chart: Model — Ableitungen', () => {
  test('result: Altprojekt gleich dem Literal', () => {
    assertDeepClose(derived(legacy(), ['result'], LEGACY_SRC).result, LEGACY_RESULT);
  });

  test('result: Beispiel (t) und „Counts“ (g) gleich den Literalen', () => {
    const e = new State();
    setFields(e, { chartTypeId: 't', columnRef: ref('seit') });
    assertDeepClose(derived(e, ['result']).result, EXAMPLE_RESULT);
    const c = new State();
    setFields(c, { columnRef: ref('counts') });
    assertDeepClose(derived(c, ['result']).result, COUNTS_RESULT);
  });

  test('result: null ohne Spalte, bei gelöschter Spalte, unter zwei (positiven) Werten; der Bezug bleibt', () => {
    assertEqual(derived(new State(), ['result']).result, null);
    for (const [col, type] of [['gone', 'g'], ['kurz', 'g'], ['nullen', 't']]) {
      const m = new State();
      setFields(m, { columnRef: ref(col), chartTypeId: type });
      const d = derived(m, ['result', 'points']);
      assertEqual(d.result, null, col);
      assertDeepEqual(d.points, [], col);
      assertDeepEqual(plain(m.columnRef), ref(col), 'der Bezug bleibt');
    }
    const g = new State();
    setFields(g, { columnRef: ref('nullen') });
    assertEqual(derived(g, ['result']).result.n, 3, 'g zählt 0 und negative mit');
  });

  test('Text „1,5“ zählt nicht', () => {
    const m = new State();
    setFields(m, { columnRef: ref('txt') });
    assertEqual(derived(m, ['result']).result.n, 2);
  });

  test('points: t mit Lücken (null), leer ohne Ergebnis; Massenableitung', () => {
    const p = derived(legacy(), ['points'], LEGACY_SRC).points;
    assertEqual(p.length, 20);
    assertDeepEqual(Object.keys(p[0]), ['value', 'signal']);
    assertDeepEqual(p.flatMap((r, i) => (r.value === null ? [i] : [])), [7, 12]);
    assertDeepEqual(p.flatMap((r, i) => (r.signal ? [i] : [])), [15]);
    assertDeepEqual(derived(new State(), ['points']).points, []);
    assertDeepEqual([...State.schema.derivedBulk], ['points']);
  });

  test('activeParams, activeColumnSlots', () => {
    assertDeepEqual(derived(new State(), ['activeParams']).activeParams, ['chartTypeId']);
    assertDeepEqual(derived(legacy(), ['activeParams']).activeParams, ['chartTypeId']);
    assertDeepEqual(derived(legacy(), ['activeColumnSlots']).activeColumnSlots, ['columnRef']);
  });

  test('alle Ableitungen zusammen rufen die Engine einmal; Ansichtsfelder rechnen nicht neu', () => {
    const m = new State();
    setFields(m, { chartTypeId: 't', columnRef: ref('seit') });
    const n = engineRuns();
    const d = evaluateDerived(m, SRC, undefined, T);
    assertDeepEqual(Object.keys(d).sort(), ['activeColumnSlots', 'activeParams', 'points', 'result']);
    assertEqual(engineRuns(), n + 1);
    evaluateDerived(m, SRC, undefined, T);
    assertEqual(engineRuns(), n + 1, 'erneutes Lesen rechnet nicht');
    m.chart = { title: 'X' };
    m.exampleWorksheetId = 'ws-9';
    evaluateDerived(m, SRC, undefined, T);
    assertEqual(engineRuns(), n + 1, 'Diagramm-Editor und Beispielblatt rechnen nicht');
    setFields(m, { chartTypeId: 'g' });
    evaluateDerived(m, SRC, undefined, T);
    assertEqual(engineRuns(), n + 2, 'Typwechsel rechnet einmal');
  });

  test('alle Ableitungen ohne Wurf, auch ohne Übersetzer', () => {
    const d = evaluateDerived(legacy(), LEGACY_SRC);
    assert(d.result && !('error' in d.result), 'result ohne Fehler');
  });
});
