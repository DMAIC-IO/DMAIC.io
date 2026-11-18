/**
 * Tests for js/modules/doe-planner/domain/source.js — factor and response
 * values of a source worksheet, read through the reader `src`.
 */
import { suite, test, assertEqual, assertDeepEqual } from '../../test-utils.js';
import { sourceData } from '../../../js/modules/doe-planner/domain/source.js';
import { storedSource } from '../../helpers/stored-source.js';
import { spySource } from '../../helpers/sheet-source.js';

/**
 * A reader (`Source`) over sheets of one worksheet instance.
 * @param {Record<string, { rowCount: number, columns: Array<{ id: string, name: string, type?: string, values: any[] }> }>} sheets
 */
function fakeData(sheets, instanceId = 'ws-src') {
  return storedSource({ [instanceId]: { sheets: Object.entries(sheets).map(([sid, sh]) => ({
    id: sid, name: sid,
    state: { rowCount: sh.rowCount, columns: sh.columns.map((c) => ({ id: c.id, name: c.name, type: c.type ?? 'numeric', values: c.values })) },
  })) } });
}

const REF = { instanceId: 'ws-src', sheetId: 'sh1' };
const responses = [{ name: 'Yield', unit: '%' }];

suite('doe-planner domain — sourceData', () => {
  test('liest Stufen und Zellwerte mit Dezimalkomma', () => {
    const data = fakeData({ sh1: { rowCount: 3, columns: [
      { id: 'c1', name: 'X1', values: ['2,5', '7,5', '5'] },
      { id: 'c2', name: 'Yield', values: [1, 2, 3] },
    ] } });
    const fx = [{ name: 'X1', kind: 'continuous', levels: ['2,5', '7,5'] }];
    const out = sourceData(data, REF, fx, responses);
    assertEqual(out.ok, true);
    assertDeepEqual(out.codedMatrix, [[-1], [1], [0]]);
    assertDeepEqual(out.actualRows, [[2.5], [7.5], [5]]);
    assertDeepEqual(out.responseValues, [[1, 2, 3]]);
    assertEqual(out.rowCount, 3);
    assertEqual(out.mappedResponseCount, 1);
    assertEqual(out.skippedRows, 0);
    assertDeepEqual(out.errors, []);
  });

  test("'2,5' als Zielgröße zählt, Leerwerte und Text nicht", () => {
    const data = fakeData({ sh1: { rowCount: 4, columns: [
      { id: 'c1', name: 'X1', values: [1, 2, 1, 2] },
      { id: 'c2', name: ' yield ', values: ['2,5', '', 'abc', 4] },
    ] } });
    const fx = [{ name: 'X1', kind: 'continuous', levels: ['1', '2'] }];
    const out = sourceData(data, REF, fx, responses);
    assertDeepEqual(out.responseValues, [[2.5, null, null, 4]]);
  });

  test('kategoriale Faktoren nach Stufe, ungültige Zeilen werden übersprungen, Werte geklemmt', () => {
    const data = fakeData({ sh1: { rowCount: 4, columns: [
      { id: 'c1', name: 'Temp', values: [100, 250, '', 150] },
      { id: 'c2', name: 'Mat', type: 'text', values: ['stahl', 'Kupfer', 'Stahl', 'Holz'] },
    ] } });
    const fx = [
      { name: 'Temp', kind: 'continuous', levels: ['100', '200'] },
      { name: 'Mat', kind: 'categorical', levels: ['Stahl', 'Kupfer'] },
    ];
    const out = sourceData(data, REF, fx, responses);
    assertEqual(out.ok, true);
    assertDeepEqual(out.codedMatrix, [[-1, -1], [1, 1]]);
    assertDeepEqual(out.actualRows, [[100, 'Stahl'], [250, 'Kupfer']]);
    assertDeepEqual(out.responseValues, [[null, null]]);
    assertEqual(out.mappedResponseCount, 0);
    assertEqual(out.skippedRows, 2);
  });

  test('Fehlerfälle wie bisher', () => {
    const fx = [{ name: 'X1', kind: 'continuous', levels: ['1', '2'] }];
    assertDeepEqual(sourceData(fakeData({}), null, fx, responses), { ok: false, errors: ['source-missing-ref'] });
    assertDeepEqual(sourceData(fakeData({}), { instanceId: 'ws-src' }, fx, responses), { ok: false, errors: ['source-missing-ref'] });
    assertDeepEqual(sourceData(fakeData({}, 'other'), REF, fx, responses), { ok: false, errors: ['source-not-found'] });
    assertDeepEqual(sourceData(fakeData({}), REF, fx, responses), { ok: false, errors: ['source-sheet-not-found'] });
    assertDeepEqual(sourceData(fakeData({ sh1: { rowCount: 0, columns: [] } }), REF, fx, responses), { ok: false, errors: ['source-empty'] });
    assertDeepEqual(
      sourceData(fakeData({ sh1: { rowCount: 1, columns: [{ id: 'c', name: 'X9', values: [1] }] } }), REF, fx, responses),
      { ok: false, errors: ['source-missing-factor-columns'], missingFactors: ['X1'] },
    );
    assertDeepEqual(
      sourceData(fakeData({ sh1: { rowCount: 2, columns: [{ id: 'c', name: 'X1', values: [null, 'x'] }] } }), REF, fx, responses),
      { ok: false, errors: ['source-no-valid-rows'], skippedRows: 2 },
    );
    const flat = [{ name: 'X1', kind: 'continuous', levels: ['1', '1'] }];
    assertEqual(sourceData(fakeData({ sh1: { rowCount: 1, columns: [{ id: 'c', name: 'X1', values: [1] }] } }), REF, flat, responses).ok, false);
  });

  test('liest nur über src.read und src.list', () => {
    const data = fakeData({ sh1: { rowCount: 2, columns: [
      { id: 'c1', name: 'X1', values: [1, 2] },
      { id: 'c2', name: 'Yield', values: ['3,5', 4] },
    ] } });
    const fx = [{ name: 'X1', kind: 'continuous', levels: ['1', '2'] }];
    const out = sourceData(spySource(data), REF, fx, responses);
    assertDeepEqual(out.codedMatrix, [[-1], [1]]);
    assertDeepEqual(out.responseValues, [[3.5, 4]]);
  });
});
