/**
 * Regelkarte für Variablen (I-MR, X̄-R, X̄-S): Migration der Altform
 * (domain/migrations.js) samt Altprojekten, Beispielen und der Vorbelegung
 * aus `chart-suggestion`. Die Fälle des alten `fromJSON` stammen aus dem
 * Unit-Test der Altform.
 */
import { suite, test, assert, assertEqual, assertDeepEqual, assertTrue } from '../../test-utils.js';
import { State } from '../../../js/modules/control-chart/domain/model.js';
import { from0 } from '../../../js/modules/control-chart/domain/migrations.js';
import { buildPrefill } from '../../../js/modules/chart-suggestion/domain/prefill.js';
import { evaluateDerived } from '../../../js/core/derived.js';
import { sheetSource } from '../../helpers/sheet-source.js';
import {
  XBAR_R_STABLE_RESULT, XBAR_S_STABLE_RESULT, CAPABILITY_RESULT, IMR_SHIFT_RESULT, IMR_TREND_RESULT,
  IMR_ANNOTATED_FROZEN_RESULT, HUBSCHRAUBER_RESULT,
} from './analyze.test.js';

const plain = (v) => JSON.parse(JSON.stringify(v));
/** Laden wie der Kern (`loadModule`): mit Reparatur. */
const load = (json) => State.fromJSON(json, { repair: true });
/** Übersetzer-Stub. */
const T = (k) => `«${k}»`;

const WS = '6b7c8d9e-0f1a-4b2c-9d3e-4f5a6b7c8d9e';
const DURCHMESSER = { instanceId: WS, sheetId: 'sheet_1', columnId: 'col_src_durchmesser' };
const LAENGE = { instanceId: WS, sheetId: 'sheet_1', columnId: 'col_src_laenge' };

/** Instanz der Altprojekt-Fixture I-MR (Stand des Altmoduls, ohne `_schema`). */
export const LEGACY = {
  chartTypeId: 'i-mr', subgroupSize: 1, columnRef: DURCHMESSER, baselineCount: 20, stagesText: '',
  usl: 10.5, lsl: 9.4, enabledRules: [1, 2, 5, 6],
  annotations: { 20: { comment: 'Werkzeugwechsel', excluded: true }, 28: { comment: 'Messung wiederholt', excluded: false } },
  frozenLimits: {
    chartTypeId: 'i-mr', subgroupSize: 1, columnRef: DURCHMESSER, baselineEnd: 20,
    primary: { cl: 10, ucl: 10.3, lcl: 9.7, sigma: 0.1 },
    secondary: { cl: 0.1128, ucl: 0.3685, lcl: 0, sigma: 0.0853 },
    excludedIndices: [],
  },
  exampleWorksheetId: null,
};

/** Instanz der Altprojekt-Fixture X̄-R (Stufe mitten in einer Untergruppe, ohne Phase II). */
export const LEGACY_XBAR = {
  chartTypeId: 'xbar-r', subgroupSize: 5, columnRef: LAENGE, baselineCount: null, stagesText: '22',
  usl: 11.2, lsl: 9.6, enabledRules: [1, 2], annotations: {}, frozenLimits: null, exampleWorksheetId: null,
};

/** Die Vorgaben nach dem Laden (ohne `_schema`). */
const DEFAULTS = {
  chartTypeId: 'i-mr', subgroupSize: 1, columnRef: null, baselineCount: null, stagesText: '', usl: null, lsl: null,
  enabledRules: [1], annotations: {}, frozenLimits: null, exampleWorksheetId: null, charts: {},
};
/** @param {any} m */
const stored = (m) => { const { _schema, ...rest } = plain(m.toJSON()); return rest; };

