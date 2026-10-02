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
];
