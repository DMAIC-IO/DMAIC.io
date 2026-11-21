import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../../test-utils.js';
import { analyze, inputValues, formatHint, specRefLines } from '../../../js/modules/process-capability/domain/analyze.js';
import { fmt, fmtZ, fmtFraction } from '../../../js/modules/process-capability/domain/format.js';
import { sourceColumns } from '../../../js/core/source-columns.js';

const VALS = [9.8, 10.1, 10.0, 9.9, 10.2, 10.05, 9.95, 10.1, 9.85, 10.0];
const REF = { instanceId: 'w', sheetId: 's', columnId: 'c' };
const IDS_REF = { instanceId: 'w', sheetId: 's', columnId: 'g' };

/** Model in der Form der Zielfassung. */
const modelOf = ({ params = {}, ...rest } = {}) => ({
  params: {
    name: '', unit: 'mm', lsl: null, target: null, usl: null, confidence: null,
    subgroupMode: 'size', subgroupSize: 1, withinMethod: '', unbiased: true, mrSpan: 2, ...params,
  },
  columnRef: null, subgroupColumnRef: null, embeddedValues: null, embeddedLabel: '', ...rest,
});
const readOf = (cols) => ({ values: (ref) => cols[ref.columnId] ?? null, name: (ref) => ref.columnId });
const noColumn = { values: () => { throw new Error('read must not be called'); }, name: () => null };

suite('process-capability domain — analyze', () => {
  test('no column and no embedded values → empty, methods still listed', () => {
    const a = analyze(modelOf(), noColumn);
    assertEqual(a.empty, true);
    assertEqual(a.result, null);
    assertTrue(a.methods.includes('averageMR'));
    assertEqual(a.method, 'averageMR');
    assertEqual('values' in a, false);
  });

  test('spec limits are numbers, null means no limit', () => {
    const a = analyze(modelOf({ embeddedValues: VALS, params: { lsl: 9.5, usl: 1010.5 } }), noColumn);
    assertEqual(a.result.lsl, 9.5);
    assertEqual(a.result.usl, 1010.5);
    const b = analyze(modelOf({ embeddedValues: VALS, params: { lsl: null, usl: 10.5 } }), noColumn);
    assertEqual(b.result.lsl, null);
    assertEqual(b.result.usl, 10.5);
  });

  test('embedded values win over the column', () => {
    const a = analyze(modelOf({ columnRef: REF, embeddedValues: VALS, params: { lsl: 9.5, usl: 10.5 } }), noColumn);
    assertEqual(a.result.n, VALS.length);
  });

  test('column values are filtered to numbers', () => {
    const a = analyze(modelOf({ columnRef: REF, params: { lsl: 9.5, usl: 10.5 } }),
      readOf({ c: [...VALS, null, 'x', NaN] }));
    assertEqual(a.result.n, VALS.length);
  });

  test('confidence null computes with 95, a number is used as percent', () => {
    const base = { embeddedValues: VALS, params: { lsl: 9.5, usl: 10.5 } };
    const a95 = analyze(modelOf({ ...base, params: { ...base.params, confidence: 95 } }), noColumn);
    const aNull = analyze(modelOf(base), noColumn);
    assertDeepEqual(aNull.result, a95.result);
    const a90 = analyze(modelOf({ ...base, params: { ...base.params, confidence: 90 } }), noColumn);
    assertTrue(JSON.stringify(a90.result) !== JSON.stringify(a95.result));
  });

  test('one-sided limit: Cp is null, Cpk is computed', () => {
    const a = analyze(modelOf({ embeddedValues: VALS, params: { usl: 10.5 } }), noColumn);
    assertEqual(a.result.Cp, null);
    assertTrue(Number.isFinite(a.result.Cpk));
  });

  test('no spec limit → no result, not empty', () => {
    const a = analyze(modelOf({ embeddedValues: VALS }), noColumn);
    assertEqual(a.result, null);
    assertEqual(a.empty, false);
  });

  test('ID-column mode with a mismatching ID column → missing-IDs hint', () => {
    const a = analyze(modelOf({
      columnRef: REF, subgroupColumnRef: { instanceId: 'other', sheetId: 'x', columnId: 'g' },
      params: { lsl: 9.5, usl: 10.5, subgroupMode: 'column' },
    }), readOf({ c: VALS }));
    assertEqual(a.result, null);
    assertDeepEqual(a.hint, { key: 'subgroupColumnMissing', params: {} });
  });

  test('ID-column mode aligns values and IDs into subgroups', () => {
    const ids = ['a', 'a', 'b', 'b', 'c', 'c', 'd', 'd', 'e', 'e'];
    const a = analyze(modelOf({
      columnRef: REF, subgroupColumnRef: IDS_REF, params: { lsl: 9.5, usl: 10.5, subgroupMode: 'column' },
    }), readOf({ c: VALS, g: ids }));
    assertEqual(a.method, 'pooled');
    assertEqual(a.result.n, VALS.length);
  });

  test('a referenced column that cannot be read gives no result and no throw', () => {
    const a = analyze(modelOf({ columnRef: REF, params: { lsl: 9.5, usl: 10.5 } }), readOf({}));
    assertEqual(a.result, null);
    assertEqual(a.empty, false);
  });

  test('a stored estimator that does not fit → fallback hint with keys, not text', () => {
    const a = analyze(modelOf({ embeddedValues: VALS, params: { lsl: 9.5, usl: 10.5, withinMethod: 'pooled' } }), noColumn);
    assertEqual(a.method, 'averageMR');
    assertDeepEqual(a.hint, { key: 'methodFallbackHint', params: { method: 'pooled', kind: 'kindSubgroups', fallback: 'averageMR' } });
    assertTrue(a.result !== null);
  });

  test('a span larger than the data → errWithinSpanTooLarge hint, no result', () => {
    const a = analyze(modelOf({ embeddedValues: VALS.slice(0, 5), params: { lsl: 9.5, usl: 10.5, mrSpan: 10 } }), noColumn);
    assertEqual(a.result, null);
    assertDeepEqual(a.hint, { key: 'errWithinSpanTooLarge', params: {} });
  });

  test('works with the reader over a source (sourceColumns)', () => {
    const src = {
      list: () => [{ instanceId: 'w', moduleId: 'worksheet' }],
      read: (_i, o) => ({ sheetId: o.sheetId, columns: [{ id: o.columns[0], values: VALS }] }),
    };
    const a = analyze(modelOf({ columnRef: REF, params: { lsl: 9.5, usl: 10.5 } }), sourceColumns(src));
    assertEqual(a.result.n, VALS.length);
  });
});

