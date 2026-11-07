import { suite, test, assertEqual, assertDeepEqual, assertThrows } from '../test-utils.js';
import { loadModel } from '../../js/core/initial-model.js';
import { State } from '../../js/modules/attribute-control-chart/domain/model.js';
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

  test('Reparatur: unbekannte Regel und Kartentyp laden ohne Wurf, mit Warnung', () => {
    const warnings = [];
    const warn = console.warn; console.warn = (m) => warnings.push(m);
    try {
      const m = loadModel(State, { chartTypeId: 'bogus', enabledRules: [5, 1, 1, 99, 3] });
      assertEqual(m.chartTypeId, 'p');
      assertDeepEqual([...m.enabledRules], [1]);
    } finally { console.warn = warn; }
    assertEqual(warnings.length, 1);
  });
});
