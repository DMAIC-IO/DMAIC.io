/**
 * Tests for modules/unit-converter/domain/model.js — Schema und Vorgaben,
 * Größenarten gleich der Tabelle, die Invarianten (streng, mit Reparatur, beim
 * Schreiben), alle Kommandos samt Ablehnungen, `hasContent`, die Ableitungen
 * und die Lesefläche. Dazu die Fälle der alten Suite.
 */
import { suite, test, assertEqual, assertDeepEqual, assertAlmostEqual, assertThrows, assertTrue } from '../../test-utils.js';
import { State, CATEGORY_KEYS } from '../../../js/modules/unit-converter/domain/model.js';
import { CATEGORIES, TIMEZONES } from '../../../js/modules/unit-converter/domain/units.js';
import { setModelName } from '../../../js/core/model.js';
import { todayISO } from '../../../js/core/local-date.js';
import { evaluateDerived } from '../../../js/core/derived.js';
import { schemaAgentEntry, readSchemaModel } from '../../../js/core/agent/agent-schema.js';

setModelName(State, 'unit-converter');

const SCHEMA = { _schema: { name: 'unit-converter', version: '1.0' } };
const plain = (v) => JSON.parse(JSON.stringify(v));
/** @param {object} m @param {string} name @returns {any} */
const derived = (m, name) => evaluateDerived(m, /** @type {any} */ (undefined), [name])[name];
/** @param {object} j */
const repaired = (j) => {
  const fields = [];
  const m = State.fromJSON(plain(j), { repair: true, onRepair: (f) => fields.push(f) });
  return { m, fields };
};
/** Lesefläche ohne Mount. @param {object} m */
const read = (m) => readSchemaModel(schemaAgentEntry(State), m, undefined, evaluateDerived(m, /** @type {any} */ (undefined)));

/**
 * `new Date()` ohne Argument liefert `iso`, solange `fn` läuft.
 * @param {string} iso @param {() => void} fn
 */
function atTime(iso, fn) {
  const Orig = globalThis.Date;
  const fixed = Orig.parse(iso);
  globalThis.Date = class extends Orig {
    constructor(...args) { if (args.length === 0) super(fixed); else super(...args); }
  };
  try { fn(); } finally { globalThis.Date = Orig; }
}

/** @param {() => void} fn @returns {any} der geworfene Fehler */
function thrown(fn) {
  try { fn(); } catch (err) { return err; }
  throw new Error('expected a throw');
}

suite('unit-converter Model: Schema und Vorgaben', () => {
  test('Größenarten gleich der Tabelle', () => {
    assertDeepEqual(CATEGORY_KEYS, Object.keys(CATEGORIES));
    assertDeepEqual(State.schema.fields.activeCat.values, Object.keys(CATEGORIES));
  });

  test('Zeitzonenpositionen 0 bis Länge der Liste − 1', () => {
    assertEqual(State.schema.fields.tzFrom.max, TIMEZONES.length - 1);
    assertEqual(State.schema.fields.tzTo.max, TIMEZONES.length - 1);
  });

  test('Vorgaben: Länge nm → µm, Berlin → UTC, 12:00, heute', () => {
    const m = new State();
    assertDeepEqual(plain(m), {
      ...SCHEMA, activeCat: 'laenge', fromUnit: 'nm', toUnit: 'um', inputVal: '',
      tzFrom: 1, tzTo: 0, tzTime: '12:00', tzDate: todayISO(),
    });
  });

  test('neue Instanz zur festen Uhr: Datum lokal, nicht UTC', () => {
    atTime('2026-06-07T12:00:00.000Z', () => {
      assertEqual(new State().tzDate, todayISO(new Date()));
    });
  });

  test('gespeicherter Stand 1.0 lädt streng, ein geleertes Datum bleibt leer', () => {
    const j = { ...SCHEMA, activeCat: 'druck', fromUnit: 'bar', toUnit: 'Pa', inputVal: '1,5', tzFrom: 13, tzTo: 4, tzTime: '06:45', tzDate: '' };
    assertDeepEqual(plain(State.fromJSON(plain(j))), j);
  });
});

