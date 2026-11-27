/**
 * Kurzserien-Regelkarte (Z-MR): Model (domain/model.js) — Schema, Vorgaben,
 * Schreiben über `instance.set` (`setFields`), Invariante `chartKeys` und
 * Ableitungen.
 */
import { suite, test, assert, assertEqual, assertDeepEqual, assertThrows, assertDeepClose } from '../../test-utils.js';
import { State, CHART_KEYS } from '../../../js/modules/short-run-chart/domain/model.js';
import { engineRuns } from '../../../js/modules/short-run-chart/domain/analyze.js';
import { evaluateDerived } from '../../../js/core/derived.js';
import { setFields } from '../../../js/core/model.js';
import controlChart from '../../../js/widgets/control-chart/schema.js';
import { sheetSource } from '../../helpers/sheet-source.js';
import {
  TEIL, MASS, SETUP, MESSWERT, PART, VALUE, LEGACY_RESULT, EXAMPLE_RESULT, CSV_RESULT,
} from './analyze.test.js';
import { LEGACY } from './migrations.test.js';

const plain = (v) => JSON.parse(JSON.stringify(v));
const ref = (c) => ({ instanceId: 'ws1', sheetId: 's1', columnId: c });
/** Übersetzer-Stub: zeigt Schlüssel und Parameter. */
const T = (k, p) => (p ? `«${k}:${JSON.stringify(p)}»` : `«${k}»`);

const SHEET = {
  setup: SETUP, messwert: MESSWERT, part: PART, value: VALUE,
  kurz: [1, 2, 3], kurzG: ['A', 'A', 'B'], txt: ['2,5', 10, 10.2, 20, 20.3, 20.1],
  numG: [1, 1, 1, 2, 2, 2],
};
const SRC = sheetSource(SHEET);
/** Das Arbeitsblatt der Altprojekt-Fixture (Ids wie dort). */
const LEGACY_SRC = sheetSource({ col_src_teil: TEIL, col_src_mass: MASS }, { instanceId: LEGACY.valuesRef.instanceId, sheetId: 'sheet_1' });

/** Stand der Altprojekt-Fixture (nach der Migration). */
const legacy = () => State.fromJSON(LEGACY);
/** @param {string} v @param {string} g */
const withRefs = (v, g) => { const m = new State(); setFields(m, { valuesRef: ref(v), groupsRef: ref(g) }); return m; };

/** @param {any} m @param {string[]} [names] @param {any} [src] */
const derived = (m, names, src = SRC) => evaluateDerived(m, src, names, T);

suite('short-run-chart: Model — Schema und Vorgaben', () => {
  test('Messwertspalte: numerisch ab vier Werten, nullbar', () => {
    const c = State.schema.fields.valuesRef;
    assertEqual(c.kind, 'columnRef');
    assertDeepEqual([...c.types], ['numeric']);
    assertEqual(c.minCount, 4);
    assertEqual(c.nullable, true);
  });

  test('Teilespalte: Zahl oder Text ab vier Werten, nullbar', () => {
    const c = State.schema.fields.groupsRef;
    assertEqual(c.kind, 'columnRef');
    assertDeepEqual([...c.types], ['numeric', 'text']);
    assertEqual(c.minCount, 4);
    assertEqual(c.nullable, true);
  });

  test('Felder und Ansicht: Beispielblatt und Editor-Einstellungen je Teilkarte', () => {
    assertDeepEqual(Object.keys(State.schema.fields), ['valuesRef', 'groupsRef']);
    assertDeepEqual(Object.keys(State.schema.view).sort(), ['charts', 'exampleWorksheetId']);
    assertEqual(State.schema.view.charts.kind, 'map');
    assertEqual(State.schema.view.charts.value.kind, controlChart.edits().kind);
    assertEqual(State.schema.view.exampleWorksheetId.nullable, true);
  });

  test('keine Kommandos; eine Invariante chartKeys über charts', () => {
    assertDeepEqual(Object.keys(State.schema.commands), []);
    assertDeepEqual(Object.keys(State.schema.invariants), ['chartKeys']);
    assertDeepEqual([...State.schema.invariants.chartKeys.fields], ['charts']);
  });

  test('CHART_KEYS: z und mr, eingefroren', () => {
    assertDeepEqual([...CHART_KEYS], ['z', 'mr']);
    assert(Object.isFrozen(CHART_KEYS));
  });

  test('Vorgaben und kein Inhalt', () => {
    const m = new State();
    assertEqual(m.valuesRef, null);
    assertEqual(m.groupsRef, null);
    assertEqual(m.exampleWorksheetId, null);
    assertDeepEqual(plain(m.charts), {});
    assertEqual(m.hasContent(), false);
  });

  test('hasContent: jede Spalte zählt, Ansichtsfelder nicht', () => {
    for (const c of [{ valuesRef: ref('value') }, { groupsRef: ref('part') }]) {
      const m = new State();
      setFields(m, c);
      assertEqual(m.hasContent(), true, JSON.stringify(c));
    }
    const v = new State();
    v.exampleWorksheetId = 'x';
    v.charts = { z: { title: 'T' }, mr: { showTitle: true } };
    assertEqual(v.hasContent(), false);
  });
});