suite('control-chart: Migration — Altprojekte', () => {
  test('Altfixture I-MR: alle Felder übernommen, Teilkarten leer', () => {
    const m = load(LEGACY);
    assertDeepEqual(stored(m), { ...plain(LEGACY), charts: {} });
    assertEqual(m.hasContent(), true);
  });

  test('Altfixture X̄-R: alle Felder übernommen', () => {
    assertDeepEqual(stored(load(LEGACY_XBAR)), { ...plain(LEGACY_XBAR), charts: {} });
  });

  test('die Altfixtures laden ohne Reparatur auch streng', () => {
    for (const l of [LEGACY, LEGACY_XBAR]) {
      assertDeepEqual(plain(State.fromJSON(l).toJSON()), plain(load(l).toJSON()));
    }
  });

  test('Fremdschlüssel entfallen', () => {
    const out = from0({ ...LEGACY, foo: 1, result: { n: 3 }, sourceWorksheetFile: 'x.json', pickableColumns: {}, chartEdits: {} });
    assertDeepEqual(Object.keys(out).sort(), ['annotations', 'baselineCount', 'chartTypeId', 'columnRef', 'enabledRules',
      'frozenLimits', 'lsl', 'stagesText', 'subgroupSize', 'usl'], 'exampleWorksheetId null entfällt');
    const json = plain(load({ ...LEGACY, foo: 1, sourceWorksheetFile: 'x.json' }).toJSON());
    for (const k of ['foo', 'sourceWorksheetFile', 'result']) assertEqual(k in json, false, k);
  });
});

suite('control-chart: Migration — Fälle des alten fromJSON', () => {
  test('{}, null und undefined ergeben die Vorgaben', () => {
    for (const v of [{}, null, undefined]) {
      const m = load(v);
      assertDeepEqual(stored(m), DEFAULTS, String(v));
      assertEqual(m.hasContent(), false, String(v));
    }
  });

  test('defekte Felder fallen je Feld auf die Vorgabe', () => {
    const m = load({
      chartTypeId: 'nope', subgroupSize: -3, columnRef: 'x', baselineCount: 'abc', stagesText: 42,
      usl: 'high', lsl: NaN, enabledRules: 'all', annotations: [1, 2], frozenLimits: 'yes', exampleWorksheetId: 7,
    });
    assertDeepEqual(stored(m), DEFAULTS);
  });

  test('Rundweg ist verlustfrei', () => {
    for (const s of [LEGACY, LEGACY_XBAR, { ...LEGACY, exampleWorksheetId: 'ws-7' }, {}]) {
      const m = load(s);
      assertDeepEqual(plain(load(plain(m.toJSON())).toJSON()), plain(m.toJSON()), JSON.stringify(s).slice(0, 40));
    }
    assertEqual(load(plain(load({ ...LEGACY, exampleWorksheetId: 'ws-7' }).toJSON())).exampleWorksheetId, 'ws-7');
  });

  test('chartTypeId: bekannte Typen bleiben, sonst I-MR', () => {
    for (const t of ['i-mr', 'xbar-r', 'xbar-s']) assertEqual(load({ chartTypeId: t, subgroupSize: 5 }).chartTypeId, t);
    for (const t of ['p', 'XBAR-R', 5, null]) assertEqual(load({ chartTypeId: t }).chartTypeId, 'i-mr', String(t));
  });

  test('enabledRules: bekannte Ids, ohne Doppelte, sortiert; [] bleibt; keine Liste → [1]', () => {
    assertDeepEqual(plain(load({ enabledRules: [5, 1, 1, 99, 3] }).enabledRules), [1, 3, 5]);
    assertDeepEqual(plain(load({ enabledRules: [8, '2', 2, null, 0, 4.5] }).enabledRules), [2, 8], 'fremde einzeln');
    assertDeepEqual(plain(load({ enabledRules: [] }).enabledRules), []);
    assertDeepEqual(plain(load({ enabledRules: { 1: true } }).enabledRules), [1]);
  });

  test('usl/lsl: endliche Zahlen bleiben, sonst null', () => {
    const m = load({ usl: 10.5, lsl: -2 });
    assertEqual(m.usl, 10.5);
    assertEqual(m.lsl, -2);
    for (const v of [Infinity, NaN, '24,5', '24.5', null]) {
      assertEqual(load({ usl: v }).usl, null, String(v));
      assertEqual(load({ lsl: v }).lsl, null, String(v));
    }
  });

  test('stagesText: Text bleibt (auch ungültiger), sonst leer', () => {
    assertEqual(load({ stagesText: '12, 25' }).stagesText, '12, 25');
    assertEqual(load({ stagesText: 'abc' }).stagesText, 'abc');
    assertEqual(load({ stagesText: [12] }).stagesText, '');
  });

  test('columnRef: wie das alte Laden, Werte als Text; unvollständig oder leer → null', () => {
    assertDeepEqual(plain(load({ columnRef: DURCHMESSER }).columnRef), DURCHMESSER);
    assertDeepEqual(plain(load({ columnRef: { instanceId: 1, sheetId: 2, columnId: 3 } }).columnRef),
      { instanceId: '1', sheetId: '2', columnId: '3' });
    for (const v of ['nope', 5, [], { instanceId: 'i', sheetId: 's' }, { instanceId: '', sheetId: 's', columnId: 'c' }]) {
      assertEqual(load({ columnRef: v }).columnRef, null, JSON.stringify(v));
    }
  });

  test('exampleWorksheetId: Text bleibt, sonst entfällt es', () => {
    assertEqual(load({ exampleWorksheetId: 'ws-1' }).exampleWorksheetId, 'ws-1');
    for (const v of [5, {}, true]) {
      assertEqual(load({ exampleWorksheetId: v }).exampleWorksheetId, null, String(v));
      assertEqual('exampleWorksheetId' in from0({ exampleWorksheetId: v }), false, String(v));
    }
  });
});

