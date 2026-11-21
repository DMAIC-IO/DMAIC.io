/**
 * Process Capability: Migration des alten Stands (domain/migrations.js). Rein, läuft in Node.
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../../test-utils.js';
import { State } from '../../../js/modules/process-capability/domain/model.js';
import { from0 } from '../../../js/modules/process-capability/domain/migrations.js';
import { evaluateDerived } from '../../../js/core/derived.js';
import { storedSource } from '../../helpers/stored-source.js';

const old = (params = {}, rest = {}) => ({ params: { name: 'M', ...params }, ...rest });
const load = (params, rest) => State.fromJSON(old(params, rest));
const ref = (c) => ({ instanceId: 'w', sheetId: 's', columnId: c });

suite('process-capability: Migration — Grenzen', () => {
  test('Zahl bleibt, NaN wird null', () => {
    assertEqual(load({ lsl: 50.2 }).params.lsl, 50.2);
    assertEqual(load({ lsl: NaN }).params.lsl, null);
  });
  test('Text mit Komma wird gelesen, leer und unlesbar werden null', () => {
    assertEqual(load({ lsl: '49,800' }).params.lsl, 49.8);
    assertEqual(load({ usl: '' }).params.usl, null);
    assertEqual(load({ target: 'abc' }).params.target, null);
    assertEqual(load({}).params.usl, null);
  });
});

suite('process-capability: Migration — Konfidenz und Zahlen', () => {
  test('Anteil wird Prozent, gerundet', () => {
    assertEqual(load({ confidence: 0.9 }).params.confidence, 90);
    assertEqual(load({ confidence: 95.555 }).params.confidence, 95.56);
    assertEqual(load({ confidence: '99,5' }).params.confidence, 99.5);
  });
  test('leer, unlesbar, ≤ 0 werden 95', () => {
    for (const c of ['', 'x', 0, -3, undefined]) assertEqual(load({ confidence: c }).params.confidence, 95);
  });
  test('Untergruppengröße, Spannweite und Texte', () => {
    assertEqual(load({ subgroupSize: '0' }).params.subgroupSize, 1);
    assertEqual(load({ subgroupSize: '4' }).params.subgroupSize, 4);
    assertEqual(load({ mrSpan: 'x' }).params.mrSpan, 2);
    assertEqual(load({ mrSpan: '5' }).params.mrSpan, 5);
    assertEqual(load({ subgroupMode: 'foo' }).params.subgroupMode, 'size');
    assertEqual(load({ subgroupMode: 'column' }).params.subgroupMode, 'column');
    assertEqual(load({ withinMethod: 'foo' }).params.withinMethod, '');
    assertEqual(load({ withinMethod: 'rbar' }).params.withinMethod, 'rbar');
    assertEqual(load({ unit: '' }).params.unit, 'mm');
    assertEqual(load({ unbiased: 'x' }).params.unbiased, true);
    assertEqual(load({ unbiased: false }).params.unbiased, false);
  });
});

suite('process-capability: Migration — Bezüge und Beispieldaten', () => {
  test('Bezug ohne sheetId wird null', () => {
    assertEqual(load({}, { columnRef: { instanceId: 'w', columnId: 'c' } }).columnRef, null);
    assertDeepEqual(load({}, { columnRef: ref('c') }).columnRef, ref('c'));
  });
  test('embeddedValues: nur Zahlen, sonst null', () => {
    assertDeepEqual(load({}, { embeddedValues: [1, 'a'] }).embeddedValues, [1]);
    assertEqual(load({}, { embeddedValues: 'x' }).embeddedValues, null);
    assertDeepEqual(load({}, { embeddedValues: [1, 2] }).embeddedValues, [1, 2]);
    assertEqual(load({}, { embeddedLabel: 5 }).embeddedLabel, '');
  });
  test('lastResult fällt weg', () => {
    assertTrue(!('lastResult' in from0(old({}, { lastResult: { cpk: 1 } }))));
  });
  test('beides gesetzt: embeddedValues bleibt, columnRef wird leer', () => {
    const m = load({}, { embeddedValues: [1, 2, 3], columnRef: ref('c') });
    assertDeepEqual(m.embeddedValues, [1, 2, 3]);
    assertEqual(m.columnRef, null);
  });
  test('leerer Stand lädt', () => {
    const m = State.fromJSON({});
    assertEqual(m.params.unit, 'mm');
  });
});

const EXPORTS = ['v0.2.0_single_project', 'v0.2.0_all_projects', 'v0.3.0_single_project', 'v0.3.0_all_projects',
  'v0.5.0_8d_project', 'v0.9.0_single_project', 'v1.0.0_single_project', 'v1.1.0_single_project',
  'v1.2.0_single_project', 'v1.3.0_single_project', 'v1.4.0_single_project', 'v1.5.0_single_project',
  'v1.6.0_single_project'];

/** Alle `moduleStates`-Tabellen und Instanzen von process-capability in einem Export. */
function collect(node, out = { states: {}, instances: [] }) {
  if (Array.isArray(node)) node.forEach((n) => collect(n, out));
  else if (node && typeof node === 'object') {
    if (node.moduleId === 'process-capability') out.instances.push(node);
    if (node.moduleStates && typeof node.moduleStates === 'object') Object.assign(out.states, node.moduleStates);
    Object.values(node).forEach((n) => collect(n, out));
  }
  return out;
}

