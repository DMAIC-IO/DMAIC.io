/**
 * Transformierte I-MR-Karte: Model (domain/model.js) — Schema, Vorgaben,
 * Schreibwege, das Kommando `setLambdaMode` und die Ableitungen.
 */
import { suite, test, assertEqual, assertDeepEqual, assertThrows } from '../../test-utils.js';
import { State, LAMBDA_MODES } from '../../../js/modules/transformed-imr-chart/domain/model.js';
import { evaluateDerived } from '../../../js/core/derived.js';
import { setFields } from '../../../js/core/model.js';
import controlChart from '../../../js/widgets/control-chart/schema.js';
import { sheetSource } from '../../helpers/sheet-source.js';

const plain = (v) => JSON.parse(JSON.stringify(v));
const ref = (c) => ({ instanceId: 'ws1', sheetId: 's1', columnId: c });
const T = (k) => `«${k}»`;
const SRC = sheetSource({ a: [1, 2, 3, 4, 5] });

/** @param {any} m @param {string[]} [names] */
const derived = (m, names) => evaluateDerived(m, SRC, names, T);

suite('transformed-imr-chart: Model — Schema und Vorgaben', () => {
  test('Spaltenfeld: numerisch, mindestens fünf Werte, nullbar', () => {
    const c = State.schema.fields.columnRef;
    assertDeepEqual([...c.types], ['numeric']);
    assertEqual(c.minCount, 5);
    assertEqual(c.nullable, true);
  });

  test('LAMBDA_MODES gleich dem Schema-Literal', () => {
    assertDeepEqual([...State.schema.fields.lambdaMode.values], [...LAMBDA_MODES]);
    assertDeepEqual([...State.schema.commands.setLambdaMode.params.mode.values], [...LAMBDA_MODES]);
  });

  test('Felder und Ansicht', () => {
    assertDeepEqual(Object.keys(State.schema.fields).sort(), ['columnRef', 'lambdaManual', 'lambdaMode']);
    assertDeepEqual(Object.keys(State.schema.view).sort(), ['chart', 'exampleWorksheetId']);
    assertEqual(State.schema.view.chart.kind, controlChart.edits().kind);
  });

  test('Vorgaben und kein Inhalt', () => {
    const m = new State();
    assertEqual(m.columnRef, null);
    assertEqual(m.lambdaMode, 'auto');
    assertEqual(m.lambdaManual, 0);
    assertEqual(m.exampleWorksheetId, null);
    assertDeepEqual(plain(m.chart), {});
    assertEqual(m.hasContent(), false);
  });

  test('hasContent: Spalte, Modus manual oder λ ≠ 0 zählen, Ansichtsfelder nicht', () => {
    const a = new State(); a.columnRef = ref('a');
    assertEqual(a.hasContent(), true);
    const b = new State(); b.lambdaMode = 'manual';
    assertEqual(b.hasContent(), true);
    const c = new State(); c.lambdaManual = 0.5;
    assertEqual(c.hasContent(), true);
    const d = new State(); d.exampleWorksheetId = 'x';
    assertEqual(d.hasContent(), false);
  });
});

suite('transformed-imr-chart: Model — instance.set', () => {
  test('lambdaMode: unbekannter Modus abgelehnt, Stand unverändert', () => {
    const m = new State();
    for (const v of ['bogus', '', 1, null]) {
      assertThrows(() => setFields(m, { lambdaMode: v }), undefined, String(v));
      assertEqual(m.lambdaMode, 'auto', String(v));
    }
    assertDeepEqual(setFields(m, { lambdaMode: 'manual' }), { lambdaMode: 'manual' });
    assertEqual(m.lambdaMode, 'manual');
  });

  test('lambdaManual: unlesbarer Text und Nichtzahl abgelehnt, jede endliche Zahl angenommen', () => {
    const m = new State();
    for (const v of ['abc', '0,5', '', true, NaN, Infinity, null]) {
      assertThrows(() => setFields(m, { lambdaManual: v }), undefined, String(v));
      assertEqual(m.lambdaManual, 0, String(v));
    }
    for (const v of [0.5, -3, 3, 12.75, 0]) {
      setFields(m, { lambdaManual: v });
      assertEqual(m.lambdaManual, v, String(v));
    }
  });

  test('lambdaManual: Zahl als Text normalisiert der Kern zur Zahl', () => {
    const m = new State();
    assertDeepEqual(setFields(m, { lambdaManual: '0.5' }), { lambdaManual: 0.5 });
    assertEqual(m.lambdaManual, 0.5);
  });

  test('lambdaManual ist auch im Modus auto schreibbar (wirkt dort nicht)', () => {
    const m = new State();
    assertEqual(m.lambdaMode, 'auto');
    assertDeepEqual(setFields(m, { lambdaManual: 0.7 }), { lambdaManual: 0.7 });
    assertEqual(m.lambdaManual, 0.7);
    assertEqual(m.lambdaMode, 'auto');
  });

  test('columnRef setzen und leeren', () => {
    const m = new State();
    setFields(m, { columnRef: ref('a') });
    assertDeepEqual(plain(m.columnRef), ref('a'));
    setFields(m, { columnRef: null });
    assertEqual(m.columnRef, null);
  });
});

