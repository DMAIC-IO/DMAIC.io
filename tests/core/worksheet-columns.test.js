/**
 * Unit tests — Worksheet Column Access Core (js/core/worksheet-columns.js)
 *
 * Pins the shared low-level data-access primitives extracted from the GLM,
 * correlation and column-picker consumers:
 *   - resolveColumnRef  — ref → column object (or null on any missing hop)
 *   - getColumnRawValues — column's raw values array (or [])
 *   - coerceNumeric     — plain, type-agnostic cell → number|null coercion
 *
 * These are pure given a mock stateManager; the per-module row-filters that
 * sit on top (correlation pairwise alignment, glm buildFitData) are tested in
 * the respective module test files.
 */

import { suite, test, assertEqual, assertDeepEqual, assertThrows } from '../test-utils.js';
import {
  resolveColumnRef, getColumnRawValues, coerceNumeric, discoverColumns,
  registerWorksheetReader, readWorksheet,
} from '../../js/core/worksheet-columns.js';
import { useStoredWorksheetReader } from '../helpers/worksheet-reader.js';
import { readWorksheetState } from '../../js/modules/worksheet/worksheet-read.js';

// ── Mock stateManager backed by a single worksheet ──────────────────────────

function makeStateManager(columns) {
  const rowCount = Math.max(0, ...columns.map(c => c.values?.length ?? 0));
  const wsState = {
    sheets: [{ id: 'sheet-1', name: 'Tabelle', state: { rowCount, columns } }],
  };
  const phases = { measure: [{ moduleId: 'worksheet', instanceId: 'ws-1' }] };
  const sm = {
    get(path) {
      if (path === 'phases') return phases;
      if (path.startsWith('phases.')) return phases[path.slice('phases.'.length)] ?? [];
      return undefined;
    },
    getModuleState(id) {
      return id === 'ws-1' ? wsState : null;
    },
  };
  useStoredWorksheetReader(sm);
  return sm;
}

const REF = (columnId, over = {}) => ({
  instanceId: 'ws-1', sheetId: 'sheet-1', columnId, ...over,
});

function sm() {
  return makeStateManager([
    { id: 'c-x', name: 'X', shortName: 'X', type: 'numeric', values: [1, 2, 3] },
    { id: 'c-cat', name: 'Cat', shortName: 'C', type: 'text', values: ['a', 'b'] },
    { id: 'c-empty', name: 'E', shortName: 'E', type: 'numeric' }, // no values key
  ]);
}

// ── resolveColumnRef ────────────────────────────────────────────────────────

suite('worksheet-columns: resolveColumnRef', () => {
  test('resolves an existing ref to the column object', () => {
    const col = resolveColumnRef(sm(), REF('c-x'));
    assertEqual(col?.id, 'c-x');
    assertEqual(col?.type, 'numeric');
  });

  test('null ref → null', () => {
    assertEqual(resolveColumnRef(sm(), null), null);
  });

  test('null stateManager → null (no throw)', () => {
    assertEqual(resolveColumnRef(null, REF('c-x')), null);
  });

  test('missing worksheet instance → null', () => {
    assertEqual(resolveColumnRef(sm(), REF('c-x', { instanceId: 'nope' })), null);
  });

  test('missing sheet → null', () => {
    assertEqual(resolveColumnRef(sm(), REF('c-x', { sheetId: 'nope' })), null);
  });

  test('missing column → null', () => {
    assertEqual(resolveColumnRef(sm(), REF('nope')), null);
  });

  test('stateManager returning a worksheet without sheets → null', () => {
    const bad = { getModuleState: () => ({}) };
    useStoredWorksheetReader(bad);
    assertEqual(resolveColumnRef(bad, REF('c-x')), null);
  });
});

// ── Leser (readSync) ────────────────────────────────────────────────────────

/** Ein Leser-Doppel, das jeden Aufruf protokolliert und aus einer eigenen Map liest. */
function recordingReader(states, fail = null) {
  const calls = [];
  const read = (id, options) => {
    calls.push([id, options]);
    if (fail) { const e = new Error(fail); e.code = fail; throw e; }
    if (!(id in states)) { const e = new Error('unknown_instance'); e.code = 'unknown_instance'; throw e; }
    return readWorksheetState(states[id], options);
  };
  return { calls, read };
}

/** Ein stateManager, dessen getModuleState wirft: die Fassade darf ihn nicht mehr rufen. */
function strictStateManager(phases) {
  return {
    get(path) {
      if (path === 'phases') return phases;
      if (path.startsWith('phases.')) return phases[path.slice('phases.'.length)] ?? [];
      return undefined;
    },
    getModuleState() { throw new Error('getModuleState must not be called'); },
  };
}

