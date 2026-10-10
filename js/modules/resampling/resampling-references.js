/**
 * D.Mike — Resampling references (resampling-references.js)
 * CSL-JSON subset; only `note` is localized.
 * @see docs/superpowers/specs/2026-09-27-module-references-tab-design.md
 */

export default [
  {
    id: 'efron-tibshirani-1993',
    type: 'book',
    author: [
      { family: 'Efron', given: 'Bradley' },
      { family: 'Tibshirani', given: 'Robert J.' },
    ],
    title: 'An Introduction to the Bootstrap',
    publisher: 'Chapman & Hall',
    'publisher-place': 'New York',
    issued: { 'date-parts': [[1993]] },
    ISBN: '978-0-412-04231-7',
    note: {
      de: 'Grundlage des Bootstraps: Standardfehler, Verzerrung, Perzentil- und BCa-Intervall (Kap. 14) mit Jackknife-Beschleunigung.',
      en: 'Foundation of the bootstrap: standard error, bias, percentile and BCa intervals (ch. 14) with jackknife acceleration.',
    },
  },
  {
    id: 'davison-hinkley-1997',
    type: 'book',
    author: [
      { family: 'Davison', given: 'A. C.' },
      { family: 'Hinkley', given: 'D. V.' },
    ],
    title: 'Bootstrap Methods and their Application',
    publisher: 'Cambridge University Press',
    'publisher-place': 'Cambridge',
    issued: { 'date-parts': [[1997]] },
    ISBN: '978-0-521-57471-6',
    note: {
      de: 'Referenz der R-Bibliothek boot, gegen die das Modul geprüft wird: Intervallformeln, Interpolation der Quantile, Mehrstichproben-Bootstrap.',
      en: 'Reference of the R package boot the module is validated against: interval formulas, quantile interpolation, multi-sample bootstrap.',
    },
  },
  {
    id: 'good-2005',
    type: 'book',
    author: [{ family: 'Good', given: 'Phillip I.' }],
    title: 'Permutation, Parametric and Bootstrap Tests of Hypotheses',
    edition: '3',
    publisher: 'Springer',
    'publisher-place': 'New York',
    issued: { 'date-parts': [[2005]] },
    ISBN: '978-0-387-20279-2',
    DOI: '10.1007/b138696',
    note: {
      de: 'Permutationstests für zwei, gepaarte und k Stichproben, exakte Enumeration und Monte-Carlo-p-Wert.',
      en: 'Permutation tests for two, paired and k samples, exact enumeration and the Monte Carlo p-value.',
    },
  },
];