suite('unit-converter Model: Invarianten', () => {
  test('unitsValid: Laden mit Reparatur wie das alte fromJSON', () => {
    const { m, fields } = repaired({ ...SCHEMA, activeCat: 'laborwerte', fromUnit: 'mgdl_ch', toUnit: 'mmoll_bz', inputVal: '', tzFrom: 1, tzTo: 0, tzTime: '12:00', tzDate: '' });
    assertEqual(m.fromUnit, 'mgdl_ch');
    assertEqual(m.toUnit, 'mmoll_ch');
    assertTrue(fields.length > 0);
  });

  test('unitsValid: unbekannte Ausgangseinheit wird die Vorgabe', () => {
    const { m } = repaired({ ...SCHEMA, activeCat: 'masse', fromUnit: 'm', toUnit: 'cm', tzDate: '' });
    assertEqual(m.fromUnit, 'mg');
    assertEqual(m.toUnit, 'g');
  });

  test('unitsValid: streng abgelehnt, beim Schreiben abgelehnt mit Text', () => {
    assertThrows(() => State.fromJSON({ ...SCHEMA, activeCat: 'masse', fromUnit: 'm', toUnit: 'cm' }));
    const m = new State();
    const err = thrown(() => { m.toUnit = 'kg'; });
    assertEqual(err.invariant, 'unitsValid');
    assertEqual(m.toUnit, 'um');
    m.toUnit = 'cm';
    assertEqual(m.toUnit, 'cm');
  });

  test('unitsValid: andere Gruppe der Laborwerte wird abgelehnt', () => {
    const m = new State();
    m.selectCategory({ catKey: 'laborwerte' });
    assertEqual(thrown(() => { m.toUnit = 'mgdl_ch'; }).invariant, 'unitsValid');
    m.toUnit = 'gl_bz';
    assertEqual(m.toUnit, 'gl_bz');
  });

  test('timeForm und dateForm: Reparatur leert, Schreiben lehnt ab', () => {
    const { m } = repaired({ ...SCHEMA, tzTime: '24:00', tzDate: '2026-02-30' });
    assertEqual(m.tzTime, '');
    assertEqual(m.tzDate, '');
    for (const v of ['00:00', '09:05', '23:59', '']) { m.tzTime = v; assertEqual(m.tzTime, v); }
    for (const v of ['24:00', '9:00', '23:60', '14:30:00']) assertEqual(thrown(() => { m.tzTime = v; }).invariant, 'timeForm', v);
    for (const v of ['2026-02-28', '2024-02-29', '']) { m.tzDate = v; assertEqual(m.tzDate, v); }
    for (const v of ['2026-02-30', '2026-13-01', '2026-1-1', '01.01.2026']) assertEqual(thrown(() => { m.tzDate = v; }).invariant, 'dateForm', v);
  });

  test('Zeitzone außerhalb der Liste: Reparatur setzt die Vorgabe, Schreiben lehnt ab', () => {
    const { m } = repaired({ ...SCHEMA, tzFrom: 23, tzTo: -1, tzDate: '' });
    assertEqual(m.tzFrom, 1);
    assertEqual(m.tzTo, 0);
    m.tzFrom = 22;
    assertEqual(m.tzFrom, 22);
    for (const v of [23, -1, 1.5, 'x']) assertThrows(() => { m.tzFrom = v; }, undefined, String(v));
    assertEqual(m.tzFrom, 22);
  });

  test('inputVal ist freier Text', () => {
    const m = new State();
    m.inputVal = 'keine Zahl';
    assertEqual(derived(m, 'result').value, null);
    assertThrows(() => { m.inputVal = 5; });
  });
});

suite('unit-converter Model: Kommandos', () => {
  test('selectCategory stellt beide Einheiten auf die Vorgaben, lehnt Unbekanntes ab', () => {
    const m = new State();
    m.selectCategory({ catKey: 'masse' });
    assertDeepEqual([m.activeCat, m.fromUnit, m.toUnit], ['masse', 'mg', 'g']);
    const err = thrown(() => m.selectCategory({ catKey: 'length' }));
    assertEqual(err.param, 'catKey');
    assertTrue(err.message.includes('invalid catKey "length"'));
    assertEqual(m.activeCat, 'masse');
  });

  test('setFromUnit zieht eine unverträgliche Zieleinheit nach', () => {
    const m = new State();
    m.selectCategory({ catKey: 'laborwerte' });
    m.setFromUnit({ unitKey: 'proz_hb' });
    assertEqual(m.fromUnit, 'proz_hb');
    assertEqual(m.toUnit, 'mmolmol_hb');
  });

  test('setFromUnit behält eine verträgliche Zieleinheit', () => {
    const m = new State();
    m.setFromUnit({ unitKey: 'm' });
    assertEqual(m.toUnit, 'um');
    m.setFromUnit({ unitKey: 'um' });
    assertEqual(m.toUnit, 'nm');
  });

  test('setFromUnit lehnt eine Einheit einer anderen Größenart ab', () => {
    const m = new State();
    m.selectCategory({ catKey: 'masse' });
    const err = thrown(() => m.setFromUnit({ unitKey: 'm' }));
    assertEqual(err.param, 'unitKey');
    assertTrue(err.message.includes('invalid unitKey "m"; allowed: mg, g, kg, t, oz, lb'));
    assertEqual(m.fromUnit, 'mg');
  });

  test('swapUnits tauscht; 100 cm → m = 1', () => {
    const m = new State();
    m.setFromUnit({ unitKey: 'm' });
    m.toUnit = 'cm';
    m.swapUnits({});
    assertDeepEqual([m.fromUnit, m.toUnit], ['cm', 'm']);
    m.inputVal = '100';
    assertAlmostEqual(derived(m, 'result').value, 1, 1e-12);
  });

  test('swapUnits bei Laborwerten bleibt in der Gruppe', () => {
    const m = new State();
    m.selectCategory({ catKey: 'laborwerte' });
    m.swapUnits({});
    assertDeepEqual([m.fromUnit, m.toUnit], ['mmoll_bz', 'mgdl_bz']);
  });

  test('swapTimezones tauscht die Positionen', () => {
    const m = new State();
    m.swapTimezones({});
    assertDeepEqual([m.tzFrom, m.tzTo], [0, 1]);
  });

  test('tzSetNow: Uhrzeit und Datum der Ausgangszone', () => {
    const m = new State();
    atTime('2026-06-07T12:00:00.000Z', () => m.tzSetNow({}));
    assertDeepEqual([m.tzTime, m.tzDate], ['14:00', '2026-06-07']);
    m.tzFrom = 16; // Auckland, UTC+12
    atTime('2026-06-07T12:00:00.000Z', () => m.tzSetNow({}));
    assertDeepEqual([m.tzTime, m.tzDate], ['00:00', '2026-06-08']);
  });
});