suite('process-capability: Migration — Export-Fixtures', () => {
  for (const name of EXPORTS) {
    test(`${name}: alle Instanzen laden`, async () => {
      const res = await fetch(new URL(`../../fixtures/exports/${name}.json`, import.meta.url));
      const { states, instances } = collect(await res.json());
      for (const inst of instances) {
        const saved = inst.state && Object.keys(inst.state).length ? inst.state : states[inst.instanceId];
        if (!saved) continue;
        const m = State.fromJSON(saved);
        assertTrue(typeof m.params.unit === 'string' && m.params.unit.length > 0);
      }
    });
  }
});

const LEGACY = {
  "params": {
    "name": "Bolzen",
    "lsl": "49,800",
    "usl": "50.2",
    "target": "",
    "unit": "mm",
    "confidence": 0.9,
    "subgroupSize": 1,
    "subgroupMode": "column",
    "withinMethod": "rbar",
    "unbiased": true,
    "mrSpan": 2
  },
  "columnRef": {
    "instanceId": "9cdadfd8-a327-47d1-b745-afd96028f939",
    "sheetId": "sheet_1",
    "columnId": "col_pc_value"
  },
  "subgroupColumnRef": {
    "instanceId": "9cdadfd8-a327-47d1-b745-afd96028f939",
    "sheetId": "sheet_1",
    "columnId": "col_pc_id"
  },
  "embeddedValues": null,
  "embeddedLabel": "",
  "lastResult": {
    "cpk": null,
    "ppk": null
  }
};
const VALUE = [50.02, 49.98, 50.05, 50.01, 49.96, 50.08, 50.03, 49.99, 50.06, 50, 49.95, 50.04, 50.02, 49.97, 50.07, 50.1, 50.01, 49.94, 50.03, 50.05];
const IDS = [1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4];

suite('process-capability: Migration — Altprojekt (Baseline)', () => {
  test('Kennzahlen gleich dem Altmodul: Cpk 1,2270, Ppk 1,3762, Konfidenz 90', () => {
    const m = State.fromJSON(LEGACY);
    assertEqual(m.params.lsl, 49.8);
    assertEqual(m.params.usl, 50.2);
    assertEqual(m.params.confidence, 90);
    const src = storedSource({ '9cdadfd8-a327-47d1-b745-afd96028f939': { sheets: [{ id: 'sheet_1', name: 'Sheet', state: { rowCount: 20, columns: [
      { id: 'col_pc_value', name: '', type: 'numeric', values: VALUE },
      { id: 'col_pc_id', name: '', type: 'numeric', values: IDS },
    ] } }] } });
    const { result } = evaluateDerived(m, src).analysis;
    assertEqual(result.Cpk.toFixed(4), '1.2270');
    assertEqual(result.Ppk.toFixed(4), '1.3762');
  });
});
