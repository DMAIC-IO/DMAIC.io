/**
 * Tests for js/modules/doe-planner/domain/columns.js — the datasheet
 * columns of a design, against the columns the planner wrote before.
 */
import { suite, test, assertEqual, assertDeepEqual } from '../../test-utils.js';
import { designColumns } from '../../../js/modules/doe-planner/domain/columns.js';
import { loadCases, legacyColumns, NAMES } from './cases.js';

/**
 * @param {any} col an entry of designColumns
 * @returns {any} the compared part, without managedRef
 */
function comparable(col) {
  let meta = col.meta;
  if (meta) {
    meta = { ...meta };
    delete meta.managedRef;
  }
  return {
    name: col.name, type: col.type, unit: col.unit, values: col.values, formulas: col.formulas,
    format: col.format, meta, role: col.role,
  };
}

suite('doe-planner domain — designColumns', () => {
  test('gleiche Spalten wie das bisherige Datenblatt, je Beispielplan', async () => {
    const frozen = await legacyColumns();
    const cases = await loadCases();
    assertEqual(cases.length, 6);
    for (const c of cases) {
      const { columns } = designColumns(c.design, c.model.factors, c.model.responses, { names: NAMES, managedRef: 'doe:p1' });
      const expected = frozen[c.name].columns;
      assertEqual(columns.length, expected.length, `${c.name}: Spaltenzahl`);
      columns.forEach((col, i) => assertDeepEqual(comparable(col), expected[i], `${c.name}: Spalte ${i} (${col.name})`));
    }
  });

  test('managedRef steht in jedem Merkmal, managedBy ist doe-planner', async () => {
    const [c] = await loadCases();
    const { columns } = designColumns(c.design, c.model.factors, c.model.responses, { names: NAMES, managedRef: 'doe:p1' });
    for (const col of columns) {
      if (col.meta) {
        assertEqual(col.meta.managedRef, 'doe:p1');
        assertEqual(col.meta.managedBy, 'doe-planner');
      }
    }
    const none = designColumns(c.design, c.model.factors, c.model.responses, { names: NAMES, managedRef: null });
    for (const col of none.columns) {
      if (!col.meta) continue;
      assertEqual('managedRef' in col.meta, false);
      for (const v of Object.values(col.meta)) assertEqual(v === null || v === undefined, false);
    }
  });

  test('ids nennen die Positionen der Spalten', async () => {
    const cases = await loadCases();
    const heli = cases.find((c) => c.name === 'doe-planner-hubschrauber-flyer');
    const { columns, ids } = designColumns(heli.design, heli.model.factors, heli.model.responses, { names: NAMES, managedRef: null });
    assertDeepEqual(ids, { runOrder: 0, stdOrder: 1, block: 2, replicate: 3, factors: [4, 5], responses: [6], means: [7], lnVars: [8] });
    assertEqual(columns[ids.means[0]].name, 'Flugzeit Mean');
    const mixed = cases.find((c) => c.name === 'doe-optimal-mixed-4f');
    const m = designColumns(mixed.design, mixed.model.factors, mixed.model.responses, { names: NAMES, managedRef: null });
    assertDeepEqual(m.ids.means, []);
    assertDeepEqual(m.ids.lnVars, []);
    assertDeepEqual(m.ids.responses, [8]);
  });

  test('Stufen als Text im Plan geben Zahlen in den Faktorspalten', async () => {
    const [c] = await loadCases();
    const textual = { ...c.design, actualMatrix: c.design.actualMatrix.map((row) => row.map(String)) };
    const a = designColumns(c.design, c.model.factors, c.model.responses, { names: NAMES, managedRef: null });
    const b = designColumns(textual, c.model.factors, c.model.responses, { names: NAMES, managedRef: null });
    assertDeepEqual(b.columns, a.columns);
  });

  test('verändert den Plan nicht', async () => {
    const [c] = await loadCases();
    const before = JSON.stringify(c.design);
    designColumns(Object.freeze(c.design), c.model.factors, c.model.responses, { names: NAMES, managedRef: null });
    assertEqual(JSON.stringify(c.design), before);
  });
});
