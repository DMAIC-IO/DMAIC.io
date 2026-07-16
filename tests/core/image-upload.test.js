/**
 * Tests for js/core/image-upload.js
 *
 * Covers the pure, environment-independent parts of the shared image helper.
 *
 * `jpegDataUrlBytes` is the base64 → decoded-byte-size estimator used by
 * `compressImageToBudget` (extracted from ishikawa) to compare each encode
 * against the byte budget. It is a pure string function, so we pin its exact
 * arithmetic here.
 *
 * `compressImageToBudget` itself depends on `Image`, `<canvas>` and
 * `URL.createObjectURL`, which are not available in the headless Node unit
 * bridge — it is covered by ishikawa's image-upload E2E tests instead.
 */

import { suite, test, assertEqual } from '../test-utils.js';
import { jpegDataUrlBytes } from '../../js/core/image-upload.js';

const PREFIX = 'data:image/jpeg;base64,';

suite('image-upload: jpegDataUrlBytes', () => {
  test('empty payload → 0 bytes', () => {
    assertEqual(jpegDataUrlBytes(PREFIX), 0, 'no base64 body decodes to 0 bytes');
  });

  test('4 base64 chars → 3 bytes', () => {
    assertEqual(jpegDataUrlBytes(PREFIX + 'AAAA'), 3, '4 base64 chars ≈ 3 decoded bytes');
  });

  test('uses ceil so partial groups round up', () => {
    // 5 base64 chars → 5*3/4 = 3.75 → ceil → 4
    assertEqual(jpegDataUrlBytes(PREFIX + 'AAAAA'), 4, 'partial base64 group rounds up');
  });

  test('8 base64 chars → 6 bytes', () => {
    assertEqual(jpegDataUrlBytes(PREFIX + 'AAAAAAAA'), 6, 'two full base64 groups → 6 bytes');
  });
});