suite('control-chart: Migration — Untergruppe und Phase I', () => {
  test('Untergruppe außerhalb des Bereichs wird in den Bereich des Typs geklemmt', () => {
    assertEqual(load({ chartTypeId: 'i-mr', subgroupSize: 5 }).subgroupSize, 1, 'I-MR mit 5 → 1');
    assertEqual(load({ chartTypeId: 'xbar-r', subgroupSize: 30 }).subgroupSize, 10, 'X̄-R mit 30 → 10');
    assertEqual(load({ chartTypeId: 'xbar-s', subgroupSize: 30 }).subgroupSize, 25, 'X̄-S mit 30 → 25');
    assertEqual(load({ chartTypeId: 'xbar-r', subgroupSize: 1 }).subgroupSize, 2, 'X̄-R mit 1 → 2');
    assertEqual(load({ chartTypeId: 'xbar-s', subgroupSize: 8 }).subgroupSize, 8, 'im Bereich bleibt');
  });

  test('Untergruppe nicht ganzzahlig wird gerundet, ungültig wird die Vorgabe des Typs', () => {
    assertEqual(load({ chartTypeId: 'xbar-r', subgroupSize: 4.6 }).subgroupSize, 5);
    assertEqual(load({ chartTypeId: 'xbar-r', subgroupSize: 4.4 }).subgroupSize, 4);
    for (const v of [0, -2, NaN, '5', null]) {
      assertEqual(load({ chartTypeId: 'xbar-r', subgroupSize: v }).subgroupSize, 2, `X̄-R ${String(v)}`);
      assertEqual(load({ chartTypeId: 'i-mr', subgroupSize: v }).subgroupSize, 1, `I-MR ${String(v)}`);
    }
  });

  test('baselineCount: über 0 aufgerundet, sonst null (alle)', () => {
    assertEqual(load({ baselineCount: 20 }).baselineCount, 20);
    assertEqual(load({ baselineCount: 2.5 }).baselineCount, 3);
    assertEqual(load({ baselineCount: 0.4 }).baselineCount, 1);
    for (const v of [0, -4, Infinity, NaN, '20', null]) assertEqual(load({ baselineCount: v }).baselineCount, null, String(v));
  });
});

suite('control-chart: Migration — Anmerkungen', () => {
  test('Einträge mit Punktschlüssel und Objektwert bleiben, Kommentar als Text, Ausschluss als Wahrheitswert', () => {
    const m = load({ annotations: {
      0: { comment: 'a', excluded: true }, 7: { comment: 42 }, 9: { excluded: 1 }, 12: {},
    } });
    assertDeepEqual(plain(m.annotations), {
      0: { comment: 'a', excluded: true }, 7: { comment: '42', excluded: false },
      9: { comment: '', excluded: true }, 12: { comment: '', excluded: false },
    });
  });

  test('Text-, Bruch-, negative und nicht normale Schlüssel, null und Nicht-Objekte entfallen einzeln', () => {
    const m = load({ annotations: {
      x: { comment: 'a' }, '2.5': { comment: 'b' }, '-1': { comment: 'c' }, '04': { comment: 'd' }, ' 5': { comment: 'e' },
      6: null, 8: 'text', 10: 3, 11: { comment: 'bleibt', excluded: false },
    } });
    assertDeepEqual(plain(m.annotations), { 11: { comment: 'bleibt', excluded: false } });
  });

  test('kein Objekt oder Liste → keine Anmerkungen', () => {
    for (const v of [null, 'x', 5, [{ comment: 'a' }]]) assertDeepEqual(plain(load({ annotations: v }).annotations), {}, String(v));
  });
});

