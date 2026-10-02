/**
 * D.Mike — Sample size references (sample-size-references.js)
 * CSL-JSON subset; only `note` is localized.
 * @see docs/superpowers/specs/2026-09-27-module-references-tab-design.md
 */

import { MELZER_2019 } from '../../core/references-books.js';

export default [
  {
    ...MELZER_2019,
    note: {
      de: 'Abgleich der Power-Berechnung: Stichprobenumfänge für t-Tests beruhen auf der exakten Power der nichtzentralen t-Verteilung.',
      en: 'Cross-check of the power calculation: sample sizes for t-tests rest on the exact power of the noncentral t distribution.',
    },
  },
];
