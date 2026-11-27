/**
 * MSA Typ 6: Model — Schema, Vorgaben, Kommandos, Ableitungen, gespeicherte Form.
 */
import { suite, test, assert, assertEqual, assertDeepEqual, assertTrue } from '../../test-utils.js';
import {
  State, CHART_TYPES, LIMITS_MODES, ALPHA_OPTIONS, RULE_IDS, DEFAULT_ENABLED_RULES,
} from '../../../js/modules/msa-typ6/domain/model.js';
import { analyze, DEFAULT_ENABLED_RULES as ENGINE_DEFAULT_RULES } from '../../../js/engines/msa-typ6-engine.js';
import { NELSON_RULES } from '../../../js/engines/control-chart-engine.js';
import { evaluateDerived } from '../../../js/core/derived.js';
import { setFields } from '../../../js/core/model.js';
import { sheetSource, spySource } from '../../helpers/sheet-source.js';

const CTX = { cycle: 'dmaic', confidenceLevel: 95, power: 80 };
const ref = (col) => ({ instanceId: 'ws1', sheetId: 's1', columnId: col });
const VALUES = Array.from({ length: 30 }, (_, i) => 10 + (((i * 7) % 11) - 5) * 0.01);
const strip = ({ _schema, ...rest }) => rest;
/** Eingaben schreiben wie `instance.set` und `x-field`: das ganze Objekt `params`. */
const setP = (m, p) => { m.params = { ...m.params, ...p }; };
const DEFAULT_PARAMS = {
  measurementName: '', unit: 'mm', chartType: 'i-mr', limitsMode: 'from-study', baselineK: 20,
  mu0: null, sigma0: null, enabledRules: [1, 2, 3, 4, 5, 6], alpha: 0.05,
};

suite('MSA Typ 6 Model — Vorgaben und Listen', () => {
  test('Vorgaben wie die Altform, α als Zahl; kein Inhalt', () => {
    const m = new State(CTX);
    assertDeepEqual({ ...m.params, enabledRules: [...m.params.enabledRules] }, DEFAULT_PARAMS);
    assertDeepEqual({ ...m.columns }, { timestamp: null, value: null, subgroup: null });
    assertEqual(m.sourceTyp1InstanceId, null);
    assertEqual(m.exampleWorksheetId, null);
    assertEqual(m.hasContent(), false);
  });
  test('Literale im Schema gleich Engine und Altform', () => {
    const p = State.schema.fields.params.shape;
    assertDeepEqual([...p.chartType.values], CHART_TYPES);
    assertDeepEqual([...p.limitsMode.values], LIMITS_MODES);
    assertDeepEqual([...p.alpha.values], ALPHA_OPTIONS);
    assertDeepEqual([...p.enabledRules.item.values], RULE_IDS);
    assertDeepEqual(RULE_IDS, NELSON_RULES.map((r) => r.id));
    assertDeepEqual(DEFAULT_ENABLED_RULES, ENGINE_DEFAULT_RULES);
    assertDeepEqual([...State.schema.commands.toggleRule.params.ruleId.values], RULE_IDS);
  });
});

suite('MSA Typ 6 Model — hasContent', () => {
  test('eine Spalte oder der Merkmalsname zählt; Einheit, Typ und Regeln nicht', () => {
    const cases = [
      [(m) => { m.columns = { ...m.columns, value: ref('v') }; }, true],
      [(m) => { m.columns = { ...m.columns, timestamp: ref('t') }; }, true],
      [(m) => { m.columns = { ...m.columns, subgroup: ref('g') }; }, true],
      [(m) => setP(m, { measurementName: 'x' }), true],
      [(m) => setP(m, { unit: 'µm' }), false],
      [(m) => setP(m, { chartType: 'xbar-r' }), false],
      [(m) => m.toggleRule({ ruleId: 8, on: true }), false],
    ];
    for (const [fn, want] of cases) {
      const m = new State(CTX);
      fn(m);
      assertEqual(m.hasContent(), want, fn.toString());
    }
  });
});