suite('control-chart: Migration — eingefrorene Grenzen', () => {
  const FROZEN = LEGACY.frozenLimits;

  test('vollständige Grenzen bleiben unverändert', () => {
    assertDeepEqual(plain(load({ frozenLimits: FROZEN }).frozenLimits), plain(FROZEN));
  });

  test('ohne primary oder secondary, mit fremdem Typ oder ohne Untergruppe → null', () => {
    const { primary, secondary, ...rest } = FROZEN;
    for (const v of [
      { ...rest, secondary }, { ...rest, primary }, { ...FROZEN, primary: null }, { ...FROZEN, secondary: 5 },
      { ...FROZEN, chartTypeId: 'p' }, { ...FROZEN, chartTypeId: undefined }, { ...FROZEN, subgroupSize: 0 },
      { ...FROZEN, subgroupSize: 'eins' }, 'frozen', 5, true,
    ]) {
      assertEqual(load({ frozenLimits: v }).frozenLimits, null, JSON.stringify(v).slice(0, 60));
    }
  });

  test('ohne columnRef: null (die Grenzen gelten weiter)', () => {
    const { columnRef: _c, ...rest } = FROZEN;
    const m = load({ ...LEGACY, frozenLimits: rest });
    assertEqual(m.frozenLimits.columnRef, null);
    assertEqual(load({ frozenLimits: { ...FROZEN, columnRef: { instanceId: 'i' } } }).frozenLimits.columnRef, null);
  });

  test('nicht endliche oder fehlende Grenze → null, die übrigen bleiben', () => {
    const m = load({ frozenLimits: { ...FROZEN, primary: { cl: 10, ucl: null, lcl: 'x', sigma: Infinity }, secondary: { cl: 0.1 } } });
    assertDeepEqual(plain(m.frozenLimits.primary), { cl: 10, ucl: null, lcl: null, sigma: null });
    assertDeepEqual(plain(m.frozenLimits.secondary), { cl: 0.1, ucl: null, lcl: null, sigma: null });
  });

  test('baselineEnd endlich oder null; excludedIndices nur ganze Zahlen ab 0; Untergruppe gerundet', () => {
    const m = load({ frozenLimits: { ...FROZEN, baselineEnd: 'x', excludedIndices: [3, -1, 2.5, '4', 7], subgroupSize: 4.6 } });
    assertEqual(m.frozenLimits.baselineEnd, null);
    assertDeepEqual(plain(m.frozenLimits.excludedIndices), [3, 7]);
    assertEqual(m.frozenLimits.subgroupSize, 5);
    assertDeepEqual(plain(load({ frozenLimits: { ...FROZEN, excludedIndices: 'x' } }).frozenLimits.excludedIndices), []);
  });

  test('Fremdschlüssel in den Grenzen entfallen', () => {
    const m = load({ frozenLimits: { ...FROZEN, foo: 1, primary: { ...FROZEN.primary, extra: 2 } } });
    assertDeepEqual(plain(m.frozenLimits), plain(FROZEN));
  });
});

suite('control-chart: Migration — Vorbelegung aus chart-suggestion', () => {
  test('{ chartTypeId: i-mr, columnRef } → Bezug, I-MR, Untergruppe 1, sonst Vorgaben', () => {
    const cont = { id: 'a', name: 'a', role: 'continuous', type: 'numeric', values: Array.from({ length: 30 }, (_, i) => i + 1), roleConfirmed: false };
    const p = buildPrefill('control-chart', [cont], 'ws', 's');
    assertEqual(p.target, 'control-chart');
    assertDeepEqual(Object.keys(p.state).sort(), ['chartTypeId', 'columnRef']);
    const m = State.fromJSON(p.state);
    assertDeepEqual(stored(m), { ...DEFAULTS, columnRef: { instanceId: 'ws', sheetId: 's', columnId: 'a' } });
    assertEqual(m.hasContent(), true);
  });
});