suite('process-capability domain — inputValues', () => {
  test('embedded values, although a column is referenced', () => {
    assertDeepEqual(inputValues(modelOf({ columnRef: REF, embeddedValues: VALS }), noColumn), VALS);
  });

  test('column values: decimal comma counts, text and null drop out', () => {
    assertDeepEqual(inputValues(modelOf({ columnRef: REF }), readOf({ c: ['1,5', 'x', null] })), [1.5]);
  });

  test('no data → empty list', () => {
    assertDeepEqual(inputValues(modelOf(), noColumn), []);
    assertDeepEqual(inputValues(modelOf({ columnRef: REF }), readOf({})), []);
  });

  test('ID-column mode: the values that go with an ID', () => {
    const m = modelOf({ columnRef: REF, subgroupColumnRef: IDS_REF, params: { subgroupMode: 'column' } });
    assertDeepEqual(inputValues(m, readOf({ c: [1, 2, 3], g: ['a', '', 'b'] })), [1, 3]);
  });
});

suite('process-capability domain — formatHint and refLines', () => {
  const t = (k, p) => (p ? `${k}(${Object.values(p).join('|')})` : k);

  test('formatHint translates method names and the kind', () => {
    assertEqual(formatHint(null, t), '');
    assertEqual(formatHint({ key: 'subgroupColumnMissing', params: {} }, t), 'subgroupColumnMissing()');
    assertEqual(formatHint({ key: 'methodFallbackHint', params: { method: 'pooled', kind: 'kindSubgroups', fallback: 'averageMR' } }, t),
      'methodFallbackHint(withinMethodNames.pooled|kindSubgroups|withinMethodNames.averageMR)');
  });

  test('specRefLines: LSL/USL in error colour, target in success colour, only when set', () => {
    const lines = specRefLines({ hasLsl: true, lsl: 9.5, hasUsl: false, usl: null, targetVal: 10 }, (key) => key);
    assertDeepEqual(lines.map((l) => [l.label, l.value, l.color]), [
      ['common.sym.lsl', 9.5, 'var(--color-error)'], ['common.sym.target', 10, 'var(--color-success)'],
    ]);
  });
});

suite('process-capability domain — format', () => {
  test('fmt: dash for missing, fixed decimals otherwise', () => {
    assertEqual(fmt(null), '–');
    assertEqual(fmt(1.23456, 2), '1.23');
  });

  test('fmtZ: ±∞ as symbols, NaN as dash, finite with d decimals', () => {
    assertEqual(fmtZ(Infinity), '∞');
    assertEqual(fmtZ(-Infinity), '−∞');
    assertEqual(fmtZ(NaN), '–');
    assertEqual(fmtZ(3.00204, 2), '3.00');
  });

  test('fmtFraction: small fractions in exponent notation, never 0.000000', () => {
    assertEqual(fmtFraction(5.0826e-7), '5.083e-7');
    assertEqual(fmtFraction(0.001341), '0.001341');
    assertEqual(fmtFraction(0), '0');
  });
});