suite('short-run-chart: Model — instance.set', () => {
  test('Bezüge: setzen und mit null leeren; falsche Form abgelehnt, Stand unverändert', () => {
    for (const k of ['valuesRef', 'groupsRef']) {
      const m = new State();
      setFields(m, { [k]: ref('value') });
      assertDeepEqual(plain(m[k]), ref('value'), k);
      for (const v of ['value', 5, { columnId: 'x' }]) {
        assertThrows(() => setFields(m, { [k]: v }), undefined, `${k} ${JSON.stringify(v)}`);
        assertDeepEqual(plain(m[k]), ref('value'), `${k} ${JSON.stringify(v)}`);
      }
      setFields(m, { [k]: null });
      assertEqual(m[k], null, k);
    }
  });

  test('unbekanntes Feld abgelehnt', () => {
    assertThrows(() => setFields(new State(), { foo: 1 }), /unknown field/);
    assertThrows(() => setFields(new State(), { pickableColumns: {} }), /unknown field/);
  });
});

suite('short-run-chart: Model — Invariante chartKeys', () => {
  test('z und mr werden angenommen', () => {
    const m = new State();
    m.charts = { z: { title: 'Z' }, mr: { title: 'M' } };
    assertDeepEqual(plain(m.charts), { z: { title: 'Z' }, mr: { title: 'M' } });
  });

  test('fremder Schlüssel abgelehnt mit invariant chartKeys, Stand unverändert', () => {
    const m = new State();
    m.charts = { z: { title: 'Z' }, mr: { title: 'M' } };
    for (const k of ['z#2', 'mr#2', 'control-chart', 'x']) {
      let err = null;
      try { m.charts = { z: { title: 'Z' }, [k]: { title: 'alt' } }; } catch (e) { err = e; }
      assert(err, `${k} abgelehnt`);
      assertEqual(err.invariant, 'chartKeys', k);
      assertDeepEqual(Object.keys(m.charts), ['z', 'mr'], k);
    }
  });

  test('Reparatur beim Laden verwirft fremde Schlüssel, auch streng (nur Ansichtsfeld)', () => {
    const json = { _schema: { version: '1.0' }, charts: { z: { title: 'a' }, mr: { showTitle: true }, 'z#2': { title: 'b' }, foo: {} } };
    assertDeepEqual(plain(State.fromJSON(json, { repair: true }).charts), { z: { title: 'a' }, mr: { showTitle: true } });
    assertDeepEqual(plain(State.fromJSON(json).charts), { z: { title: 'a' }, mr: { showTitle: true } });
  });
});

