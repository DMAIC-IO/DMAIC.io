/**
 * MSA Typ 1: Migration '0→1.0' — jeder Fall des alten fromJSON, Golden-Exporte
 * und das Altprojekt aus den E2E-Fixtures.
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../../test-utils.js';
import { State } from '../../../js/modules/msa-typ1/domain/model.js';
import { from0 } from '../../../js/modules/msa-typ1/domain/migrations.js';

const CTX = { cycle: 'dmaic', confidenceLevel: 95, power: 80 };
const REF = { instanceId: 'ws', sheetId: 's', columnId: 'c' };
const DEFAULT_PARAMS = { name: '', unit: 'mm', ref: null, lsl: null, usl: null, k1: 0.2, k2: 3 };

/** Streng laden (ohne Reparatur): wirft, wenn die Migration Ungültiges liefert. */
const load = (json) => State.fromJSON(json, { context: CTX });

suite('MSA Typ 1 Migration — Vorgaben und Robustheit', () => {
  test('leerer Stand und fehlende params ergeben die Vorgaben', () => {
    assertDeepEqual({ ...load({}).params }, DEFAULT_PARAMS);
    assertDeepEqual({ ...load({ params: 'x' }).params }, DEFAULT_PARAMS);
    assertEqual(load({}).columnRef, null);
    assertEqual(load({}).exampleWorksheetId, null);
  });
  test('Zahlen bleiben Zahlen, NaN wird leer', () => {
    const m = load({ params: { ref: 50, lsl: 49.95, usl: NaN } });
    assertEqual(m.params.ref, 50);
    assertEqual(m.params.lsl, 49.95);
    assertEqual(m.params.usl, null);
  });
  test('Text mit Punkt, Komma und Tausenderpunkt wird Zahl', () => {
    const m = load({ params: { ref: '10,0', lsl: '9.9', usl: '1.234,5' } });
    assertEqual(m.params.ref, 10);
    assertEqual(m.params.lsl, 9.9);
    assertEqual(m.params.usl, 1234.5);
  });
  test('leerer und unlesbarer Text wird leer', () => {
    const m = load({ params: { ref: '', lsl: '  ', usl: 'abc' } });
    assertEqual(m.params.ref, null);
    assertEqual(m.params.lsl, null);
    assertEqual(m.params.usl, null);
  });
  test('k₁/k₂ aus der Liste als Text oder Zahl; sonst 0,2 bzw. 3', () => {
    assertEqual(load({ params: { k1: '0.15', k2: '4' } }).params.k1, 0.15);
    assertEqual(load({ params: { k1: 0.1, k2: 6 } }).params.k2, 6);
    const bad = load({ params: { k1: 'x', k2: 5 } });
    assertEqual(bad.params.k1, 0.2);
    assertEqual(bad.params.k2, 3);
    assertEqual(load({ params: { k1: '0.20' } }).params.k1, 0.2);
  });
  test('Einheit: leer oder fehlend wird mm; Name nur als Text', () => {
    assertEqual(load({ params: { unit: '' } }).params.unit, 'mm');
    assertEqual(load({ params: { unit: 'µm' } }).params.unit, 'µm');
    assertEqual(load({ params: { name: 5 } }).params.name, '');
  });
  test('Spaltenbezug vollständig oder leer; exampleWorksheetId nur als Text', () => {
    assertDeepEqual(load({ columnRef: REF }).columnRef, REF);
    assertEqual(load({ columnRef: { instanceId: 'ws', sheetId: 's' } }).columnRef, null);
    assertEqual(load({ exampleWorksheetId: 'w1' }).exampleWorksheetId, 'w1');
    assertEqual(load({ exampleWorksheetId: 5 }).exampleWorksheetId, null);
  });
  test('lastResult und Schlüssel früherer Formen entfallen', () => {
    const out = from0({ params: { repeats: 25, tolerance: 0.6, reference: 3.5, kCg: 0.2, kCgk: 0.1 }, lastResult: { n: 1 } });
    assertDeepEqual(Object.keys(out).sort(), ['columnRef', 'exampleWorksheetId', 'params']);
    assertDeepEqual(out.params, DEFAULT_PARAMS);
  });
});

