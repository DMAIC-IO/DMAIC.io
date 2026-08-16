import { suite, test, assertEqual, assertTrue } from '../test-utils.js';
import {
  linkedAlpha, linkedBeta, clampConfPower, clampRisk, clampMinutes,
  groupShortcuts, DEFAULT_CHART_COLORS, STAT_DEFAULTS, SHORTCUT_GROUP_ORDER, FONT_SLIDERS,
  buildActionUrlGroups, copyToClipboardFallback,
} from '../../js/pages/settings/settings.js';
import { CYCLES } from '../../js/core/cycles/cycles.js';

suite('settings pure helpers — linked stats', () => {
  test('linkedAlpha = 100 − confidence (2dp)', () => {
    assertEqual(linkedAlpha(95), 5);
    assertEqual(linkedAlpha(97.5), 2.5);
    assertEqual(linkedAlpha(99.99), 0.01);
  });
  test('linkedBeta = 100 − power (2dp)', () => {
    assertEqual(linkedBeta(80), 20);
    assertEqual(linkedBeta(90.25), 9.75);
  });
  test('clampConfPower bounds to [50, 99.99] with fallback', () => {
    assertEqual(clampConfPower('40', 95), 50);
    assertEqual(clampConfPower('120', 95), 99.99);
    assertEqual(clampConfPower('', 95), 95);
    assertEqual(clampConfPower('88', 95), 88);
  });
  test('clampRisk bounds to [0.01, 50] with fallback', () => {
    assertEqual(clampRisk('0', 5), 0.01);
    assertEqual(clampRisk('99', 5), 50);
    assertEqual(clampRisk('', 5), 5);
    assertEqual(clampRisk('5', 5), 5);
  });
});

suite('settings pure helpers — minutes clamp', () => {
  test('clampMinutes bounds to [1, 1440] integer, default 60', () => {
    // Legacy parity: parseInt('0',10) is 0 (falsy) → `|| 60` → 60 (NOT 1).
    // Faithful reproduction of `Math.min(1440, Math.max(1, parseInt(raw,10) || 60))`.
    assertEqual(clampMinutes('0'), 60);
    assertEqual(clampMinutes('1'), 1);
    assertEqual(clampMinutes('5000'), 1440);
    assertEqual(clampMinutes('abc'), 60);
    assertEqual(clampMinutes('90'), 90);
  });
});

suite('settings pure helpers — groupShortcuts', () => {
  test('orders known groups then appends unknown, preserving items', () => {
    const all = [
      { id: 'a', category: 'datagrid' },
      { id: 'b', category: 'general' },
      { id: 'c', category: 'zzz' },
      { id: 'd', category: 'general' },
    ];
    const groups = groupShortcuts(all, SHORTCUT_GROUP_ORDER);
    assertEqual(groups[0].id, 'general');
    assertEqual(groups[0].items.length, 2);
    assertEqual(groups[1].id, 'datagrid');
    assertEqual(groups[groups.length - 1].id, 'zzz');
  });
  test('empty input yields empty array', () => {
    assertEqual(groupShortcuts([], SHORTCUT_GROUP_ORDER).length, 0);
  });
});

suite('settings constants', () => {
  test('palette has 10 hex colors', () => {
    assertEqual(DEFAULT_CHART_COLORS.length, 10);
    assertEqual(DEFAULT_CHART_COLORS[0], '#4e79a7');
  });
  test('stat defaults + group order + font bounds', () => {
    assertEqual(STAT_DEFAULTS.confidenceLevel, 95);
    assertEqual(STAT_DEFAULTS.power, 80);
    assertEqual(SHORTCUT_GROUP_ORDER[0], 'general');
    assertEqual(FONT_SLIDERS.length, 3);
    assertEqual(FONT_SLIDERS[0].key, 'chartTitleSize');
  });
});

suite('settings pure helpers — buildActionUrlGroups', () => {
  const fakeI18n = { t: (key) => (key === 'cycles.dmaic.name' ? 'DMAIC' : key) };
  const base = `${location.origin}${location.pathname}`;

  test('rows come from a verb\'s list(), never a hardcoded literal', () => {
    const actionVerbs = new Map([
      ['scenario', { list: () => [{ arg: 'pizza-full', label: 'Pizza (voll)' }] }],
    ]);
    const groups = buildActionUrlGroups({ actionVerbs, i18n: fakeI18n });
    assertEqual(groups.length, 1);
    assertEqual(groups[0].verb, 'scenario');
    assertEqual(groups[0].rows.length, 1);
    assertEqual(groups[0].rows[0].url, `${base}#/action/scenario/pizza-full`);
    assertEqual(groups[0].rows[0].label, 'Pizza (voll)');
  });

  test('a verb added to the registry later is picked up automatically', () => {
    // Proves the list is built from the registry, not a literal: a verb this
    // module has never heard of still produces a group as long as it exposes
    // list(). If a real verb or scenario is registered later, the settings
    // section needs no further edits — this is the automated proof for that.
    const actionVerbs = new Map([
      ['scenario', { list: () => [] }],
      ['future-verb', { list: () => [{ arg: 'demo', label: 'Demo' }] }],
    ]);
    const groups = buildActionUrlGroups({ actionVerbs, i18n: fakeI18n });
    const future = groups.find(g => g.verb === 'future-verb');
    assertTrue(!!future, 'future-verb group missing');
    assertEqual(future.rows[0].url, `${base}#/action/future-verb/demo`);
  });

  test('new-project falls back to one row per cycle when list() is empty', () => {
    const actionVerbs = new Map([['new-project', { list: () => [] }]]);
    const groups = buildActionUrlGroups({ actionVerbs, i18n: fakeI18n });
    assertEqual(groups.length, 1);
    assertEqual(groups[0].rows.length, Object.keys(CYCLES).length);
    assertTrue(
      groups[0].rows.some(r => r.url === `${base}#/action/new-project/dmaic`),
      'missing dmaic row',
    );
  });

  test('a verb with an empty list() other than new-project contributes no group', () => {
    // 'example' takes a free-form example id, not an enumerable cycle id —
    // emitting a cycle-shaped URL for it would 404 (ruling: no dead links).
    const actionVerbs = new Map([
      ['example', { list: () => [] }],
      ['scenario', { list: () => [{ arg: 's1', label: 'S1' }] }],
    ]);
    const groups = buildActionUrlGroups({ actionVerbs, i18n: fakeI18n });
    assertEqual(groups.length, 1);
    assertEqual(groups[0].verb, 'scenario');
  });
});

suite('settings pure helpers — copyToClipboardFallback', () => {
  test('copies via a hidden textarea without leaving it in the DOM', () => {
    const before = document.querySelectorAll('textarea').length;
    copyToClipboardFallback('https://example.test/#/action/scenario/s1');
    assertEqual(document.querySelectorAll('textarea').length, before);
  });
});
