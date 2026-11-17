/**
 * Arbeitsblatt: Migration 0 → 1.0 an gespeicherten Ständen des heutigen
 * Moduls. Die Fixturen stammen aus dem Browser (gespeicherter Modulstand
 * `stateManager.getModuleState` nach Bedienung des laufenden Moduls und des
 * ZEG-Blatts); `null-state` ist die Ausgabe von `buildInitialWorksheetState`
 * (core/worksheet-sheets.js).
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../../test-utils.js';
import { WorksheetModel } from '../../../js/modules/worksheet/domain/model.js';
import { from0 } from '../../../js/modules/worksheet/domain/migrations.js';
import { worksheetSnapshot } from '../../../js/modules/worksheet/worksheet-read.js';
import { recalcFormulas } from '../../../js/core/datagrid/table/formulas.js';
import { TableData } from '../../../js/core/table-data.js';
import { START_ROW_COUNT } from '../../../js/core/datagrid/datagrid-utils.js';
import { inferRole } from '../../../js/core/datagrid/datagrid-roles.js';

/** @param {string} name @returns {Promise<any>} */
async function fixture(name) {
  const res = await fetch(new URL(`./fixtures/${name}.json`, import.meta.url), { cache: 'no-cache' });
  return res.json();
}

const FIX = {
  formulas: await fixture('formulas-roles-lock'),
  nullState: await fixture('null-state'),
  fresh: await fixture('fresh-two-sheets'),
  twoSheets: await fixture('two-sheets-view'),
  zeg: await fixture('zeg-sheet'),
};

/** @param {any} json @returns {any} */
const clone = (json) => JSON.parse(JSON.stringify(json));

