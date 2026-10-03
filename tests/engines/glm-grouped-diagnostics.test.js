/**
 * D.Mike — GLM Engine — grouped binomial diagnostics — Unit Tests
 *
 * With grouped binomial data (Y = proportion, weights = trials) the
 * Hosmer–Lemeshow test, the ROC curve and the classification table have to
 * count trials, not rows: every row stands for `events` successes and
 * `trials − events` failures at the same predicted probability. The results
 * must equal those of the same data expanded to individual 0/1 outcomes
 * (finding C2-003, Melzer 2019 §15.3).
 */

import { suite, test, assertEqual, assertDeepEqual, assertAlmostEqual, assertTrue } from '../test-utils.js';
import {
  fitGLM, buildGLMDesignMatrix, computeROC, classificationTable, hosmerLemeshow,
} from '../../js/engines/glm-engine.js';

/**
 * Deterministic grouped data after the book's model
 * p = e^(−4.9375 + 0.2702·x) / (1 + …), with a fixed lack-of-fit wobble so
 * the events are not exactly the expected counts.
 * @param {number} groups
 */
function groupedData(groups) {
  const x = [], trials = [], events = [];
  for (let i = 0; i < groups; i++) {
    const xi = 8 + i * (30 / groups);
    const p = 1 / (1 + Math.exp(-(-4.9375 + 0.2702 * xi)));
    const n = 100 + ((i * 37) % 201);
    const wobble = ((i * 7) % 5) - 2;
    const e = Math.min(n, Math.max(0, Math.round(n * p) + wobble));
    x.push(xi); trials.push(n); events.push(e);
  }
  const y = events.map((e, i) => e / trials[i]);
  return { x, trials, events, y };
}

/** Expand grouped rows to one 0/1 outcome per trial. */
function expand(xs, events, trials, probs) {
  const x = [], y = [], p = [];
  for (let i = 0; i < events.length; i++) {
    for (let k = 0; k < trials[i]; k++) {
      x.push(xs[i]);
      y.push(k < events[i] ? 1 : 0);
      p.push(probs ? probs[i] : 0);
    }
  }
  return { x, y, p };
}

/** Trial-weighted Mann–Whitney AUC, computed pair by pair. */
function mannWhitneyAUC(events, trials, probs) {
  let num = 0, pos = 0, neg = 0;
  for (let i = 0; i < events.length; i++) {
    pos += events[i];
    neg += trials[i] - events[i];
    for (let j = 0; j < events.length; j++) {
      const pairs = events[i] * (trials[j] - events[j]);
      if (probs[i] > probs[j]) num += pairs;
      else if (probs[i] === probs[j]) num += pairs / 2;
    }
  }
  return num / (pos * neg);
}

const d40 = groupedData(40);
const probs40 = d40.x.map(x => 1 / (1 + Math.exp(-(-4.8 + 0.265 * x))));
const ex40 = expand(d40.x, d40.events, d40.trials, probs40);

suite('GLM Engine — grouped binomial diagnostics (C2-003)', () => {
  test('ROC: weighted AUC equals the expanded AUC and the Mann–Whitney AUC', () => {
    const grouped = computeROC(d40.y, probs40, d40.trials);
    const expanded = computeROC(ex40.y, ex40.p);
    assertAlmostEqual(grouped.auc, expanded.auc, 1e-12);
    assertAlmostEqual(grouped.auc, mannWhitneyAUC(d40.events, d40.trials, probs40), 1e-12);
    assertTrue(grouped.auc > 0.7, `AUC ${grouped.auc} should reflect the slope`);
    assertEqual(grouped.fpr.length, expanded.fpr.length);
    for (let k = 0; k < grouped.fpr.length; k++) {
      assertAlmostEqual(grouped.fpr[k], expanded.fpr[k], 1e-12);
      assertAlmostEqual(grouped.tpr[k], expanded.tpr[k], 1e-12);
    }
  });

  test('Classification table: weighted counts equal the expanded counts', () => {
    for (const cutoff of [0.3, 0.5, 0.7]) {
      const g = classificationTable(d40.y, probs40, cutoff, d40.trials);
      const e = classificationTable(ex40.y, ex40.p, cutoff);
      for (const k of ['tp', 'fp', 'tn', 'fn']) assertEqual(g[k], e[k], `${k} @ ${cutoff}`);
      for (const k of ['sensitivity', 'specificity', 'accuracy', 'precision']) {
        assertAlmostEqual(g[k], e[k], 1e-12, `${k} @ ${cutoff}`);
      }
    }
  });

  test('Hosmer–Lemeshow: weighted test equals the expanded test', () => {
    const g = hosmerLemeshow(d40.y, probs40, 10, d40.trials);
    const e = hosmerLemeshow(ex40.y, ex40.p);
    assertTrue(!g.skipped, 'grouped HL must not be skipped');
    assertEqual(g.groups, e.groups);
    assertEqual(g.df, e.df);
    assertAlmostEqual(g.statistic, e.statistic, 1e-9);
    assertAlmostEqual(g.pValue, e.pValue, 1e-9);
  });

  test('Hosmer–Lemeshow: 15 groups with thousands of trials are not skipped', () => {
    const d15 = groupedData(15);
    const p15 = d15.x.map(x => 1 / (1 + Math.exp(-(-4.8 + 0.265 * x))));
    const g = hosmerLemeshow(d15.y, p15, 10, d15.trials);
    const e15 = expand(d15.x, d15.events, d15.trials, p15);
    const e = hosmerLemeshow(e15.y, e15.p);
    assertTrue(!g.skipped, 'HL counts trials, not rows');
    assertEqual(g.groups, e.groups);
    assertAlmostEqual(g.statistic, e.statistic, 1e-9);
  });

  test('fitGLM keeps the trials, and the diagnostics match the ungrouped fit', () => {
    const { X: Xg, terms } = buildGLMDesignMatrix([{ values: d40.x, name: 'X' }]);
    const rg = fitGLM(Xg, d40.y, { familyName: 'binomial', terms, weights: d40.trials });
    const exFit = expand(d40.x, d40.events, d40.trials);
    const { X: Xu, terms: tu } = buildGLMDesignMatrix([{ values: exFit.x, name: 'X' }]);
    const ru = fitGLM(Xu, exFit.y, { familyName: 'binomial', terms: tu });

    assertDeepEqual(rg.priorWeights, d40.trials);
    assertEqual(ru.priorWeights, null);
    assertAlmostEqual(rg.coefficients[1], ru.coefficients[1], 1e-8);

    const aucG = computeROC(rg.y, rg.fittedValues, rg.priorWeights).auc;
    const aucU = computeROC(ru.y, ru.fittedValues).auc;
    assertAlmostEqual(aucG, aucU, 1e-9);

    const hlG = hosmerLemeshow(rg.y, rg.fittedValues, 10, rg.priorWeights);
    const hlU = hosmerLemeshow(ru.y, ru.fittedValues);
    assertAlmostEqual(hlG.statistic, hlU.statistic, 1e-6);
    assertAlmostEqual(hlG.pValue, hlU.pValue, 1e-6);
  });
});
