import { suite, test, assertEqual, assertDeepEqual, assertThrows, assertTrue } from '../test-utils.js';
import { loadModel } from '../../js/core/initial-model.js';
import { evaluateDerived } from '../../js/core/derived.js';
import { State } from '../../js/modules/attribute-control-chart/domain/model.js';
import { sheetSource, spySource } from '../helpers/sheet-source.js';
import { ATTRIBUTE_CHART_TYPES, ATTRIBUTE_NELSON_RULES, ATTR_DEFAULT_ENABLED_RULES } from '../../js/engines/attribute-control-chart-engine.js';

const ref = (c) => ({ instanceId: 'ws1', sheetId: 's1', columnId: c });

async function loadJson(path) {
  const resp = await fetch(new URL(path, import.meta.url));
  return resp.json();
}

const EXAMPLES = {};
for (const name of ['p', 'c', 'np', 'u']) {
  EXAMPLES[name] = await loadJson(`../../js/modules/attribute-control-chart/resources/examples/projects/spc-attribute-${name}-chart.json`);
}

suite('attribute-control-chart Model', () => {
  test('Vorgaben und JSON-Form', () => {
    const m = new State();
    const { _schema, ...rest } = m.toJSON();
    assertEqual(_schema.version, '1.0');
    assertDeepEqual(rest, { chartTypeId: 'p', defectsRef: null, sizeRef: null, constantN: 50, baselineCount: null, enabledRules: [1], exampleWorksheetId: null, controlChartEdits: {} });
    assertEqual(m.hasContent(), false);
  });

  test('gespeicherter Stand ohne Diagramm-Schlüssel lädt unverändert; Diagrammeinstellungen sind kein Inhalt', () => {
    assertDeepEqual(State.fromJSON({ chartTypeId: 'c' }).toJSON().controlChartEdits, {});
    const m = State.fromJSON({ controlChartEdits: { title: 'X' } });
    assertEqual(m.controlChartEdits.title, 'X');
    assertEqual(m.hasContent(), false);
  });

  test('Schema-Literale entsprechen der Engine', () => {
    const f = State.schema.fields;
    assertDeepEqual([...f.chartTypeId.values], ATTRIBUTE_CHART_TYPES.map((t) => t.id));
    assertDeepEqual([...f.enabledRules.item.values], ATTRIBUTE_NELSON_RULES.map((r) => r.id));
    assertDeepEqual(f.enabledRules.default, ATTR_DEFAULT_ENABLED_RULES);
  });

  test('toggleRule schreibt die Normalform', () => {
    const m = new State();
    m.toggleRule({ ruleId: 5, on: true });
    m.toggleRule({ ruleId: 2, on: true });
    m.toggleRule({ ruleId: 2, on: true });
    assertDeepEqual(m.enabledRules, [1, 2, 5]);
    m.enabledRules = [6, 1, 6];
    assertDeepEqual(m.enabledRules, [1, 6]);
    m.toggleRule({ ruleId: 3, on: true });
    assertDeepEqual(m.enabledRules, [1, 3, 6]);
    m.toggleRule({ ruleId: 1, on: false });
    assertDeepEqual(m.enabledRules, [3, 6]);
    assertThrows(() => m.toggleRule({ ruleId: 4, on: true }), /invalid ruleId 4; allowed: 1, 2, 3, 5, 6/);
  });

  test('Zuweisungen über das Schema', () => {
    const m = new State();
    assertThrows(() => { m.chartTypeId = 'x'; }, /invalid chartTypeId "x"; allowed: p, np, c, u/);
    assertThrows(() => { m.constantN = 0; }, /invalid constantN 0/);
    assertThrows(() => { m.constantN = 2.5; }, /invalid constantN 2.5/);
    assertThrows(() => { m.baselineCount = 0; }, /invalid baselineCount 0/);
    assertThrows(() => { m.enabledRules = [4]; }, /invalid enabledRules\[0\] 4; allowed: 1, 2, 3, 5, 6/);
    m.baselineCount = null;
    m.defectsRef = { instanceId: 'ws1', columnId: 'c1' };
    assertEqual(m.hasContent(), true);
  });

  test('jede Abweichung ist Inhalt (Vorgabe des Kerns)', () => {
    const m = new State();
    m.chartTypeId = 'c';
    assertEqual(m.hasContent(), true);
  });

  test('Altstand ohne _schema lädt ohne Reparatur', () => {
    const m = State.fromJSON({ chartTypeId: 'u', defectsRef: ref('d'), sizeRef: ref('n'), constantN: 33, baselineCount: 4, enabledRules: [1, 2, 3, 5, 6], exampleWorksheetId: 'ws-9' });
    assertEqual(m.chartTypeId, 'u');
    assertDeepEqual(m.sizeRef, ref('n'));
    assertEqual(m.exampleWorksheetId, 'ws-9');
    assertEqual(m.toJSON()._schema.version, '1.0');
  });

  test('jedes Beispielprojekt lädt ohne Reparatur', () => {
    for (const name of ['p', 'c', 'np', 'u']) {
      const m = State.fromJSON(EXAMPLES[name]);
      assertEqual(m.chartTypeId, name);
    }
  });

  test('Rundreise', () => {
    const m = State.fromJSON({ chartTypeId: 'np', defectsRef: ref('d'), constantN: 100, baselineCount: 5, enabledRules: [1, 2] });
    assertDeepEqual(State.fromJSON(m.toJSON()).toJSON(), m.toJSON());
  });

  test('Reparatur: unbekannte Regel (je Eintrag) und Kartentyp laden ohne Wurf, mit Warnung', () => {
    const warnings = [];
    const warn = console.warn; console.warn = (m) => warnings.push(m);
    try {
      const m = loadModel(State, { chartTypeId: 'bogus', enabledRules: [5, 1, 1, 99, 3] });
      assertEqual(m.chartTypeId, 'p');
      assertDeepEqual([...m.enabledRules], [1, 3, 5], 'ungültige Einträge entfallen, der Rest ist entdoppelt und sortiert');
    } finally { console.warn = warn; }
    assertEqual(warnings.length, 1);
    assertTrue(/enabledRules/.test(warnings[0]) && /chartTypeId/.test(warnings[0]), 'die Warnung nennt beide Felder');
  });
});