suite('transformed-imr-chart: Model — setLambdaMode', () => {
  test('auto → manual mit λ übernimmt das λ', () => {
    const m = new State();
    m.setLambdaMode({ mode: 'manual', lambda: 0.35 });
    assertEqual(m.lambdaMode, 'manual');
    assertEqual(m.lambdaManual, 0.35);
  });

  test('auto → manual ohne λ (oder λ null) lässt den gespeicherten Wert stehen', () => {
    const a = State.fromJSON({ lambdaManual: 0.85 });
    a.setLambdaMode({ mode: 'manual' });
    assertEqual(a.lambdaMode, 'manual');
    assertEqual(a.lambdaManual, 0.85);
    const b = State.fromJSON({ lambdaManual: 0.85 });
    b.setLambdaMode({ mode: 'manual', lambda: null });
    assertEqual(b.lambdaManual, 0.85);
  });

  test('manual → auto lässt lambdaManual stehen, auch wenn ein λ mitkommt', () => {
    const m = State.fromJSON({ lambdaMode: 'manual', lambdaManual: 0.25 });
    m.setLambdaMode({ mode: 'auto', lambda: 0.9 });
    assertEqual(m.lambdaMode, 'auto');
    assertEqual(m.lambdaManual, 0.25);
  });

  test('über execute erreichbar wie für Agenten', () => {
    const m = new State();
    m.execute({ type: 'setLambdaMode', mode: 'manual', lambda: 0.5 });
    assertEqual(m.lambdaMode, 'manual');
    assertEqual(m.lambdaManual, 0.5);
  });

  test('unbekannter Modus, fehlender Modus und unlesbares λ abgelehnt, Stand unverändert', () => {
    const m = State.fromJSON({ lambdaManual: 0.85 });
    assertThrows(() => m.setLambdaMode({ mode: 'bogus', lambda: 0.5 }), /invalid mode/);
    assertThrows(() => m.setLambdaMode({ mode: 'manual', lambda: 'abc' }), /lambda/);
    assertThrows(() => m.setLambdaMode({ lambda: 0.5 }), /missing argument "mode"/);
    assertEqual(m.lambdaMode, 'auto');
    assertEqual(m.lambdaManual, 0.85);
  });
});

suite('transformed-imr-chart: Model — Ableitungen', () => {
  test('activeParams je Modus', () => {
    assertDeepEqual(derived(new State(), ['activeParams']).activeParams, ['lambdaMode']);
    const m = new State(); m.lambdaMode = 'manual';
    assertDeepEqual(derived(m, ['activeParams']).activeParams, ['lambdaMode', 'lambdaManual']);
  });

  test('activeColumnSlots ist das schreibbare Feld', () => {
    assertDeepEqual(derived(new State(), ['activeColumnSlots']).activeColumnSlots, ['columnRef']);
  });

  test('nur die zwei billigen Ableitungen, ohne Wurf', () => {
    const d = evaluateDerived(State.fromJSON({ columnRef: ref('a') }), SRC);
    assertDeepEqual(Object.keys(d).sort(), ['activeColumnSlots', 'activeParams']);
  });
});