suite('MSA Typ 6 Model — Feldbereiche', () => {
  const rejects = (p) => {
    const m = new State(CTX);
    let err;
    try { setP(m, p); } catch (e) { err = e; }
    assert(err, JSON.stringify(p));
    assertDeepEqual({ ...m.params, enabledRules: [...m.params.enabledRules] }, DEFAULT_PARAMS);
  };
  test('baselineK nur ganze Zahl ab 1 (unter 5 meldet die Engine)', () => {
    rejects({ baselineK: 0 });
    rejects({ baselineK: 2.5 });
    const m = new State(CTX);
    setP(m, { baselineK: 1 });
    assertEqual(m.params.baselineK, 1);
  });
  test('α nur aus der Liste; Text der Auswahl wird Zahl', () => {
    rejects({ alpha: 0.1 + 0.2 });
    rejects({ alpha: 0.2 });
    const m = new State(CTX);
    setP(m, { alpha: /** @type {any} */ ('0.1') });
    assertEqual(m.params.alpha, 0.1);
  });
  test('Regeln nur 1–8, Normalform ohne Doppelte und aufsteigend', () => {
    rejects({ enabledRules: [9] });
    const m = new State(CTX);
    setP(m, { enabledRules: [3, 1, 3] });
    assertDeepEqual([...m.params.enabledRules], [1, 3]);
  });
  test('Kartentyp und Grenzen-Modus nur aus der Liste', () => {
    rejects({ chartType: 'xbar-s' });
    rejects({ limitsMode: 'auto' });
  });
});

suite('MSA Typ 6 Model — Kommandos', () => {
  test('toggleRule hakt an und ab, die Liste bleibt sortiert', () => {
    const m = new State(CTX);
    m.toggleRule({ ruleId: 8, on: true });
    m.toggleRule({ ruleId: 2, on: false });
    assertDeepEqual([...m.params.enabledRules], [1, 3, 4, 5, 6, 8]);
    m.toggleRule({ ruleId: 8, on: true });
    assertDeepEqual([...m.params.enabledRules], [1, 3, 4, 5, 6, 8]);
    m.toggleRule({ ruleId: 7, on: false });
    assertDeepEqual([...m.params.enabledRules], [1, 3, 4, 5, 6, 8]);
  });
  test('toggleRule lehnt eine unbekannte Regel ab', () => {
    const m = new State(CTX);
    let err;
    try { m.toggleRule({ ruleId: /** @type {any} */ (9), on: true }); } catch (e) { err = e; }
    assert(err, 'Regel 9 abgelehnt');
  });
  test('adoptTyp1 setzt Quelle, μ₀ und σ₀ in einem Schritt', () => {
    const m = new State(CTX);
    m.adoptTyp1({ instanceId: 't1', mu0: 10.002, sigma0: 0.002 });
    assertEqual(m.sourceTyp1InstanceId, 't1');
    assertEqual(m.params.mu0, 10.002);
    assertEqual(m.params.sigma0, 0.002);
  });
  test('adoptTyp1 ohne Quelle setzt nur die Auswahl zurück', () => {
    const m = new State(CTX);
    m.adoptTyp1({ instanceId: 't1', mu0: 1, sigma0: 2 });
    m.adoptTyp1({ instanceId: null });
    assertEqual(m.sourceTyp1InstanceId, null);
    assertEqual(m.params.mu0, 1);
    assertEqual(m.params.sigma0, 2);
  });
  test('adoptTyp1 ohne μ₀/σ₀ lässt sie stehen; wirkt in jedem Grenzen-Modus', () => {
    const m = new State(CTX);
    setP(m, { mu0: 5 });
    m.adoptTyp1({ instanceId: 't2' });
    assertEqual(m.sourceTyp1InstanceId, 't2');
    assertEqual(m.params.mu0, 5);
    assertEqual(m.params.limitsMode, 'from-study');
  });
  test('sourceTyp1InstanceId ist für den Agenten nicht schreibbar', () => {
    assertEqual(State.schema.fields.sourceTyp1InstanceId.agentWrite, false);
  });
});

