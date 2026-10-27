import { suite, test, assertEqual, assertDeepEqual } from '../test-utils.js';
import { detectPattern, withCtrlModifier, generateFill } from '../../js/core/datagrid/datagrid-fill.js';
import { isIsoDate } from '../../js/core/local-date.js';

/** Wrap raw values as source cells. */
const cells = (...values) => values.map(value => ({ value, formula: null }));

/** Detect, apply the Ctrl modifier, and return only the generated values. */
function fill(values, columnType, count, dir = 1, ctrl = false) {
  const pattern = withCtrlModifier(detectPattern(cells(...values), columnType), ctrl);
  return { kind: pattern.kind, values: generateFill(pattern, count, dir).map(c => c.value) };
}

suite('core/datagrid fill', () => {
  test('a daily date series crosses the month boundary', () => {
    const r = fill(['2026-01-30', '2026-01-31'], 'date', 2);
    assertEqual(r.kind, 'dateStep');
    assertDeepEqual(r.values, ['2026-02-01', '2026-02-02']);
  });

  test('a daily date series honours the leap day', () => {
    const r = fill(['2024-02-27', '2024-02-28'], 'date', 2);
    assertEqual(r.kind, 'dateStep');
    assertDeepEqual(r.values, ['2024-02-29', '2024-03-01']);
  });

  test('a single date with Ctrl becomes a one-day series', () => {
    const r = fill(['2024-02-28'], 'date', 2, 1, true);
    assertEqual(r.kind, 'dateStep');
    assertDeepEqual(r.values, ['2024-02-29', '2024-03-01']);
  });

  test('a weekly date series keeps its step', () => {
    const r = fill(['2026-02-15', '2026-02-22'], 'date', 2);
    assertEqual(r.kind, 'dateStep');
    assertDeepEqual(r.values, ['2026-03-01', '2026-03-08']);
  });

  test('a date series fills backwards from the first cell', () => {
    const r = fill(['2026-03-01', '2026-03-03'], 'date', 2, -1);
    assertEqual(r.kind, 'dateStep');
    assertDeepEqual(r.values, ['2026-02-27', '2026-02-25']);
  });

  test('a daily date series skips the 29th in a common year', () => {
    const r = fill(['2026-02-27', '2026-02-28'], 'date', 2);
    assertEqual(r.kind, 'dateStep');
    assertDeepEqual(r.values, ['2026-03-01', '2026-03-02']);
  });

  test('a daily date series reaches the 29th in a leap year', () => {
    const r = fill(['2028-02-27', '2028-02-28'], 'date', 2);
    assertEqual(r.kind, 'dateStep');
    assertDeepEqual(r.values, ['2028-02-29', '2028-03-01']);
  });

  test('an impossible date never counts on as text', () => {
    const r = fill(['2026-02-29', '2026-02-30'], 'date', 2);
    assertEqual(r.kind, 'repeat');
    assertDeepEqual(r.values, ['2026-02-29', '2026-02-30']);
  });

  test('an impossible single date with Ctrl is copied, not counted', () => {
    const r = fill(['2026-02-30'], 'date', 2, 1, true);
    assertEqual(r.kind, 'copy');
    assertDeepEqual(r.values, ['2026-02-30', '2026-02-30']);
  });

  test('an impossible date inside a series is skipped, the calendar goes on', () => {
    const r = fill(['2026-02-27', '2026-02-28', '2026-02-29'], 'date', 2);
    assertEqual(r.kind, 'dateStep');
    assertDeepEqual(r.values, ['2026-03-02', '2026-03-03']);
    // backwards: the impossible first slot stands for 03-02, so 03-01 comes next
    const b = fill(['2026-02-30', '2026-03-03', '2026-03-04'], 'date', 2, -1);
    assertEqual(b.kind, 'dateStep');
    assertDeepEqual(b.values, ['2026-03-01', '2026-02-28']);
  });

  test('ISO-shaped values in a text column follow the calendar too', () => {
    const r = fill(['2026-02-27', '2026-02-28'], 'text', 2);
    assertEqual(r.kind, 'dateStep');
    assertDeepEqual(r.values, ['2026-03-01', '2026-03-02']);
  });

  test('impossible ISO inputs never yield an impossible date', () => {
    const inputs = [
      ['2026-02-29', '2026-02-30'], ['2026-02-30'], ['2026-02-28', '2026-02-29'],
      ['2026-02-27', '2026-02-28', '2026-02-29'], ['2026-02-30', '2026-03-03', '2026-03-04'],
      ['2026-13-01', '2026-13-02'], ['2026-01-31', '2026-01-32'], ['2026-04-30', '2026-04-31'],
    ];
    for (const values of inputs) {
      for (const type of ['date', 'text']) {
        for (const dir of [1, -1]) {
          for (const ctrl of [false, true]) {
            const out = fill(values, type, 5, dir, ctrl).values;
            for (const v of out) {
              if (!values.includes(v)) assertEqual(isIsoDate(v), true, `${values} → ${v}`);
            }
          }
        }
      }
    }
  });

  test('a number series extrapolates both ways', () => {
    assertDeepEqual(fill([2, 4], 'numeric', 2).values, [6, 8]);
    assertDeepEqual(fill([2, 4], 'numeric', 2, -1).values, [0, -2]);
    assertEqual(fill([0.1, 0.2], 'numeric', 1).values[0], 0.3);
  });

  test('a text with trailing number counts up and keeps its padding', () => {
    const r = fill(['Run 08', 'Run 09'], 'text', 2);
    assertEqual(r.kind, 'textSuffix');
    assertDeepEqual(r.values, ['Run 10', 'Run 11']);
  });

  test('plain text repeats', () => {
    const r = fill(['A', 'B'], 'text', 3);
    assertEqual(r.kind, 'repeat');
    assertDeepEqual(r.values, ['A', 'B', 'A']);
  });

  test('a single plain text cell is copied, even with Ctrl', () => {
    assertDeepEqual(fill(['A'], 'text', 2).values, ['A', 'A']);
    assertDeepEqual(fill(['A'], 'text', 2, 1, true).values, ['A', 'A']);
  });
});
