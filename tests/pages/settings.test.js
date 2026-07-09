import { suite, test, assertEqual } from '../test-utils.js';
import {
  linkedAlpha, linkedBeta, clampConfPower, clampRisk, clampMinutes,
  groupShortcuts, DEFAULT_CHART_COLORS, STAT_DEFAULTS, SHORTCUT_GROUP_ORDER, FONT_SLIDERS,
} from '../../js/pages/settings/settings.js';

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
