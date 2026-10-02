/**
 * D.Mike — Control chart references (control-chart-references.js)
 * CSL-JSON subset; only `note` is localized.
 * @see docs/superpowers/specs/2026-09-27-module-references-tab-design.md
 */

import { MELZER_2019 } from '../../core/references-books.js';

export default [
  {
    ...MELZER_2019,
    note: {
      de: 'Abgleich der Sondertests: Test 4 schlägt bei 14 alternierenden Punkten an, MR-, R- und S-Karten prüfen nur die Tests 1–4.',
      en: 'Cross-check of the special-cause tests: test 4 fires at 14 alternating points, MR, R and S charts evaluate tests 1–4 only.',
    },
  },
];
