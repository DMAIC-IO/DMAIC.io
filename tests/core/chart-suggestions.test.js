/**
 * Tests for the chart-suggestion matcher in
 * js/core/chart-suggestions/chart-suggestions.js.
 *
 * The matcher takes a selection of columns (each carrying an analytical
 * role) plus a sample size and returns an ordered list of chart-type
 * suggestions. Pattern matching is exact (role-counts must match the rule
 * exactly), and chart conditions (minN / maxN / maxCategories) hard-filter
 * a chart when the selection violates them.
 */

import { suite, test, assertEqual } from '../test-utils.js';
import {
  getSuggestionsFor,
  countRoles,
  matchesPattern,
  conditionsHold,
  effectiveN,
  categoricalCardinality,
  findRule,
  RULES,
} from '../../js/core/chart-suggestions/chart-suggestions.js';

// ─── Helpers ───────────────────────────────────────────────────

/** Build a continuous column with n distinct numeric values. */
function cont(n = 50) {
  const values = Array.from({ length: n }, (_, i) => i * 1.7);
  return { role: 'continuous', type: 'numeric', values };
}
/** Build a categorical column from a list of category labels. */
function cat(categories = ['A', 'B', 'C'], repeats = 20) {
  const values = [];
  for (let i = 0; i < repeats; i++) values.push(categories[i % categories.length]);
  return { role: 'categorical', type: 'text', values };
}
function ordinal(levels = ['low', 'mid', 'high'], repeats = 20) {
  const values = [];
  for (let i = 0; i < repeats; i++) values.push(levels[i % levels.length]);
  return { role: 'ordinal', type: 'text', values };
}
function date(n = 30) {
  const values = Array.from({ length: n }, (_, i) => `2026-01-${String((i % 28) + 1).padStart(2, '0')}`);
  return { role: 'date', type: 'date', values };
}
function chartTypes(suggestions) {
  return suggestions.map(s => s.type);
}
/** Compare two arrays of primitives by JSON serialization. */
function assertArrayEqual(actual, expected, message) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(message || `Array mismatch: expected ${e}, got ${a}`);
}

// ─── Pure helpers ──────────────────────────────────────────────

suite('chart-suggestions — countRoles', () => {
  test('counts roles across selection', () => {
    const r = countRoles([cont(), cont(), cat()]);
    assertEqual(r.continuous, 2);
    assertEqual(r.categorical, 1);
  });

  test('ignores columns without role', () => {
    const r = countRoles([cont(), { type: 'numeric' }, null]);
    assertEqual(r.continuous, 1);
    assertEqual(Object.keys(r).length, 1);
  });

  test('empty selection → empty object', () => {
    assertEqual(Object.keys(countRoles([])).length, 0);
  });
});

suite('chart-suggestions — matchesPattern', () => {
  test('exact role-count match', () => {
    assertEqual(matchesPattern({ continuous: 2 }, { continuous: 2 }), true);
    assertEqual(matchesPattern({ continuous: 1 }, { continuous: 2 }), false);
  });

  test('extra roles disqualify (exact semantics)', () => {
    // pattern asks for 1 continuous; selection also has a categorical → no match
    assertEqual(matchesPattern({ continuous: 1, categorical: 1 }, { continuous: 1 }), false);
  });

  test('comparator strings ">=" / "<=" / ">" / "<"', () => {
    assertEqual(matchesPattern({ continuous: 5 }, { continuous: '>=3' }), true);
    assertEqual(matchesPattern({ continuous: 2 }, { continuous: '>=3' }), false);
    assertEqual(matchesPattern({ continuous: 3 }, { continuous: '<=3' }), true);
    assertEqual(matchesPattern({ continuous: 4 }, { continuous: '<=3' }), false);
    assertEqual(matchesPattern({ continuous: 4 }, { continuous: '>3' }),  true);
    assertEqual(matchesPattern({ continuous: 3 }, { continuous: '>3' }),  false);
  });

  test('multi-role pattern requires every spec to match', () => {
    assertEqual(matchesPattern({ continuous: 1, date: 1 }, { continuous: 1, date: 1 }), true);
    assertEqual(matchesPattern({ continuous: 1 },           { continuous: 1, date: 1 }), false);
  });

  test('zero counts implicit — roles not listed in spec must be 0', () => {
    assertEqual(matchesPattern({ continuous: 2, date: 1 }, { continuous: 2 }), false);
  });
});

