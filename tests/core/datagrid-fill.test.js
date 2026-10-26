import { suite, test, assertEqual, assertDeepEqual } from '../test-utils.js';
import { detectPattern, withCtrlModifier, generateFill } from '../../js/core/datagrid/datagrid-fill.js';

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

  test('an impossible date is not a date series but a text with trailing number', () => {
    const r = fill(['2026-02-29', '2026-02-30'], 'date', 2);
    assertEqual(r.kind, 'textSuffix');
    assertDeepEqual(r.values, ['2026-02-31', '2026-02-32']);
  });

  test('an impossible single date with Ctrl counts its trailing number', () => {
    const r = fill(['2026-02-30'], 'date', 2, 1, true);
    assertEqual(r.kind, 'textSuffix');
    assertDeepEqual(r.values, ['2026-02-31', '2026-02-32']);
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
