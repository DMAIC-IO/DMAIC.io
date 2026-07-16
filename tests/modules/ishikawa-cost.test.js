/**
 * D.Mike — Ishikawa Cost config-builder — Unit Tests
 *
 * Covers the pure `computeCostConfig(experiments, mode, opts)` extracted from
 * the (now removed) bespoke `renderCostChart` SVG builder. Asserts:
 *   - filtering of experiments with missing / unparseable dates AND no cost
 *   - the empty-state flag when no experiment carries money or hours
 *   - cumulative-mode point construction (seed + running totals; end = total)
 *   - rate-mode step-point construction (two points per day) + peak = max rate
 *   - peak money / hours computation per mode
 *   - unit strings per mode (€/h vs €/d, h/d)
 *   - adaptive tick-step selection for a few spans
 *
 * The builder is pure: no DOM, no Date.now() — `now` and the locale are
 * injected by the caller.
 */

import { suite, test, assertEqual, assertTrue, assertAlmostEqual } from '../test-utils.js';
import { computeCostConfig } from '../../js/modules/ishikawa/ishikawa.js';

const DAY = 86400000;

/** Build an experiment with sensible defaults. */
function exp(o) {
  return Object.assign({
    title: '', responsible: '', status: 'planned',
    startDate: '', endDate: '', costMoney: 0, costHours: 0,
  }, o);
}

/** ms timestamp for a local-midnight date string (mirrors the builder's parse). */
function ms(dateStr) {
  return new Date(dateStr + 'T00:00:00').getTime();
}

const OPTS = { now: ms('2020-06-15'), lang: 'de' };

// ─────────────────────────────────────────────────────────────
// Empty state
// ─────────────────────────────────────────────────────────────

suite('Ishikawa Cost — empty state', () => {
  test('isEmpty when no valid-date experiment exists', () => {
    const cfg = computeCostConfig([
      exp({ startDate: '', endDate: '', costMoney: 100 }),
    ], 'cumulative', OPTS);
    assertEqual(cfg.isEmpty, true);
  });

  test('isEmpty when valid dates but zero money AND zero hours', () => {
    const cfg = computeCostConfig([
      exp({ startDate: '2020-01-01', endDate: '2020-01-10', costMoney: 0, costHours: 0 }),
    ], 'cumulative', OPTS);
    assertEqual(cfg.isEmpty, true);
  });

  test('not empty when at least one experiment has money', () => {
    const cfg = computeCostConfig([
      exp({ startDate: '2020-01-01', endDate: '2020-01-10', costMoney: 100, costHours: 0 }),
    ], 'cumulative', OPTS);
    assertEqual(cfg.isEmpty, false);
  });

  test('not empty when at least one experiment has hours', () => {
    const cfg = computeCostConfig([
      exp({ startDate: '2020-01-01', endDate: '2020-01-10', costMoney: 0, costHours: 8 }),
    ], 'cumulative', OPTS);
    assertEqual(cfg.isEmpty, false);
  });
});

// ─────────────────────────────────────────────────────────────
// Cumulative mode
// ─────────────────────────────────────────────────────────────

suite('Ishikawa Cost — cumulative mode', () => {
  test('cumulative end-point equals the total cost', () => {
    // One experiment, 10 days, 1000€ + 40h → peak = total
    const cfg = computeCostConfig([
      exp({ startDate: '2020-01-01', endDate: '2020-01-11', costMoney: 1000, costHours: 40 }),
    ], 'cumulative', OPTS);
    const lastMoney = cfg.moneyPts[cfg.moneyPts.length - 1].v;
    const lastHours = cfg.hoursPts[cfg.hoursPts.length - 1].v;
    assertAlmostEqual(lastMoney, 1000, 1e-6, 'cumulative money ends at total');
    assertAlmostEqual(lastHours, 40, 1e-6, 'cumulative hours ends at total');
    assertAlmostEqual(cfg.peakMoney, 1000, 1e-6, 'peakMoney = total');
    assertAlmostEqual(cfg.peakHours, 40, 1e-6, 'peakHours = total');
  });

  test('cumulative seeds a (minT, 0) point for money and hours', () => {
    const cfg = computeCostConfig([
      exp({ startDate: '2020-01-01', endDate: '2020-01-05', costMoney: 400, costHours: 0 }),
    ], 'cumulative', OPTS);
    assertEqual(cfg.moneyPts[0].t, cfg.xDomain.min);
    assertEqual(cfg.moneyPts[0].v, 0);
    assertEqual(cfg.hoursPts[0].v, 0);
  });

  test('cumulative is monotonically non-decreasing', () => {
    const cfg = computeCostConfig([
      exp({ startDate: '2020-01-01', endDate: '2020-01-06', costMoney: 500, costHours: 0 }),
    ], 'cumulative', OPTS);
    for (let i = 1; i < cfg.moneyPts.length; i++) {
      assertTrue(cfg.moneyPts[i].v >= cfg.moneyPts[i - 1].v, 'money non-decreasing');
    }
  });

  test('cumulative sums overlapping experiments to the combined total', () => {
    const cfg = computeCostConfig([
      exp({ startDate: '2020-01-01', endDate: '2020-01-11', costMoney: 1000, costHours: 0 }),
      exp({ startDate: '2020-01-01', endDate: '2020-01-11', costMoney: 500, costHours: 0 }),
    ], 'cumulative', OPTS);
    const lastMoney = cfg.moneyPts[cfg.moneyPts.length - 1].v;
    assertAlmostEqual(lastMoney, 1500, 1e-6, 'combined total');
  });
});

