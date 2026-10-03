/**
 * D.Mike — Control chart references (control-chart-references.js)
 * CSL-JSON subset; only `note` is localized.
 * @see docs/superpowers/specs/2026-09-27-module-references-tab-design.md
 */

import { MELZER_2019, MONTGOMERY_SQC_6 } from '../../core/references-books.js';

export default [
  {
    ...MELZER_2019,
    note: {
      de: 'Abgleich der Sondertests: Test 4 schlägt bei 14 alternierenden Punkten an, MR-, R- und S-Karten prüfen nur die Tests 1–4. Das Buch arbeitet nur mit Test 1; das ist jetzt auch die Voreinstellung. Regelkarte mit Stages (Kap. 5.2, S. 100, Abb. 5.4): Jede Stage hat eigene Grenzen und wird an ihnen gemessen.',
      en: 'Cross-check of the special-cause tests: test 4 fires at 14 alternating points, MR, R and S charts evaluate tests 1–4 only. The book works with test 1 only, which is now also the default. Staged chart (ch. 5.2, p. 100, Fig. 5.4): each stage has its own limits and is judged against them.',
    },
  },
  {
    ...MONTGOMERY_SQC_6,
    note: {
      de: 'Abschn. 5.3.6: Jede zusätzliche Sensitivitätsregel erhöht die Fehlalarm-Rate; Grundlage für die Voreinstellung „nur Test 1“.',
      en: 'Sec. 5.3.6: every additional sensitizing rule raises the false-alarm rate; basis for the default of test 1 only.',
    },
  },
];
