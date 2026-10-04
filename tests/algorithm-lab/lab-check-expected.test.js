/**
 * D.Mike — Algorithm Lab: `checkExpected` (the Validation tab's comparison).
 *
 * The Validation tab used to compare a top-level array `expected` only by
 * position: it walked the expected entries and ignored any extra entries in
 * the actual result. A dropped VIF term list (main + 2FI instead of main
 * effects only) therefore still passed the "main effects only" case.
 *
 * Rule pinned here: every array — top-level or nested, including rows of an
 * array of arrays — must have exactly as many entries as the expected array.
 * Object keys keep subset semantics: a fixture may list only the result keys
 * it has a gold reference for, extra keys in the result are fine.
 */
import { suite, test, assertTrue, assertEqual } from '../test-utils.js';
import { checkExpected } from '../../js/algorithm-lab/lab-exec.js';

const TOL = { absolute: 1e-12, relative: 1e-10 };

suite('Algorithm Lab: checkExpected array lengths', () => {
  test('top-level array: an extra actual entry fails', () => {
    const actual = [{ term: 'A', vif: 1 }, { term: 'B', vif: 1 }, { term: 'A×B', vif: 1 }];
    const expected = [{ term: 'A', vif: 1 }, { term: 'B', vif: 1 }];
    const r = checkExpected(actual, expected, TOL);
    assertEqual(r.pass, false, 'extra term must fail');
    assertTrue(r.details.includes('length 3 ≠ 2'), `details name the lengths: "${r.details}"`);
  });

  test('top-level array: a missing actual entry fails', () => {
    const r = checkExpected([{ vif: 1 }], [{ vif: 1 }, { vif: 2 }], TOL);
    assertEqual(r.pass, false);
    assertTrue(r.details.includes('length 1 ≠ 2'), r.details);
  });

  test('array of arrays: an extra column in a row fails', () => {
    const r = checkExpected([[-1, -1, 0], [1, 1, 0]], [[-1, -1], [1, 1]], TOL);
    assertEqual(r.pass, false);
    assertTrue(r.details.includes('0: length 3 ≠ 2'), r.details);
  });

  test('array of arrays: an extra row fails', () => {
    const r = checkExpected([[-1, -1], [1, 1], [0, 0]], [[-1, -1], [1, 1]], TOL);
    assertEqual(r.pass, false);
  });

  test('top-level array but actual is not an array fails', () => {
    const r = checkExpected({ 0: { vif: 1 } }, [{ vif: 1 }], TOL);
    assertEqual(r.pass, false);
  });

  test('object path holding an array: extra entry fails', () => {
    const r = checkExpected({ coef: [1, 2, 3] }, { coef: [1, 2] }, TOL);
    assertEqual(r.pass, false);
    assertTrue(r.details.includes('coef: length 3 ≠ 2'), r.details);
  });

  test('nested array inside a top-level array entry: extra entry fails', () => {
    const r = checkExpected([{ ci: [1, 2, 3] }], [{ ci: [1, 2] }], TOL);
    assertEqual(r.pass, false);
    assertTrue(r.details.includes('0.ci: length 3 ≠ 2'), r.details);
  });

  test('value mismatch inside an array names the index path', () => {
    const r = checkExpected([{ term: 'A', vif: 1 }, { term: 'B', vif: 1.5 }],
      [{ term: 'A', vif: 1 }, { term: 'B', vif: 1 }], TOL);
    assertEqual(r.pass, false);
    assertTrue(r.details.includes('1.vif: 1.5 ≠ 1'), r.details);
  });
});

suite('Algorithm Lab: checkExpected keeps object-key subset semantics', () => {
  test('extra keys in a top-level array entry pass', () => {
    const r = checkExpected([{ term: 'A', vif: 1, r2: 0 }], [{ term: 'A', vif: 1 }], TOL);
    assertEqual(r.pass, true, r.details);
    assertEqual(r.details, 'All values match');
  });

  test('extra result keys beside the expected paths pass', () => {
    const r = checkExpected({ cpk: 1.2, n: 30, meta: { x: 1 } }, { cpk: 1.2 }, TOL);
    assertEqual(r.pass, true, r.details);
  });

  test('dot-paths and tolerance still work', () => {
    const r = checkExpected({ a: { b: 1 + 1e-12 } }, { 'a.b': 1 }, TOL);
    assertEqual(r.pass, true, r.details);
  });

  test('equal arrays pass, including arrays of arrays', () => {
    assertEqual(checkExpected([[1, 2], [3, 4]], [[1, 2], [3, 4]], TOL).pass, true);
    assertEqual(checkExpected([{ v: [1, 2] }], [{ v: [1, 2] }], TOL).pass, true);
  });

  test('expected null still accepts a missing value', () => {
    assertEqual(checkExpected([{ v: 1 }], [{ v: 1, w: null }], TOL).pass, true);
  });
});