suite('short-run-chart: Model — Ableitungen', () => {
  test('result: Altprojekt gleich dem Literal', () => {
    assertDeepClose(derived(legacy(), ['result'], LEGACY_SRC).result, LEGACY_RESULT);
  });

  test('result: Beispiel und CSV gleich den Literalen', () => {
    assertDeepClose(derived(withRefs('messwert', 'setup'), ['result']).result, EXAMPLE_RESULT);
    assertDeepClose(derived(withRefs('value', 'part'), ['result']).result, CSV_RESULT);
  });

  test('result: null ohne eine Spalte, bei gelöschter Spalte (je Spalte), unter vier Paaren; die Bezüge bleiben', () => {
    assertEqual(derived(new State(), ['result']).result, null);
    const one = new State();
    setFields(one, { valuesRef: ref('value') });
    assertEqual(derived(one, ['result']).result, null);
    for (const [v, g] of [['gone', 'part'], ['value', 'gone'], ['kurz', 'kurzG']]) {
      const m = withRefs(v, g);
      const d = derived(m, ['result', 'points', 'warningMsg']);
      assertEqual(d.result, null, `${v}/${g}`);
      assertDeepEqual(d.points, [], `${v}/${g}`);
      assertEqual(d.warningMsg, null, `${v}/${g}`);
      assertDeepEqual(plain(m.valuesRef), ref(v), 'der Bezug bleibt');
      assertDeepEqual(plain(m.groupsRef), ref(g), 'der Bezug bleibt');
    }
  });

  test('Text „2,5“ in der Messwertspalte zählt nicht; Teile als Zahl werden Text', () => {
    const r = derived(withRefs('txt', 'numG'), ['result']).result;
    assertEqual(r.n, 5);
    assertDeepEqual(r.groups.map((g) => [g.group, g.count]), [['1', 2], ['2', 3]]);
  });

  test('points: je Paar, mr null in Zeile 0, leer ohne Ergebnis; Massenableitung', () => {
    const p = derived(legacy(), ['points'], LEGACY_SRC).points;
    assertEqual(p.length, 20);
    assertDeepEqual(Object.keys(p[0]), ['z', 'mr', 'signalZ', 'signalMR']);
    assertEqual(p[0].mr, null);
    assertDeepEqual(p.flatMap((r, i) => (r.signalZ ? [i] : [])), [16]);
    assertDeepEqual(p.flatMap((r, i) => (r.signalMR ? [i] : [])), [16, 17]);
    assertDeepEqual(derived(new State(), ['points']).points, []);
    assertDeepEqual([...State.schema.derivedBulk], ['points']);
  });

  test('warningMsg: übersetzter Hinweis bei übersprungenen Werten, sonst null', () => {
    assertEqual(derived(legacy(), ['warningMsg'], LEGACY_SRC).warningMsg, '«warningSkipped:{"count":1}»');
    assertEqual(derived(withRefs('value', 'part'), ['warningMsg']).warningMsg, '«warningSkipped:{"count":1}»');
    assertEqual(derived(withRefs('messwert', 'setup'), ['warningMsg']).warningMsg, null);
    assertEqual(derived(new State(), ['warningMsg']).warningMsg, null);
  });

  test('activeColumnSlots: die beiden Spaltenfelder', () => {
    assertDeepEqual(derived(new State(), ['activeColumnSlots']).activeColumnSlots, ['valuesRef', 'groupsRef']);
    assertDeepEqual(derived(legacy(), ['activeColumnSlots'], LEGACY_SRC).activeColumnSlots, ['valuesRef', 'groupsRef']);
  });

  test('alle Ableitungen zusammen rufen die Engine einmal; Ansichtsfelder rechnen nicht neu', () => {
    const m = withRefs('messwert', 'setup');
    const n = engineRuns();
    const d = evaluateDerived(m, SRC, undefined, T);
    assertDeepEqual(Object.keys(d).sort(), ['activeColumnSlots', 'points', 'result', 'warningMsg']);
    assertEqual(engineRuns(), n + 1);
    evaluateDerived(m, SRC, undefined, T);
    assertEqual(engineRuns(), n + 1, 'erneutes Lesen rechnet nicht');
    m.charts = { z: { title: 'X' }, mr: { showTitle: true } };
    m.exampleWorksheetId = 'ws-9';
    evaluateDerived(m, SRC, undefined, T);
    assertEqual(engineRuns(), n + 1, 'Diagramm-Editor und Beispielblatt rechnen nicht');
    setFields(m, { groupsRef: ref('part') });
    evaluateDerived(m, SRC, undefined, T);
    assertEqual(engineRuns(), n + 2, 'Wechsel der Teilespalte rechnet einmal');
    setFields(m, { valuesRef: ref('value') });
    evaluateDerived(m, SRC, undefined, T);
    assertEqual(engineRuns(), n + 3, 'Wechsel der Messwertspalte rechnet einmal');
  });

  test('alle Ableitungen ohne Wurf, auch ohne Übersetzer, solange kein Hinweis entsteht', () => {
    const d = evaluateDerived(withRefs('messwert', 'setup'), SRC);
    assert(d.result && !('error' in d.result), 'result ohne Fehler');
    assertEqual(d.warningMsg, null);
  });
});
