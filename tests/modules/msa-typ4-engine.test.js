/**
 * D.Mike — MSA Typ 4 Engine Tests (msa-typ4-engine.test.js)
 * Unit tests for input validation (validate()).
 * See docs/modules/MSA-TYP4.md for the module spec.
 */

import { suite, test, assert, assertClose } from '../test-utils.js';
import { validate } from '../../js/engines/msa-typ4-engine.js';

suite('msa-typ4-engine — validate', () => {
  test('leere Eingabe → E_TOO_FEW_REFERENCES', () => {
    const r = validate([], [], { pvMode: 'tolerance', LSL: 0, USL: 10 });
    assert(!r.valid);
    assert(r.errorKey === 'modules.msa-typ4.errTooFewReferences');
  });

  test('unterschiedliche Längen → E_LENGTH_MISMATCH', () => {
    const r = validate([1, 2, 3], [1, 2], { pvMode: 'tolerance', LSL: 0, USL: 10 });
    assert(!r.valid);
    assert(r.errorKey === 'modules.msa-typ4.errLengthMismatch');
  });

  test('nur 4 Referenzen → E_TOO_FEW_REFERENCES', () => {
    const ref = [1,1,1, 2,2,2, 3,3,3, 4,4,4];
    const y   = [1,1,1, 2,2,2, 3,3,3, 4,4,4];
    const r = validate(ref, y, { pvMode: 'tolerance', LSL: 0, USL: 10 });
    assert(!r.valid);
    assert(r.errorKey === 'modules.msa-typ4.errTooFewReferences');
  });

  test('nur 2 Wiederholungen für eine Referenz → E_TOO_FEW_REPEATS', () => {
    const ref = [1,1,1, 2,2,2, 3,3,3, 4,4,4, 5,5];
    const y   = ref.slice();
    const r = validate(ref, y, { pvMode: 'tolerance', LSL: 0, USL: 10 });
    assert(!r.valid);
    assert(r.errorKey === 'modules.msa-typ4.errTooFewRepeats');
  });

  test('PV ≤ 0 (Toleranz negativ) → E_INVALID_PV', () => {
    const ref = [1,1,1, 2,2,2, 3,3,3, 4,4,4, 5,5,5];
    const y   = ref.slice();
    const r = validate(ref, y, { pvMode: 'tolerance', LSL: 10, USL: 5 });
    assert(!r.valid);
    assert(r.errorKey === 'modules.msa-typ4.errInvalidPv');
  });

  test('NaN in Messwerten → E_NAN_VALUES', () => {
    const ref = [1,1,1, 2,2,2, 3,3,3, 4,4,4, 5,5,5];
    const y   = ref.slice(); y[3] = NaN;
    const r = validate(ref, y, { pvMode: 'tolerance', LSL: 0, USL: 10 });
    assert(!r.valid);
    assert(r.errorKey === 'modules.msa-typ4.errNanValues');
  });

  test('sauberer Input → valid', () => {
    const ref = [1,1,1, 2,2,2, 3,3,3, 4,4,4, 5,5,5];
    const y   = ref.slice();
    const r = validate(ref, y, { pvMode: 'tolerance', LSL: 0, USL: 10 });
    assert(r.valid);
    assert(r.errorKey === null);
  });
});