const STORED = {
  'ws-1': { sheets: [{ id: 'sheet-1', name: 'Tabelle', state: { rowCount: 3, columns: [
    { id: 'c-x', name: 'X', shortName: 'X', type: 'numeric', unit: 'mm', roleManual: true, role: 'continuous',
      format: { decimals: 2 }, meta: { a: 1 }, values: [1, null, 3] },
    { id: 'c-cat', name: 'Cat', shortName: 'C', type: 'text', values: ['a', 'b'] },
  ] } }] },
};

suite('worksheet-columns: Leser über readSync', () => {
  test('resolveColumnRef ruft genau readSync(instanceId, { sheetId, columns: [columnId] }) und liefert das Spaltenobjekt (P5)', () => {
    const sm = strictStateManager({ data: [{ moduleId: 'worksheet', instanceId: 'ws-1' }] });
    const reader = recordingReader(STORED);
    registerWorksheetReader(sm, reader.read);
    const col = resolveColumnRef(sm, REF('c-x'));
    assertDeepEqual(reader.calls, [['ws-1', { sheetId: 'sheet-1', columns: ['c-x'] }]]);
    assertDeepEqual(col, {
      id: 'c-x', name: 'X', shortName: 'X', type: 'numeric', unit: 'mm', role: 'continuous',
      roleManual: true, format: { decimals: 2 }, meta: { a: 1 }, values: [1, null, 3],
    });
  });

  test('resolveColumnRef ohne sheetId → null, ohne Lesen', () => {
    const sm = strictStateManager({});
    const reader = recordingReader(STORED);
    registerWorksheetReader(sm, reader.read);
    assertEqual(resolveColumnRef(sm, { instanceId: 'ws-1', columnId: 'c-x' }), null);
    assertEqual(reader.calls.length, 0);
  });

  for (const code of ['unknown_column', 'not_loaded', 'unknown_instance']) {
    test(`wirft der Leser ${code} → resolveColumnRef null`, () => {
      const sm = strictStateManager({});
      registerWorksheetReader(sm, recordingReader(STORED, code).read);
      assertEqual(resolveColumnRef(sm, REF('c-x')), null);
      assertDeepEqual(getColumnRawValues(sm, REF('c-x')), []);
    });
  }

  test('unbekannte Spalte über den echten Leser → null', () => {
    const sm = strictStateManager({});
    registerWorksheetReader(sm, recordingReader(STORED).read);
    assertEqual(resolveColumnRef(sm, REF('nope')), null);
  });

  test('ohne registrierten Leser wirft resolveColumnRef', () => {
    const sm = strictStateManager({});
    assertThrows(() => resolveColumnRef(sm, REF('c-x')), /worksheet reader not registered/);
    assertThrows(() => readWorksheet(sm, 'ws-1'), /worksheet reader not registered/);
  });

  test('ein reaktiver Proxy des stateManager (__v_raw) findet den Leser des rohen Objekts', () => {
    const sm = strictStateManager({});
    registerWorksheetReader(sm, recordingReader(STORED).read);
    // So sieht ein Alpine-/Vue-Proxy aus: `__v_raw` liefert das rohe Objekt.
    const proxy = new Proxy(sm, { get: (t, k) => (k === '__v_raw' ? t : t[k]) });
    assertEqual(readWorksheet(proxy, 'ws-1').rowCount, 3);
    assertEqual(resolveColumnRef(proxy, REF('c-x'))?.id, 'c-x');
  });

  test('readWorksheet liefert das Lesen, bei Fehler null', () => {
    const sm = strictStateManager({});
    registerWorksheetReader(sm, recordingReader(STORED).read);
    assertEqual(readWorksheet(sm, 'ws-1').rowCount, 3);
    assertEqual(readWorksheet(sm, 'nope'), null);
    assertEqual(readWorksheet(sm, 'ws-1', { sheetId: 'nope' }), null);
  });

  test('discoverColumns liest über den Leser, nicht über getModuleState', () => {
    const states = {
      'ws-1': STORED['ws-1'],
      'ws-2': { sheets: [
        { id: 's-a', name: 'Leer', state: null },
        { id: 's-b', name: 'Zwei', state: { rowCount: 2, columns: [{ id: 'k', name: '', shortName: 'K', type: 'numeric', values: [5, 6] }] } },
      ] },
    };
    const sm = strictStateManager({
      data: [{ moduleId: 'worksheet', instanceId: 'ws-1' }, { moduleId: 'sipoc', instanceId: 'si' }],
      measure: [{ moduleId: 'worksheet', instanceId: 'ws-2' }],
    });
    registerWorksheetReader(sm, recordingReader(states).read);
    assertDeepEqual(discoverColumns(sm, { types: ['numeric'] }), [
      { instanceId: 'ws-1', sheetId: 'sheet-1', sheetName: 'Tabelle', columnId: 'c-x', columnName: 'X', shortName: 'X', type: 'numeric', valueCount: 2 },
      { instanceId: 'ws-2', sheetId: 's-b', sheetName: 'Zwei', columnId: 'k', columnName: '', shortName: 'K', type: 'numeric', valueCount: 2 },
    ]);
  });
});