suite('attribute-control-chart Model — derived', () => {
  const cols = { c0: [4, 6, 5, 9, 3, 7, 5, 20] };
  const data = sheetSource(cols);

  test('c-Karte: Grenzen, Ergebnis und Punkte mit festen Erwartungen', () => {
    const m = State.fromJSON({ chartTypeId: 'c', defectsRef: ref('c0') });
    const d = evaluateDerived(m, data);
    assertEqual(d.analysis.valid, 8);
    assertEqual(d.result.cl, 7.375);
    assertEqual(d.result.ucl.toFixed(3), '15.522');
    assertEqual(d.result.lcl, 0);
    assertDeepEqual(d.result.violations, [{ index: 7, ruleId: 1 }]);
    assertDeepEqual(d.result.signals, [7]);
    assertEqual(d.points.length, 8);
    assertDeepEqual(d.points[7], { value: 20, n: null, ucl: d.result.ucl, lcl: 0, signal: true });
    assertEqual(d.points[0].signal, false);
  });

  test('analysis liest nur über src.read', () => {
    const m = State.fromJSON({ chartTypeId: 'c', defectsRef: ref('c0') });
    assertEqual(evaluateDerived(m, spySource(data)).analysis.valid, 8);
  });

  test('gelöschte Spalte: analysis null statt Wurf', () => {
    const m = State.fromJSON({ chartTypeId: 'c', defectsRef: ref('gone') });
    assertEqual(evaluateDerived(m, data).analysis, null);
  });

  test('ohne Spalte: analysis und result null, points leer', () => {
    const d = evaluateDerived(State.fromJSON({ chartTypeId: 'c' }), data);
    assertEqual(d.analysis, null);
    assertEqual(d.result, null);
    assertDeepEqual(d.points, []);
  });

  test('Spaltenfelder und Einstellungen folgen dem Kartentyp', () => {
    const p = evaluateDerived(State.fromJSON({ chartTypeId: 'p' }), data);
    assertDeepEqual(p.activeColumnSlots, ['defectsRef', 'sizeRef']);
    assertDeepEqual(p.activeParams, ['chartTypeId', 'baselineCount', 'enabledRules']);
    const np = evaluateDerived(State.fromJSON({ chartTypeId: 'np' }), data);
    assertDeepEqual(np.activeColumnSlots, ['defectsRef']);
    assertDeepEqual(np.activeParams, ['chartTypeId', 'constantN', 'baselineCount', 'enabledRules']);
  });

  test('points steht in derivedBulk', () => {
    assertDeepEqual([...State.schema.derivedBulk], ['points']);
  });
});