suite('unit-converter Model: Ableitungen und Inhalt', () => {
  test('result: Wert und Faktor; deutsches Komma und Tausenderpunkt', () => {
    const m = new State();
    m.setFromUnit({ unitKey: 'm' });
    m.toUnit = 'cm';
    m.inputVal = '1';
    assertAlmostEqual(derived(m, 'result').value, 100, 1e-9);
    assertAlmostEqual(derived(m, 'result').factor, 100, 1e-9);
    m.inputVal = '2,5';
    assertAlmostEqual(derived(m, 'result').value, 250, 1e-9);
    m.inputVal = '1.234,5';
    assertAlmostEqual(derived(m, 'result').value, 123450, 1e-6);
    m.inputVal = '';
    assertEqual(derived(m, 'result').value, null);
  });

  test('result: pH wie die Altform (Faktor aus einer Einheit)', () => {
    const m = new State();
    m.selectCategory({ catKey: 'ph' });
    assertDeepEqual([m.fromUnit, m.toUnit], ['pH', 'pOH']);
    assertAlmostEqual(derived(m, 'result').factor, 13, 1e-9);
    m.toUnit = 'Hmol';
    m.inputVal = '7';
    assertAlmostEqual(derived(m, 'result').value, 1e-7, 1e-15);
  });

  test('unitKeys und toUnitKeys', () => {
    const m = new State();
    m.selectCategory({ catKey: 'laborwerte' });
    assertDeepEqual(derived(m, 'unitKeys'), Object.keys(CATEGORIES.laborwerte.units));
    assertDeepEqual(derived(m, 'toUnitKeys'), ['mgdl_bz', 'mmoll_bz', 'gl_bz', 'mgml_bz']);
  });

  test('timezone: Zahlen statt Anzeigetext', () => {
    const m = new State();
    m.tzTime = '14:30';
    m.tzDate = '2026-01-15';
    assertDeepEqual(derived(m, 'timezone'), { time: '13:30', date: '2026-01-15', diffHours: -1 });
    m.tzTime = '';
    assertDeepEqual(derived(m, 'timezone'), { time: null, date: null, diffHours: null });
  });

  test('hasContent: Vorgabe leer, Eingabe, Größenart, Zeitzone, Uhrzeit; Datum zählt nicht', () => {
    assertEqual(new State().hasContent(), false);
    const cases = [(m) => { m.inputVal = '1'; }, (m) => m.selectCategory({ catKey: 'masse' }),
      (m) => { m.tzTo = 4; }, (m) => { m.tzTime = '08:00'; }, (m) => { m.toUnit = 'cm'; }];
    for (const f of cases) { const m = new State(); f(m); assertEqual(m.hasContent(), true); }
    const m = new State();
    m.tzDate = '2020-01-01';
    assertEqual(m.hasContent(), false);
  });

  test('Lesefläche: acht Felder und vier Ableitungen, sprachunabhängig', () => {
    const m = new State();
    m.selectCategory({ catKey: 'druck' });
    m.setFromUnit({ unitKey: 'bar' });
    m.toUnit = 'Pa';
    m.inputVal = '1,5';
    m.tzTime = '06:45';
    m.tzDate = '2026-07-04';
    const r = read(m);
    assertDeepEqual(Object.keys(r).sort(), ['activeCat', 'fromUnit', 'inputVal', 'result', 'timezone', 'toUnit',
      'toUnitKeys', 'tzDate', 'tzFrom', 'tzTime', 'tzTo', 'unitKeys']);
    assertAlmostEqual(r.result.value, 150000, 1e-6);
    assertDeepEqual(Object.keys(r.result), ['value', 'factor']);
    assertDeepEqual(r.timezone, { time: '04:45', date: '2026-07-04', diffHours: -2 });
  });
});
