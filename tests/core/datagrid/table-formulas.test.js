/** Formeln über TableData (core/datagrid/table/formulas.js). */
import { suite, test, assertEqual, assertDeepEqual } from '../../test-utils.js';
import { TableData } from '../../../js/core/table-data.js';
import { evaluateFormula } from '../../../js/core/datagrid/datagrid-formula.js';
import { formulaGrid, recalcFormulas, remapFormulaRows, renameInFormulas } from '../../../js/core/datagrid/table/formulas.js';
import { deleteRows } from '../../../js/core/datagrid/table/ops.js';

const heads = [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }];
const mk = () => TableData.fromJSON({ rowCount: 7, columns: [[1, 2, 3, 4, 5, 6, 7], [10, 20, 30, 40, 50, 60, 70], new Array(7).fill(null)] });

/** Vergleichsfixtur als Daten: das Raster, wie es `evaluateFormula` heute bekommt. */
function legacyGrid() {
  const cols = heads.map((h, i) => ({ ...h, values: mk().columns[i] }));
  return { columns: cols, rowCount: 7, getColumnByIndex: (i) => cols[i] };
}

suite('Tabellenformeln', () => {
  test('=C1[1]*2 landet in der Tabelle', () => {
    const t = mk();
    recalcFormulas(heads, t, { c: { 0: '=C1[1]*2' } });
    assertEqual(t.columns[2][0], 2);
  });

  test('Bezüge liefern dasselbe wie evaluateFormula über das Raster', () => {
    const fs = ["='B'[2]", '=SUM(C1:C2)', "=SUM('A')", '=C2[3]+C1[3]', '=AVG(C2)', '=nonsense(', '=C9[1]'];
    const t = mk();
    const formulas = { c: {} };
    fs.forEach((f, i) => { formulas.c[i] = f; });
    recalcFormulas(heads, t, formulas);
    const legacy = legacyGrid();
    fs.forEach((f, i) => {
      const { result, error } = evaluateFormula(f, legacy);
      assertEqual(t.columns[2][i], error ? null : result, f);
    });
  });

  test('formulaGrid teilt die Spaltenarrays ohne Kopie', () => {
    const t = mk();
    const g = formulaGrid(heads, t, {});
    assertEqual(g.getColumnByIndex(1).values === t.columns[1], true);
    assertEqual(g.rowCount, 7);
  });

  test('remapFormulaRows nach deleteRows(1,1)', () => {
    const t = mk();
    const formulas = { c: { 1: '=C1[2]', 3: '=C1[4]' } };
    deleteRows(t, 1, 1);
    const dropped = remapFormulaRows(formulas, (r) => (r === 1 ? -1 : r > 1 ? r - 1 : r));
    assertDeepEqual(formulas, { c: { 2: '=C1[4]' } });
    assertEqual(dropped.length, 1);
    assertEqual(dropped[0].row, 1);
  });

  test('remapFormulaRows ohne Treffer entfernt leere Spalte', () => {
    const f = { c: { 0: '=1' } };
    remapFormulaRows(f, () => null);
    assertDeepEqual(f, {});
  });

  test('renameInFormulas schreibt um und liefert Umkehrdaten', () => {
    const f = { c: { 0: "=SUM('A')", 1: '=1' } };
    const undo = renameInFormulas(f, 'A', 'X');
    assertEqual(f.c[0], "=SUM('X')");
    assertDeepEqual(undo, [{ columnId: 'c', row: 0, oldFormula: "=SUM('A')" }]);
  });

  test('renameInFormulas ohne neuen Namen nimmt den Kurznamen', () => {
    const f = { c: { 0: "=SUM('A')" } };
    renameInFormulas(f, 'A', null, 'C1');
    assertEqual(f.c[0], '=SUM(C1)');
  });
});