const EXPORTS = ['v0.2.0_single_project', 'v0.3.0_single_project', 'v0.5.0_8d_project', 'v0.9.0_single_project',
  'v1.0.0_single_project', 'v1.1.0_single_project', 'v1.2.0_single_project', 'v1.3.0_single_project',
  'v1.4.0_single_project', 'v1.5.0_single_project', 'v1.6.0_single_project', 'v1.7.0_single_project',
  'v1.8.0_single_project', 'v1.9.0_single_project'];

/** Alle `moduleStates`-Tabellen und Instanzen von msa-typ1 in einem Export. */
function collect(node, out = { states: {}, instances: [] }) {
  if (Array.isArray(node)) node.forEach((n) => collect(n, out));
  else if (node && typeof node === 'object') {
    if (node.moduleId === 'msa-typ1') out.instances.push(node);
    if (node.moduleStates && typeof node.moduleStates === 'object') Object.assign(out.states, node.moduleStates);
    Object.values(node).forEach((n) => collect(n, out));
  }
  return out;
}

suite('MSA Typ 1 Migration — Golden-Exporte (frühere Form, nur die Spalte bleibt)', () => {
  for (const name of EXPORTS) {
    test(`${name}: lädt streng, Parameter auf den Vorgaben, Spalte bleibt`, async () => {
      const res = await fetch(new URL(`../../fixtures/exports/${name}.json`, import.meta.url));
      const { states, instances } = collect(await res.json());
      assertTrue(instances.length > 0, 'Instanz vorhanden');
      for (const inst of instances) {
        const saved = inst.state && Object.keys(inst.state).length ? inst.state : states[inst.instanceId];
        const m = load(saved);
        assertDeepEqual({ ...m.params }, DEFAULT_PARAMS);
        assertDeepEqual(m.columnRef, saved.columnRef);
      }
    });
  }
});

// Die zwei Instanzen des Altprojekts der E2E-Fixtures (vollständig, defekt), wörtlich.
const LEGACY_A = {"params": {"name": "Bohrung Ø10", "ref": "10,0", "unit": "µm", "lsl": "9.9", "usl": 10.1, "k1": "0.15", "k2": "4"}, "columnRef": {"instanceId": "5e1f2a3b-4c5d-4e6f-8a7b-9c0d1e2f3a4b", "sheetId": "sheet_1", "columnId": "col_t1_d"}, "exampleWorksheetId": "ws-alt-beispiel"};
const LEGACY_B = {"params": {"name": "Altstand defekt", "ref": "", "lsl": null, "usl": "abc", "k1": "x", "k2": 5}, "columnRef": {"instanceId": "5e1f2a3b-4c5d-4e6f-8a7b-9c0d1e2f3a4b", "sheetId": "sheet_1", "columnId": "col_t1_d"}, "exampleWorksheetId": null, "lastResult": {"Cg": 1.5}, "repeats": 25, "tolerance": 0.2, "reference": 10, "kCg": 0.2, "kCgk": 0.1};

suite('MSA Typ 1 Migration — Altprojekt der E2E-Fixtures', () => {
  test('beide Instanzen laden ohne Reparatur', () => {
    const reports = [];
    const [a, b] = [LEGACY_A, LEGACY_B].map((st) => State.fromJSON(st, { repair: true, onRepair: (n) => reports.push(n), context: CTX }));
    assertDeepEqual(reports, []);
    assertDeepEqual({ ...a.params }, { name: 'Bohrung Ø10', unit: 'µm', ref: 10, lsl: 9.9, usl: 10.1, k1: 0.15, k2: 4 });
    assertEqual(a.exampleWorksheetId, 'ws-alt-beispiel');
    assertDeepEqual({ ...b.params }, { name: 'Altstand defekt', unit: 'mm', ref: null, lsl: null, usl: null, k1: 0.2, k2: 3 });
    assertDeepEqual(b.columnRef, LEGACY_B.columnRef);
  });
});
