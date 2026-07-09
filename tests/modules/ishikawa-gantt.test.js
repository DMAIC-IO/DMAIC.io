/**
 * D.Mike — Ishikawa Gantt config-builder — Unit Tests
 *
 * Covers the pure `computeGanttConfig(experiments, opts)` extracted from the
 * (now removed) bespoke `renderGantt` SVG builder. Asserts:
 *   - filtering of experiments with missing / unparseable dates
 *   - computed xDomain (minT / maxT) derived from the dates
 *   - the `end >= start + 1 day` minimum-duration clamp
 *   - adaptive tick-step selection for a few spans
 *   - per-task bar start/end (ms) and status → color mapping
 *
 * The builder is pure: no DOM, no Date.now() — `now` and the locale are
 * injected by the caller.
 */

import { suite, test, assertEqual, assertTrue } from '../test-utils.js';
import { computeGanttConfig } from '../../js/modules/ishikawa/ishikawa.js';

const DAY = 86400000;

/** Build an experiment with sensible defaults. */
function exp(o) {
  return Object.assign({
    title: '', responsible: '', status: 'planned',
    startDate: '', endDate: '',
  }, o);
}

/** ms timestamp for a local-midnight date string (mirrors the builder's parse). */
function ms(dateStr) {
  return new Date(dateStr + 'T00:00:00').getTime();
}

const OPTS = { now: ms('2020-06-15'), lang: 'de' };

// ─────────────────────────────────────────────────────────────
// Filtering
// ─────────────────────────────────────────────────────────────

suite('Ishikawa Gantt — filtering invalid dates', () => {
  test('drops experiments without start or end date', () => {
    const cfg = computeGanttConfig([
      exp({ startDate: '2020-01-01', endDate: '2020-01-10' }),
      exp({ startDate: '', endDate: '2020-01-10' }),
      exp({ startDate: '2020-01-01', endDate: '' }),
      exp({ startDate: '', endDate: '' }),
    ], OPTS);
    assertEqual(cfg.tasks.length, 1);
  });

  test('drops experiments with unparseable dates', () => {
    const cfg = computeGanttConfig([
      exp({ startDate: '2020-01-01', endDate: '2020-01-10' }),
      exp({ startDate: 'not-a-date', endDate: '2020-01-10' }),
      exp({ startDate: '2020-01-01', endDate: 'xxxx' }),
    ], OPTS);
    assertEqual(cfg.tasks.length, 1);
  });

  test('empty input yields zero tasks and isEmpty flag', () => {
    const cfg = computeGanttConfig([], OPTS);
    assertEqual(cfg.tasks.length, 0);
    assertEqual(cfg.isEmpty, true);
  });
});

// ─────────────────────────────────────────────────────────────
// xDomain
// ─────────────────────────────────────────────────────────────

suite('Ishikawa Gantt — xDomain', () => {
  test('minT / maxT span the earliest start and latest end', () => {
    const cfg = computeGanttConfig([
      exp({ startDate: '2020-03-01', endDate: '2020-03-20' }),
      exp({ startDate: '2020-01-10', endDate: '2020-02-10' }),
      exp({ startDate: '2020-02-01', endDate: '2020-05-01' }),
    ], OPTS);
    assertEqual(cfg.xDomain.minT, ms('2020-01-10'));
    assertEqual(cfg.xDomain.maxT, ms('2020-05-01'));
  });

  test('span is clamped to at least one day', () => {
    const cfg = computeGanttConfig([
      exp({ startDate: '2020-01-01', endDate: '2020-01-01' }),
    ], OPTS);
    // end clamped to start + 1 day → span = 1 day
    assertEqual(cfg.xDomain.maxT - cfg.xDomain.minT, DAY);
  });
});

// ─────────────────────────────────────────────────────────────
// Bars
// ─────────────────────────────────────────────────────────────

