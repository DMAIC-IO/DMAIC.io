import { suite, test, assertEqual } from '../test-utils.js';
import { todayISO, addDaysISO, isIsoDate } from '../../js/core/local-date.js';

suite('core/local-date', () => {
  test('todayISO uses the local calendar date, zero-padded', () => {
    assertEqual(todayISO(new Date(2026, 0, 5, 0, 30)), '2026-01-05');
    assertEqual(todayISO(new Date(2026, 11, 31, 23, 59)), '2026-12-31');
  });

  test('addDaysISO crosses month and year boundaries', () => {
    assertEqual(addDaysISO('2026-01-31', 1), '2026-02-01');
    assertEqual(addDaysISO('2026-12-25', 14), '2027-01-08');
    assertEqual(addDaysISO('2026-03-01', -1), '2026-02-28');
  });

  test('addDaysISO is stable across a DST change', () => {
    assertEqual(addDaysISO('2026-03-28', 2), '2026-03-30');
    assertEqual(addDaysISO('2026-10-24', 2), '2026-10-26');
  });

  test('isIsoDate accepts only YYYY-MM-DD strings', () => {
    assertEqual(isIsoDate('2026-10-10'), true);
    assertEqual(isIsoDate('10.10.2026'), false);
    assertEqual(isIsoDate(''), false);
    assertEqual(isIsoDate(undefined), false);
  });
});