/**
 * Die Beispiele des Moduls: Datei unter `resources/examples/projects/`,
 * Arbeitsblatt (`shared/…` unter `examples/`, sonst in der Modulablage),
 * Blatt, Spalte und das Ergebnis der Altform.
 */
const EXAMPLES = [
  ['control-chart-xbar-r-stable', 'worksheets/spc-subgroups-stable.json', 'sheet-xbar-r', 'c-diameter', XBAR_R_STABLE_RESULT],
  ['control-chart-xbar-s-stable', 'worksheets/spc-subgroups-stable.json', 'sheet-xbar-r', 'c-diameter', XBAR_S_STABLE_RESULT],
  ['control-chart-capability', 'worksheets/spc-subgroups-stable.json', 'sheet-xbar-r', 'c-diameter', CAPABILITY_RESULT],
  ['control-chart-imr-shift', 'shared/worksheets/spc-imr-shift.json', 'sheet-imr-shift', 'c-value', IMR_SHIFT_RESULT],
  ['control-chart-imr-trend', 'worksheets/spc-imr-trend.json', 'sheet-imr-trend', 'c-value', IMR_TREND_RESULT],
  ['control-chart-imr-annotated-frozen', 'shared/worksheets/spc-imr-shift.json', 'sheet-imr-shift', 'c-value', IMR_ANNOTATED_FROZEN_RESULT],
  ['control-chart-hubschrauber-flyer', 'shared/worksheets/hubschrauber-flyer.json', 'sheet-hubschrauber-confirmation', 'c-flugzeit', HUBSCHRAUBER_RESULT],
];

const OWN = '../../../js/modules/control-chart/resources/examples/';

async function fetchJSON(relPath) {
  const url = relPath.startsWith('shared/') ? `../../../examples/${relPath}` : `${OWN}${relPath}`;
  const res = await fetch(new URL(url, import.meta.url), { cache: 'no-cache' });
  assertTrue(res.ok, `could not fetch ${relPath}: HTTP ${res.status}`);
  return res.json();
}

suite('control-chart: Migration — Beispiele', () => {
  for (const [id, file, sheetId, columnId, expected] of EXAMPLES) {
    test(`${id}: lädt ohne Reparatur, gleich der neuen Form, Ergebnis wie die Altform`, async () => {
      const shipped = await fetchJSON(`projects/${id}.json`);
      assertDeepEqual(shipped._schema, { version: '1.0' }, 'ausgeliefert in der neuen Form');
      const { sourceWorksheetFile, _schema, ...rest } = shipped;
      assertEqual(sourceWorksheetFile, file);
      const old = { ...rest, sourceWorksheetFile };
      const neu = { _schema, ...rest };
      assertDeepEqual(plain(State.fromJSON(neu).toJSON()), plain(load(old).toJSON()), 'neue Datei = Altform');
      assertDeepEqual(plain(State.fromJSON(old).toJSON()), plain(load(old).toJSON()), 'ohne Reparatur');
      const ws = await fetchJSON(file);
      const values = ws.sheets.find((s) => s.id === sheetId).state.columns.find((c) => c.id === columnId).values;
      const src = sheetSource({ [columnId]: values }, { instanceId: '__source__', sheetId });
      const m = load(old);
      const d = evaluateDerived(m, src, ['result', 'points'], T);
      assertDeepEqual(d.result, expected);
      assertEqual(d.points.length, expected.n);
    });
  }

  test('annotated-frozen: Anmerkung und Grenzen mit Bezug auf das Beispielblatt', async () => {
    const m = load(await fetchJSON('projects/control-chart-imr-annotated-frozen.json'));
    assertDeepEqual(plain(m.annotations), { 13: { comment: 'Werkzeugwechsel / tool change', excluded: true } });
    assert(m.frozenLimits !== null);
    assertDeepEqual(plain(m.frozenLimits.columnRef), { instanceId: '__source__', sheetId: 'sheet-imr-shift', columnId: 'c-value' });
    assertDeepEqual(plain(m.frozenLimits.excludedIndices), [13]);
  });
});