suite('chart-suggestions — conditionsHold', () => {
  test('no conditions → always true', () => {
    assertEqual(conditionsHold(undefined, { n: 0, maxCategories: null }), true);
    assertEqual(conditionsHold(null,      { n: 0, maxCategories: null }), true);
    assertEqual(conditionsHold({},        { n: 0, maxCategories: null }), true);
  });

  test('minN gate', () => {
    assertEqual(conditionsHold({ minN: 20 }, { n: 19, maxCategories: null }), false);
    assertEqual(conditionsHold({ minN: 20 }, { n: 20, maxCategories: null }), true);
    assertEqual(conditionsHold({ minN: 20 }, { n: 50, maxCategories: null }), true);
  });

  test('maxN gate', () => {
    assertEqual(conditionsHold({ maxN: 200 }, { n: 200, maxCategories: null }), true);
    assertEqual(conditionsHold({ maxN: 200 }, { n: 201, maxCategories: null }), false);
  });

  test('maxCategories gate, null cardinality is tolerated', () => {
    assertEqual(conditionsHold({ maxCategories: 7 }, { n: 100, maxCategories: 5 }),    true);
    assertEqual(conditionsHold({ maxCategories: 7 }, { n: 100, maxCategories: 8 }),    false);
    assertEqual(conditionsHold({ maxCategories: 7 }, { n: 100, maxCategories: null }), true);
  });
});

suite('chart-suggestions — effectiveN & categoricalCardinality', () => {
  test('effectiveN uses longest non-null count', () => {
    assertEqual(effectiveN([{ values: [1, 2, null, 4] }, { values: [1, 2] }]), 3);
  });

  test('effectiveN honors explicit n on column', () => {
    assertEqual(effectiveN([{ n: 42 }, { values: [1, 2, 3] }]), 42);
  });

  test('categoricalCardinality counts first cat/ordinal column', () => {
    assertEqual(categoricalCardinality([cont(), cat(['A', 'B', 'C'])]), 3);
    assertEqual(categoricalCardinality([cont()]), null);
  });

  test('categoricalCardinality honors explicit distinctCount', () => {
    assertEqual(
      categoricalCardinality([{ role: 'categorical', distinctCount: 12 }]),
      12,
    );
  });
});

// ─── End-to-end matcher tests ─────────────────────────────────

suite('chart-suggestions — getSuggestionsFor: single continuous', () => {
  test('n=50 → histogram first, then boxplot, IVP, run-chart, probability-plot', () => {
    const out = chartTypes(getSuggestionsFor([cont(50)]));
    assertArrayEqual(out, ['histogram', 'boxplot', 'individual-value-plot', 'run-chart', 'probability-plot']);
  });

  test('n=15 → histogram filtered out (minN 20), probability-plot still in', () => {
    const out = chartTypes(getSuggestionsFor([cont(15)]));
    assertArrayEqual(out, ['boxplot', 'individual-value-plot', 'run-chart', 'probability-plot']);
  });

  test('n=8 → histogram and probability-plot both filtered out', () => {
    const out = chartTypes(getSuggestionsFor([cont(8)]));
    assertArrayEqual(out, ['boxplot', 'individual-value-plot', 'run-chart']);
  });

  test('n=300 → IVP filtered out (maxN 200), rest in', () => {
    const out = chartTypes(getSuggestionsFor([cont(300)]));
    assertArrayEqual(out, ['histogram', 'boxplot', 'run-chart', 'probability-plot']);
  });
});

suite('chart-suggestions — getSuggestionsFor: single categorical', () => {
  test('few categories → pareto, bar, pie', () => {
    const out = chartTypes(getSuggestionsFor([cat(['A', 'B', 'C'])]));
    assertArrayEqual(out, ['pareto', 'bar', 'pie']);
  });

  test('>7 categories → pie filtered out', () => {
    const categories = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
    const out = chartTypes(getSuggestionsFor([cat(categories, 40)]));
    assertArrayEqual(out, ['pareto', 'bar']);
  });
});

suite('chart-suggestions — getSuggestionsFor: two continuous', () => {
  test('exactly 2 continuous → scatter, scatter-marginal-boxplot, scatter-marginal-histogram', () => {
    const out = chartTypes(getSuggestionsFor([cont(), cont()]));
    assertArrayEqual(out, ['scatter', 'scatter-marginal-boxplot', 'scatter-marginal-histogram']);
  });
});

suite('chart-suggestions — getSuggestionsFor: continuous + categorical', () => {
  test('continuous + categorical → boxplot, main-effects, IVP, bar', () => {
    const out = chartTypes(getSuggestionsFor([cont(), cat()]));
    assertArrayEqual(out, ['boxplot', 'main-effects', 'individual-value-plot', 'bar']);
  });

  test('order of columns does not matter (categorical first)', () => {
    const out = chartTypes(getSuggestionsFor([cat(), cont()]));
    assertArrayEqual(out, ['boxplot', 'main-effects', 'individual-value-plot', 'bar']);
  });
});