// ─────────────────────────────────────────────────────────────
// Rate mode
// ─────────────────────────────────────────────────────────────

suite('Ishikawa Cost — rate mode', () => {
  test('rate mode pushes two step-points per day', () => {
    // 4-day span → 4 days → 8 points
    const cfg = computeCostConfig([
      exp({ startDate: '2020-01-01', endDate: '2020-01-05', costMoney: 400, costHours: 0 }),
    ], 'rate', OPTS);
    assertEqual(cfg.moneyPts.length, 8);
    // each pair shares the same value (flat step)
    for (let d = 0; d < 4; d++) {
      assertEqual(cfg.moneyPts[d * 2].v, cfg.moneyPts[d * 2 + 1].v);
    }
  });

  test('rate step points: first at dayStart, second at dayStart+1day', () => {
    const cfg = computeCostConfig([
      exp({ startDate: '2020-01-01', endDate: '2020-01-03', costMoney: 200, costHours: 0 }),
    ], 'rate', OPTS);
    assertEqual(cfg.moneyPts[0].t, cfg.xDomain.min);
    assertEqual(cfg.moneyPts[1].t, cfg.xDomain.min + DAY);
  });

  test('rate peak equals the maximum daily rate (money/day)', () => {
    // 200€ over 2 days → 100€/day rate
    const cfg = computeCostConfig([
      exp({ startDate: '2020-01-01', endDate: '2020-01-03', costMoney: 200, costHours: 16 }),
    ], 'rate', OPTS);
    assertAlmostEqual(cfg.peakMoney, 100, 1e-6, 'money rate peak');
    assertAlmostEqual(cfg.peakHours, 8, 1e-6, 'hours rate peak');
  });
});

// ─────────────────────────────────────────────────────────────
// Units
// ─────────────────────────────────────────────────────────────

suite('Ishikawa Cost — unit strings', () => {
  test('cumulative units are € and h', () => {
    const cfg = computeCostConfig([
      exp({ startDate: '2020-01-01', endDate: '2020-01-05', costMoney: 100, costHours: 1 }),
    ], 'cumulative', OPTS);
    assertEqual(cfg.moneyUnit, '€');
    assertEqual(cfg.hoursUnit, 'h');
    assertEqual(cfg.mode, 'cumulative');
  });

  test('rate units are €/d and h/d', () => {
    const cfg = computeCostConfig([
      exp({ startDate: '2020-01-01', endDate: '2020-01-05', costMoney: 100, costHours: 1 }),
    ], 'rate', OPTS);
    assertEqual(cfg.moneyUnit, '€/d');
    assertEqual(cfg.hoursUnit, 'h/d');
    assertEqual(cfg.mode, 'rate');
  });
});

// ─────────────────────────────────────────────────────────────
// Adaptive tick step (same thresholds as gantt)
// ─────────────────────────────────────────────────────────────

suite('Ishikawa Cost — adaptive tick step', () => {
  const stepDaysFor = (startDate, endDate) => {
    const cfg = computeCostConfig(
      [exp({ startDate, endDate, costMoney: 100 })], 'cumulative', OPTS);
    return cfg.stepDays;
  };

  test('span <= 14 days → daily ticks', () => {
    assertEqual(stepDaysFor('2020-01-01', '2020-01-10'), 1);
  });

  test('span <= 60 days → weekly ticks', () => {
    assertEqual(stepDaysFor('2020-01-01', '2020-02-15'), 7);
  });

  test('span <= 365 days → monthly ticks', () => {
    assertEqual(stepDaysFor('2020-01-01', '2020-06-01'), 30);
  });

  test('span > 365 days → quarterly ticks', () => {
    assertEqual(stepDaysFor('2020-01-01', '2022-01-01'), 90);
  });

  test('ticks are midnight-aligned ms positions; first at minT', () => {
    const cfg = computeCostConfig([
      exp({ startDate: '2020-01-01', endDate: '2020-01-08', costMoney: 100 }),
    ], 'cumulative', OPTS);
    assertEqual(cfg.ticks[0], ms('2020-01-01'));
  });
});
