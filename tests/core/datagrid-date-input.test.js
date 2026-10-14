import { suite, test, assertEqual } from '../test-utils.js';
import { parseCellInput } from '../../js/core/datagrid/datagrid-utils.js';

// The unit runner is pinned to Europe/Berlin (unit-tests.spec.js), east of
// UTC: a date parsed as local midnight and serialised via toISOString() lands
// on the previous day there.
const DATE_COL = { type: 'date' };

suite('core/datagrid date input', () => {
  test('runs in a time zone east of UTC', () => {
    assertEqual(new Date(2026, 6, 1).getTimezoneOffset() < 0, true);
  });

  test('an unpadded ISO date keeps its calendar day', () => {
    assertEqual(parseCellInput(DATE_COL, '2026-7-1'), '2026-07-01');
    assertEqual(parseCellInput(DATE_COL, '2026-1-9'), '2026-01-09');
  });

  test('a padded ISO date passes through unchanged', () => {
    assertEqual(parseCellInput(DATE_COL, '2026-07-01'), '2026-07-01');
    assertEqual(parseCellInput(DATE_COL, ' 2026-12-31 '), '2026-12-31');
  });

  test('a slash-separated date keeps its calendar day', () => {
    assertEqual(parseCellInput(DATE_COL, '2026/7/1'), '2026-07-01');
  });

  test('a German date keeps its calendar day', () => {
    assertEqual(parseCellInput(DATE_COL, '1.7.2026'), '2026-07-01');
    assertEqual(parseCellInput(DATE_COL, '01.07.26'), '2026-07-01');
  });

  test('a free-form date is read as a local calendar day', () => {
    assertEqual(parseCellInput(DATE_COL, 'July 1, 2026'), '2026-07-01');
  });

  test('an impossible date is kept as typed', () => {
    assertEqual(parseCellInput(DATE_COL, '2026-2-30'), '2026-2-30');
    assertEqual(parseCellInput(DATE_COL, 'kein Datum'), 'kein Datum');
  });
});