suite('Ishikawa Gantt — bars', () => {
  test('bar start/end derived from the dates', () => {
    const cfg = computeGanttConfig([
      exp({ startDate: '2020-01-05', endDate: '2020-01-20', status: 'running' }),
    ], OPTS);
    const t = cfg.tasks[0];
    assertEqual(t.start, ms('2020-01-05'));
    assertEqual(t.end, ms('2020-01-20'));
  });

  test('end is clamped to start + 1 day when end <= start', () => {
    const cfg = computeGanttConfig([
      exp({ startDate: '2020-01-05', endDate: '2020-01-05' }),
    ], OPTS);
    assertEqual(cfg.tasks[0].end, ms('2020-01-05') + DAY);
  });

  test('status maps to the literal hex status color', () => {
    const cfg = computeGanttConfig([
      exp({ startDate: '2020-01-01', endDate: '2020-01-10', status: 'done' }),
      exp({ startDate: '2020-01-01', endDate: '2020-01-10', status: 'running' }),
      exp({ startDate: '2020-01-01', endDate: '2020-01-10', status: 'cancelled' }),
      exp({ startDate: '2020-01-01', endDate: '2020-01-10', status: 'planned' }),
      exp({ startDate: '2020-01-01', endDate: '2020-01-10', status: 'bogus' }),
    ], OPTS);
    assertEqual(cfg.tasks[0].color, '#16a34a');
    assertEqual(cfg.tasks[1].color, '#2563eb');
    assertEqual(cfg.tasks[2].color, '#dc2626');
    assertEqual(cfg.tasks[3].color, '#94a3b8');
    // unknown status falls back to planned
    assertEqual(cfg.tasks[4].color, '#94a3b8');
  });

  test('label falls back to #index when title is blank', () => {
    const cfg = computeGanttConfig([
      exp({ title: '   ', startDate: '2020-01-01', endDate: '2020-01-10' }),
      exp({ title: 'Trial X', startDate: '2020-02-01', endDate: '2020-02-10' }),
    ], OPTS);
    assertEqual(cfg.tasks[0].label, '#1');
    assertEqual(cfg.tasks[1].label, 'Trial X');
  });

  test('untitled #index uses the ORIGINAL full-array position, not the filtered index', () => {
    // The first experiment is dropped (invalid end date). The second is
    // untitled — its fallback label must be `#2` (its position in the FULL
    // input array), NOT `#1` (its position after filtering). This mirrors the
    // legacy `experiments.indexOf(x) + 1` labeling exactly.
    const cfg = computeGanttConfig([
      exp({ title: 'Dropped', startDate: '2020-01-01', endDate: 'xxxx' }),
      exp({ title: '   ', startDate: '2020-02-01', endDate: '2020-02-10' }),
    ], OPTS);
    assertEqual(cfg.tasks.length, 1);
    assertEqual(cfg.tasks[0].label, '#2');
  });
});

// ─────────────────────────────────────────────────────────────
// Adaptive tick step
// ─────────────────────────────────────────────────────────────

suite('Ishikawa Gantt — adaptive tick step', () => {
  const stepDaysFor = (startDate, endDate) => {
    const cfg = computeGanttConfig([exp({ startDate, endDate })], OPTS);
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

  test('ticks are midnight-aligned ms positions within the domain', () => {
    const cfg = computeGanttConfig([
      exp({ startDate: '2020-01-01', endDate: '2020-01-08' }),
    ], OPTS);
    assertTrue(cfg.ticks.length >= 2, 'expected several daily ticks');
    cfg.ticks.forEach((t) => {
      assertTrue(t <= cfg.xDomain.maxT, 'tick within max');
    });
    assertEqual(cfg.ticks[0], ms('2020-01-01'));
  });
});

// ─────────────────────────────────────────────────────────────
// Today line
// ─────────────────────────────────────────────────────────────

suite('Ishikawa Gantt — today line', () => {
  test('showToday true when now is inside the domain', () => {
    const cfg = computeGanttConfig([
      exp({ startDate: '2020-06-01', endDate: '2020-06-30' }),
    ], { now: ms('2020-06-15'), lang: 'de' });
    assertEqual(cfg.showToday, true);
    assertEqual(cfg.now, ms('2020-06-15'));
  });

  test('showToday false when now is outside the domain', () => {
    const cfg = computeGanttConfig([
      exp({ startDate: '2020-06-01', endDate: '2020-06-30' }),
    ], { now: ms('2021-01-01'), lang: 'de' });
    assertEqual(cfg.showToday, false);
  });
});