// ── discoverColumns (Fixture über useStoredWorksheetReader) ─────────────────

suite('worksheet-columns: discoverColumns', () => {
  test('alle Spalten mit valueCount, Filter nach Typ und Anzahl', () => {
    const all = discoverColumns(sm());
    assertDeepEqual(all.map(c => [c.columnId, c.valueCount, c.shortName, c.sheetName]), [
      ['c-x', 3, 'X', 'Tabelle'], ['c-cat', 2, 'C', 'Tabelle'], ['c-empty', 0, 'E', 'Tabelle'],
    ]);
    assertDeepEqual(discoverColumns(sm(), { types: ['numeric'], minCount: 1 }).map(c => c.columnId), ['c-x']);
    assertDeepEqual(discoverColumns(sm(), { maxCount: 2 }).map(c => c.columnId), ['c-cat', 'c-empty']);
  });
});

// ── getColumnRawValues ──────────────────────────────────────────────────────

suite('worksheet-columns: getColumnRawValues', () => {
  test('returns the raw values array', () => {
    assertEqual(JSON.stringify(getColumnRawValues(sm(), REF('c-x'))), '[1,2,3]');
  });

  test('column without a values key → rowCount empty cells (read form P3)', () => {
    // Das Lesen liefert genau rowCount Einträge; fehlende Zellen sind null.
    assertEqual(JSON.stringify(getColumnRawValues(sm(), REF('c-empty'))), '[null,null,null]');
  });

  test('unresolvable ref → []', () => {
    assertEqual(JSON.stringify(getColumnRawValues(sm(), REF('nope'))), '[]');
  });

  test('null ref → []', () => {
    assertEqual(JSON.stringify(getColumnRawValues(sm(), null)), '[]');
  });

  test('keeps null/empty cells in place (no filtering)', () => {
    const m = makeStateManager([
      { id: 'c', name: 'C', shortName: 'C', type: 'numeric', values: [1, null, '', 4] },
    ]);
    assertEqual(JSON.stringify(getColumnRawValues(m, REF('c'))), '[1,null,"",4]');
  });
});

// ── coerceNumeric (plain, type-agnostic) ────────────────────────────────────

suite('worksheet-columns: coerceNumeric', () => {
  test('finite numbers pass through', () => {
    assertEqual(coerceNumeric(7), 7);
    assertEqual(coerceNumeric(0), 0);
    assertEqual(coerceNumeric(-3.5), -3.5);
  });

  test('numeric strings are parsed', () => {
    assertEqual(coerceNumeric('3.5'), 3.5);
    assertEqual(coerceNumeric('42'), 42);
    assertEqual(coerceNumeric('  10  '), 10); // Number() trims
  });

  test('empty / null / undefined → null', () => {
    assertEqual(coerceNumeric(''), null);
    assertEqual(coerceNumeric(null), null);
    assertEqual(coerceNumeric(undefined), null);
  });

  test('whitespace-only strings → null, not 0', () => {
    assertEqual(coerceNumeric(' '), null);
    assertEqual(coerceNumeric('\t'), null);
    assertEqual(coerceNumeric(' \n '), null);
  });

  test('non-numeric strings → null', () => {
    assertEqual(coerceNumeric('abc'), null);
    assertEqual(coerceNumeric('1,5'), null); // comma decimals NOT parsed
  });

  test('NaN number → null', () => {
    assertEqual(coerceNumeric(NaN), null);
  });

  test('±Infinity passes through (number, not NaN) — matches legacy toNumeric', () => {
    // A genuine Infinity value is `typeof number` and not NaN, so it falls
    // through the fast-path unchanged. This pins the byte-identical behaviour
    // of the original glm/correlation coercion (no consumer feeds Infinity in
    // practice, but the contract must not silently change).
    assertEqual(coerceNumeric(Infinity), Infinity);
    assertEqual(coerceNumeric(-Infinity), -Infinity);
  });

  test('the string "Infinity" → null (Number() yields a non-finite)', () => {
    assertEqual(coerceNumeric('Infinity'), null);
  });
});