suite('MSA Typ 6 Model — gespeicherte Form', () => {
  test('params.* und columns.* an den Pfaden der Altform, Quelle oben', () => {
    const m = new State(CTX);
    setP(m, { measurementName: 'Welle' });
    m.columns = { ...m.columns, value: ref('v') };
    m.adoptTyp1({ instanceId: 't1', mu0: 1, sigma0: 2 });
    const json = m.toJSON();
    assertEqual(json.params.measurementName, 'Welle');
    assertDeepEqual(json.columns.value, ref('v'));
    assertEqual(json.sourceTyp1InstanceId, 't1');
    assertDeepEqual(Object.keys(json.params).sort(),
      ['alpha', 'baselineK', 'chartType', 'enabledRules', 'limitsMode', 'measurementName', 'mu0', 'sigma0', 'unit']);
    assertDeepEqual(Object.keys(json.columns), ['timestamp', 'value', 'subgroup']);
  });
  test('toJSON → fromJSON verlustfrei', () => {
    const m = new State(CTX);
    setFields(m, {
      params: { ...DEFAULT_PARAMS, measurementName: 'A', unit: 'µm', chartType: 'xbar-r', limitsMode: 'given', mu0: 10, sigma0: 0.1, enabledRules: [1, 7], alpha: 0.01 },
      columns: { timestamp: ref('t'), value: ref('v'), subgroup: ref('g') },
      sourceTyp1InstanceId: 't1',
      exampleWorksheetId: 'ws9',
    });
    const back = State.fromJSON(m.toJSON(), { context: CTX });
    assertDeepEqual(strip(back.toJSON()), strip(m.toJSON()));
  });
});

suite('MSA Typ 6 Model — Ableitungen', () => {
  const src = sheetSource({ v: VALUES });
  const full = () => {
    const m = new State(CTX);
    m.columns = { ...m.columns, value: ref('v') };
    return m;
  };

  test('result gleich der Engine, liest die Spalte über den Leser', () => {
    const { result } = evaluateDerived(full(), spySource(src));
    assertDeepEqual(result, analyze({
      chartType: 'i-mr', values: VALUES, subgroups: null, timestamps: null, limitsMode: 'from-study',
      baselineK: 20, mu0: NaN, sigma0: NaN, enabledRules: [1, 2, 3, 4, 5, 6], alpha: 0.05,
    }));
  });
  test('result null ohne Messwertspalte und bei gelöschter Spalte', () => {
    assertEqual(evaluateDerived(new State(CTX), src).result, null);
    const m = full();
    m.columns = { ...m.columns, value: ref('weg') };
    assertEqual(evaluateDerived(m, src).result, null);
  });
  test('result invalid bei vorgegebenen Grenzen ohne σ₀', () => {
    const m = full();
    setP(m, { limitsMode: 'given', mu0: 10 });
    assertDeepEqual(evaluateDerived(m, src).result, { invalid: { code: 'E_GIVEN_LIMITS_INVALID', params: null } });
  });
  test('activeParams je Grenzen-Modus wie die Altform', () => {
    const m = new State(CTX);
    assertDeepEqual(evaluateDerived(m, src).activeParams,
      ['measurementName', 'unit', 'chartType', 'limitsMode', 'baselineK', 'enabledRules', 'alpha']);
    setP(m, { limitsMode: 'given' });
    assertDeepEqual(evaluateDerived(m, src).activeParams,
      ['measurementName', 'unit', 'chartType', 'limitsMode', 'mu0', 'sigma0', 'enabledRules', 'alpha']);
  });
  test('activeColumnSlots: subgroup nur bei x̄-R', () => {
    const m = new State(CTX);
    assertDeepEqual(evaluateDerived(m, src).activeColumnSlots, ['timestamp', 'value']);
    setP(m, { chartType: 'xbar-r' });
    assertDeepEqual(evaluateDerived(m, src).activeColumnSlots, ['timestamp', 'value', 'subgroup']);
  });
  test('Untergruppenspalte bei I-MR wirkt nicht', () => {
    const s = sheetSource({ v: VALUES, g: VALUES.map((_, i) => Math.floor(i / 5)) });
    const m = full();
    const before = evaluateDerived(m, s).result;
    m.columns = { ...m.columns, subgroup: ref('g') };
    assertDeepEqual(evaluateDerived(m, s).result, before);
    assertTrue(before.meta.chartType === 'i-mr', 'i-mr');
  });
});
