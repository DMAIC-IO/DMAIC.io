/**
 * D.Mike — Stats panel confidence intervals (stats-panel.js).
 * Variance/SD CI must use the exact χ² quantile (R qchisq).
 */

import { suite, test, assertAlmostEqual, assertEqual } from '../test-utils.js';
import { computeCI, computeSeriesStats, renderStatsTable } from '../../js/core/stats-panel.js';

suite('Stats panel — variance/SD CI', () => {
  test('df = 9 matches qchisq(0.025/0.975, 9)', () => {
    const ci = computeCI({ n: 10, mean: 0, stddev: 2, variance: 4 }, 0.95);
    assertAlmostEqual(ci.variance[0], 36 / 19.022768, { relative: 1e-5 }, 'var lower');
    assertAlmostEqual(ci.variance[1], 36 / 2.7003895, { relative: 1e-5 }, 'var upper');
    assertAlmostEqual(ci.stddev[0], Math.sqrt(36 / 19.022768), { relative: 1e-5 }, 'sd lower');
  });

  test('df = 1 still yields a variance CI (χ²(0.025; 1) = 0.000982 > 0)', () => {
    const ci = computeCI({ n: 2, mean: 1, stddev: Math.SQRT1_2, variance: 0.5 }, 0.95);
    assertEqual(Array.isArray(ci.variance), true, 'variance CI present');
    assertAlmostEqual(ci.variance[1], 0.5 / 0.000982069, { relative: 1e-5 }, 'var upper');
  });
});

/**
 * Adressierung der Wertzellen: eine eindeutige Adresse darf nicht an
 * `:nth-of-type` hängen, sonst verschiebt jede neue Spalte das Ziel.
 */
suite('Stats panel — data-stat auf den Wertzellen', () => {
  const series = [
    { name: 'Col A', values: [1, 2, 3, 4, 5], color: '#f00', visible: true },
  ];

  test('jede Wertzelle trägt den Spaltenschlüssel', () => {
    const host = document.createElement('div');
    renderStatsTable(host, computeSeriesStats(series), { confLevel: 95 });
    for (const key of ['n', 'mean', 'stddev', 'min', 'max', 'median',
      'variance', 'range', 'skewness', 'kurtosis']) {
      assertEqual(host.querySelectorAll(`td[data-stat="${key}"]`).length, 1, key);
    }
    assertEqual(
      host.querySelector('td[data-stat="mean"]').textContent.startsWith('3.0000'),
      true,
      'Mittelwert steht in der mean-Zelle',
    );
  });

  test('der Spaltenkopf behält data-glossary-term', () => {
    const host = document.createElement('div');
    renderStatsTable(host, computeSeriesStats(series), { confLevel: 95 });
    assertEqual(
      host.querySelectorAll('th [data-glossary-term="median"]').length, 1,
      'Glossarmarkierung im Kopf',
    );
  });

  test('eine Reihe ohne Statistik behält die Adressierung', () => {
    const host = document.createElement('div');
    renderStatsTable(host, [{ name: 'leer', color: '#f00', stats: null, ci: {} }], {});
    assertEqual(host.querySelectorAll('td[data-stat="median"]').length, 1, 'median-Platzhalter');
  });
});

/**
 * Kontexthilfe: jede Kennzahlspalte und die Reihenspalte tragen einen Anker
 * auf den geteilten Satz — dieselben Sätze, die der Agent unter
 * read().stats liest (modules.shared.types.*).
 */
suite('Stats panel — Kontexthilfe-Anker im Kopf', () => {
  const series = [{ name: 'A', values: [1, 2, 3, 4], color: '#f00', visible: true }];

  test('jede Kopfzelle hat genau einen Anker-Span mit dem geteilten Schlüssel', () => {
    const host = document.createElement('div');
    renderStatsTable(host, computeSeriesStats(series), { confLevel: 95 });
    const ths = [...host.querySelectorAll('thead th')];
    const keys = ths.map(th => th.querySelector(':scope > [data-help-key]')?.getAttribute('data-help-key'));
    assertEqual(keys[0], 'modules.shared.types.SeriesStats.name', 'Reihenspalte');
    const expected = ['n', 'mean', 'stddev', 'min', 'max', 'median', 'variance', 'range', 'skewness', 'kurtosis']
      .map(k => `modules.shared.types.Stats.${k}`);
    assertEqual(JSON.stringify(keys.slice(1)), JSON.stringify(expected), 'Kennzahlspalten');
    for (const th of ths) assertEqual(th.hasAttribute('data-help-key'), false, 'Anker nie an der Zelle');
  });

  test('der Glossar-Span bleibt im Anker-Span erhalten', () => {
    const host = document.createElement('div');
    renderStatsTable(host, computeSeriesStats(series), { confLevel: 95, glossaryEnabled: true, glossaryIds: new Set(['mittelwert']) });
    const anchor = host.querySelector('[data-help-key="modules.shared.types.Stats.mean"]');
    assertEqual(anchor?.querySelector('.glossary-term')?.getAttribute('data-glossary-term'), 'mittelwert');
  });
});
