/**
 * D.Mike — Hypothesis test references (hypothesis-test-references.js)
 * CSL-JSON subset; only `note` is localized.
 * @see docs/superpowers/specs/2026-09-27-module-references-tab-design.md
 */

import { MELZER_2019 } from '../../core/references-books.js';

export default [
  {
    ...MELZER_2019,
    note: {
      de: 'Abgleich der Power-Berechnung: Die Power der t-Tests folgt exakt der nichtzentralen t-Verteilung.',
      en: 'Cross-check of the power calculation: t-test power follows the noncentral t distribution exactly.',
    },
  },
  {
    id: 'hodges-lehmann-1963',
    type: 'article-journal',
    author: [
      { family: 'Hodges', given: 'J. L.' },
      { family: 'Lehmann', given: 'E. L.' },
    ],
    title: 'Estimates of location based on rank tests',
    'container-title': 'Annals of Mathematical Statistics',
    volume: '34',
    issue: '2',
    page: '598–611',
    issued: { 'date-parts': [[1963]] },
    DOI: '10.1214/aoms/1177704172',
    note: {
      de: 'Hodges-Lehmann-Schätzer der Lageverschiebung zum Mann-Whitney-Test.',
      en: 'Hodges-Lehmann estimate of the location shift for the Mann-Whitney test.',
    },
  },
];