suite('chart-suggestions — getSuggestionsFor: date + continuous', () => {
  test('n=50 → run-chart, control-chart, ewma, cusum, scatter', () => {
    const out = chartTypes(getSuggestionsFor([date(50), cont(50)]));
    assertArrayEqual(out, ['run-chart', 'control-chart', 'ewma', 'cusum', 'scatter']);
  });

  test('n=20 → control-chart filtered out (minN 25), ewma and cusum stay', () => {
    const out = chartTypes(getSuggestionsFor([date(20), cont(20)]));
    assertArrayEqual(out, ['run-chart', 'ewma', 'cusum', 'scatter']);
  });
});

suite('chart-suggestions — getSuggestionsFor: multi-continuous (≥3)', () => {
  test('3 continuous → scatter-matrix, bubble, boxplot, IVP', () => {
    const out = chartTypes(getSuggestionsFor([cont(), cont(), cont()]));
    assertArrayEqual(out, ['scatter-matrix', 'bubble', 'boxplot', 'individual-value-plot']);
  });

  test('5 continuous matches the same rule', () => {
    const cols = [cont(), cont(), cont(), cont(), cont()];
    const out = chartTypes(getSuggestionsFor(cols));
    assertArrayEqual(out, ['scatter-matrix', 'bubble', 'boxplot', 'individual-value-plot']);
  });

  test('multi-continuous scatter-matrix is top-ranked', () => {
    const sugg = getSuggestionsFor([cont(), cont(), cont()]);
    assertEqual(sugg[0].type, 'scatter-matrix');
    assertEqual(sugg[0].i18nKey, 'scatterMatrix');
    assertEqual(sugg[0].notesKey, null);
  });
});

suite('chart-suggestions — getSuggestionsFor: ordinal & combinations', () => {
  test('single ordinal → bar, pareto', () => {
    const out = chartTypes(getSuggestionsFor([ordinal()]));
    assertArrayEqual(out, ['bar', 'pareto']);
  });

  test('continuous + ordinal → boxplot, main-effects, IVP, run-chart', () => {
    const out = chartTypes(getSuggestionsFor([cont(), ordinal()]));
    assertArrayEqual(out, ['boxplot', 'main-effects', 'individual-value-plot', 'run-chart']);
  });

  test('two categorical → bar, pareto, mosaic, heatmap', () => {
    const out = chartTypes(getSuggestionsFor([cat(), cat(['X', 'Y'])]));
    assertArrayEqual(out, ['bar', 'pareto', 'mosaic', 'heatmap']);
  });

  test('categorical + ordinal → bar only', () => {
    const out = chartTypes(getSuggestionsFor([cat(), ordinal()]));
    assertArrayEqual(out, ['bar']);
  });
});

suite('chart-suggestions — getSuggestionsFor: no-match cases', () => {
  test('empty selection → []', () => {
    assertEqual(getSuggestionsFor([]).length, 0);
  });

  test('selection with only identifier/freeText → no rule fires', () => {
    const identifier = { role: 'identifier', type: 'text', values: ['x'] };
    assertEqual(getSuggestionsFor([identifier]).length, 0);
  });

  test('three columns with no matching rule → no rule fires', () => {
    assertEqual(getSuggestionsFor([cont(), cont(), cat()]).length, 0);
  });
});

suite('chart-suggestions — output shape', () => {
  test('every suggestion has type, score, i18nKey, notesKey, ruleId', () => {
    const sugg = getSuggestionsFor([cont(50)]);
    for (const s of sugg) {
      assertEqual(typeof s.type, 'string');
      assertEqual(typeof s.score, 'number');
      assertEqual(typeof s.i18nKey, 'string');
      assertEqual(typeof s.ruleId, 'string');
      assertEqual('notesKey' in s, true);
    }
  });

  test('suggestions are sorted by score (desc)', () => {
    const sugg = getSuggestionsFor([cont(50)]);
    for (let i = 1; i < sugg.length; i++) {
      assertEqual(sugg[i - 1].score >= sugg[i].score, true);
    }
  });

  test('findRule returns null when no rule matches', () => {
    assertEqual(findRule({ identifier: 1 }), null);
  });

  test('RULES is deep-frozen (cannot be mutated by accident)', () => {
    let threw = false;
    try { RULES.rules.push({ id: 'x' }); } catch { threw = true; }
    assertEqual(threw, true);
    assertEqual(Object.isFrozen(RULES.rules[0]), true);
    assertEqual(Object.isFrozen(RULES.rules[0].charts), true);
  });
});