suite('worksheet: Migration 0→1.0', () => {
  test('Ids von Blättern und Spalten bleiben gleich', () => {
    for (const [name, saved] of Object.entries(FIX)) {
      if (name === 'nullState') continue;
      const m = WorksheetModel.fromJSON(clone(saved));
      assertDeepEqual(m.sheets.map(s => s.id), saved.sheets.map(s => s.id), name);
      m.sheets.forEach((s, i) => {
        assertDeepEqual(s.columns.map(c => c.id), saved.sheets[i].state.columns.map(c => c.id), `${name} ${s.id}`);
      });
    }
  });

  test('values landen in data, rowCount steht in der Tabelle', () => {
    const saved = FIX.formulas;
    const m = WorksheetModel.fromJSON(clone(saved));
    const sheet = m.sheets[0];
    assertTrue(sheet.data instanceof TableData);
    assertEqual(sheet.data.rowCount, saved.sheets[0].state.rowCount);
    assertEqual(sheet.data.columns.length, sheet.columns.length);
    saved.sheets[0].state.columns.forEach((c, i) => assertDeepEqual(sheet.data.columns[i], c.values, c.name));
    assertEqual('values' in sheet.columns[0], false);
    assertEqual('rowCount' in sheet, false);
  });

  test('Formeln in der dünnen Form { columnId: { "<Zeile>": "=…" } }', () => {
    const saved = FIX.formulas;
    const m = WorksheetModel.fromJSON(clone(saved));
    const cols = saved.sheets[0].state.columns;
    const doppelt = cols.find(c => c.name === 'Doppelt');
    const summe = cols.find(c => c.name === 'Summe');
    assertDeepEqual(m.sheets[0].formulas, {
      [doppelt.id]: Object.fromEntries([0, 1, 2, 3, 4, 5].map(r => [String(r), `='Wert'[${r + 1}]*2`])),
      [summe.id]: { 0: '=SUM(C2:C5)', 1: '=SUM(C1:C4)', 2: '=AVG(C1)', 3: "=C4[1]*'Wert'[2]" },
    });
  });

  test('Spaltenköpfe: Rolle, roleManual, meta.lock und Format bleiben', () => {
    const m = WorksheetModel.fromJSON(clone(FIX.formulas));
    const [wert, gruppe, datum] = m.sheets[0].columns;
    assertDeepEqual(wert.meta, { lock: 'hard', reason: 'Messwerte', managedBy: 'e2e' });
    assertDeepEqual(wert.format, { decimals: 2 });
    assertEqual(gruppe.role, 'categorical');
    assertEqual(gruppe.roleManual, true);
    assertEqual(wert.roleManual, false);
    assertEqual(gruppe.meta, null);
    assertDeepEqual(datum.format, { decimals: 6, dateFormat: 'yyyy-MM-dd' });
    assertDeepEqual(Object.keys(wert).sort(),
      ['format', 'id', 'meta', 'name', 'role', 'roleManual', 'shortName', 'type', 'unit']);
  });

  test('state: null wird ein Blatt mit C1–C5 und START_ROW_COUNT Zeilen', () => {
    const m = WorksheetModel.fromJSON(clone(FIX.nullState));
    assertEqual(m.sheets.length, 1);
    const s = m.sheets[0];
    assertEqual(s.id, 'sheet_1');
    assertEqual(s.name, 'Tabelle');
    assertDeepEqual(s.columns.map(c => c.shortName), ['C1', 'C2', 'C3', 'C4', 'C5']);
    assertTrue(s.columns.every(c => c.type === 'numeric' && c.role === 'continuous' && c.meta === null && c.name === ''));
    assertEqual(new Set(s.columns.map(c => c.id)).size, 5);
    assertEqual(s.data.rowCount, START_ROW_COUNT);
    assertTrue(s.data.columns.every(col => col.length === START_ROW_COUNT && col.every(v => v === null)));
    assertDeepEqual(s.formulas, {});
    assertEqual(m.activeSheetId, 'sheet_1');
    assertEqual(m.sheetCounter, 1);
  });

  test('sortCol/sortDir fallen weg, colWidths/selection wandern nach gridView', () => {
    const saved = FIX.twoSheets;
    const m = WorksheetModel.fromJSON(clone(saved));
    const json = m.toJSON();
    assertEqual(JSON.stringify(json).includes('sortCol'), false);
    assertEqual(JSON.stringify(json).includes('sortDir'), false);
    for (const s of saved.sheets) {
      assertDeepEqual(m.gridView[s.id].colWidths, s.state.colWidths, s.id);
      assertDeepEqual(m.gridView[s.id].selection, s.state.selection, s.id);
    }
    assertEqual(m.activeSheetId, saved.activeSheetId);
    assertEqual(m.sheetCounter, saved.sheetCounter);
  });

  test('ZEG-Blatt: verwaltete Spalten behalten meta, fehlende Rolle wird abgeleitet', () => {
    const saved = FIX.zeg;
    const m = WorksheetModel.fromJSON(clone(saved));
    const cols = m.sheets[0].columns;
    assertDeepEqual(cols.map(c => c.meta), saved.sheets[0].state.columns.map(c => c.meta));
    assertEqual(cols[0].role, 'date');
    assertTrue(cols.slice(1).every(c => c.role === 'continuous' || c.role === 'categorical'));
    assertTrue(cols.every(c => c.roleManual === false));
    assertEqual(cols[1].unit, '');
  });

  test('nach recalcFormulas gleichen die Werte denen von worksheetSnapshot', () => {
    for (const [name, saved] of Object.entries(FIX)) {
      const m = WorksheetModel.fromJSON(clone(saved));
      for (const sheet of m.sheets) {
        // Formelzellen leeren: so beweist der Vergleich die Neuberechnung, nicht die übernommenen Werte.
        sheet.columns.forEach((c, i) => {
          for (const r of Object.keys(sheet.formulas[c.id] ?? {})) sheet.data.columns[i][Number(r)] = null;
        });
        recalcFormulas(sheet.columns, sheet.data, sheet.formulas);
        const ids = sheet.columns.map(c => c.id);
        const snap = saved.sheets.find(s => s.id === sheet.id)?.state
          ? worksheetSnapshot(saved, { sheetId: sheet.id, columns: ids })
          : null;
        if (!snap) continue;
        assertEqual(sheet.data.rowCount, snap.rowCount, `${name} ${sheet.id}`);
        snap.columns.forEach((c, i) => assertDeepEqual(sheet.data.columns[i], c.values, `${name} ${sheet.id} ${c.id}`));
      }
    }
  });

  test('from0 ist rein: der Eingabestand bleibt unverändert', () => {
    const saved = clone(FIX.formulas);
    from0(saved);
    assertDeepEqual(saved, FIX.formulas);
  });

  test('Altstand ohne rowCount: die längste Spalte zählt (wie worksheetSnapshot)', () => {
    const saved = { sheets: [{ id: 's', name: 'S', state: { columns: [
      { id: 'a', name: 'A', shortName: 'C1', type: 'numeric', values: [1, 2, 3] },
      { id: 'b', name: 'B', shortName: 'C2', type: 'text', values: ['x'] },
    ] } }], activeSheetId: 's', sheetCounter: 1 };
    const m = WorksheetModel.fromJSON(saved);
    assertEqual(m.sheets[0].data.rowCount, 3);
    assertDeepEqual(m.sheets[0].data.columns, [[1, 2, 3], ['x', null, null]]);
    assertEqual(m.sheets[0].columns[0].unit, null);
  });

  test('currencySymbol bleibt (R10), null-Werte in meta fallen weg', () => {
    const out = from0({ sheets: [{ id: 's', name: 'S', state: { rowCount: 1, columns: [
      { id: 'a', name: 'A', shortName: 'C1', type: 'currency', values: [1], format: { decimals: 2, currencySymbol: '$' },
        meta: { lock: 'soft', reason: null, categoricalCoding: { lo: -1, hi: 1 } } },
    ] } }] });
    const col = out.sheets[0].columns[0];
    assertDeepEqual(col.format, { decimals: 2, currencySymbol: '$' });
    assertDeepEqual(col.meta, { lock: 'soft', categoricalCoding: { lo: -1, hi: 1 } });
  });

  test('Ansicht nur, wo das Blatt eine hatte; ungültige Auswahl wird null', () => {
    const out = from0({ sheets: [
      { id: 'a', name: 'A', state: null },
      { id: 'b', name: 'B', state: { rowCount: 0, columns: [], colWidths: { x: 'breit', y: 80 }, selection: { startCol: 'x' } } },
    ], activeSheetId: 'b', sheetCounter: 2 });
    assertEqual('a' in out.gridView, false);
    assertDeepEqual(out.gridView.b, { colWidths: { y: 80 }, selection: null });
    const m = WorksheetModel.fromJSON({ ...out, _schema: { version: '1.0' } });
    assertDeepEqual(m.sheets.map(s => s.id), ['a', 'b']);
  });

  test('alle Fixturen laden streng, kein Zellwert geht verloren', () => {
    for (const [name, saved] of Object.entries(FIX)) {
      const m = WorksheetModel.fromJSON(clone(saved));
      for (const sheet of m.sheets) {
        const old = saved.sheets.find(s => s.id === sheet.id)?.state;
        if (!old) continue;
        old.columns.forEach((c, i) => {
          const expected = c.values.slice(0, old.rowCount).map(v => (v === '' && c.type !== 'text' ? null : v));
          assertDeepEqual(sheet.data.columns[i], expected, `${name} ${c.id}`);
        });
      }
    }
  });

  test('Alt-Text in einer Zahlenspalte: Spalte wird text, Werte bleiben, Rolle neu', () => {
    const saved = { sheets: [{ id: 's', name: 'S', state: { rowCount: 2, columns: [
      { id: 'a', name: 'A', shortName: 'C1', type: 'numeric', role: 'continuous', roleManual: false, values: ['2,5', 3], format: { decimals: 2 } },
      { id: 'b', name: 'B', shortName: 'C2', type: 'numeric', role: 'continuous', values: [1, 2] },
    ] } }], activeSheetId: 's', sheetCounter: 1 };
    const m = WorksheetModel.fromJSON(saved);
    const [a, b] = m.sheets[0].columns;
    assertEqual(a.type, 'text');
    assertDeepEqual(m.sheets[0].data.columns[0], ['2,5', 3]);
    assertEqual(a.role, inferRole({ type: 'text', values: ['2,5', 3] }));
    assertEqual(b.type, 'numeric');
  });

  test('Alt-Text: eine von Hand gesetzte Rolle, die zu text passt, bleibt', () => {
    const saved = { sheets: [{ id: 's', name: 'S', state: { rowCount: 2, columns: [
      { id: 'a', name: 'A', shortName: 'C1', type: 'numeric', role: 'categorical', roleManual: true, values: ['x', 3] },
      { id: 'b', name: 'B', shortName: 'C2', type: 'numeric', role: 'continuous', roleManual: true, values: ['y', 4] },
    ] } }] };
    const [a, b] = WorksheetModel.fromJSON(saved).sheets[0].columns;
    assertEqual(a.role, 'categorical');
    assertEqual(a.roleManual, true);
    assertEqual(b.roleManual, false, 'continuous passt nicht zu text');
  });

  test("'' wird in Nicht-Textspalten null, in Textspalten bleibt es", () => {
    const saved = { sheets: [{ id: 's', name: 'S', state: { rowCount: 2, columns: [
      { id: 'a', name: 'A', shortName: 'C1', type: 'numeric', values: ['', 3] },
      { id: 'd', name: 'D', shortName: 'C2', type: 'date', values: ['', '2025-01-01'] },
      { id: 't', name: 'T', shortName: 'C3', type: 'text', values: ['', 'x'] },
    ] } }] };
    const m = WorksheetModel.fromJSON(saved);
    assertDeepEqual(m.sheets[0].columns.map(c => c.type), ['numeric', 'date', 'text']);
    assertDeepEqual(m.sheets[0].data.columns, [[null, 3], [null, '2025-01-01'], ['', 'x']]);
  });

  test('Formelzellen zählen nicht als Alt-Text', () => {
    const saved = { sheets: [{ id: 's', name: 'S', state: { rowCount: 1, columns: [
      { id: 'a', name: 'A', shortName: 'C1', type: 'numeric', values: ['ja'], formulas: ['=IF(1>0;"ja";"nein")'] },
    ] } }] };
    const m = WorksheetModel.fromJSON(saved);
    assertEqual(m.sheets[0].columns[0].type, 'numeric');
  });
});
