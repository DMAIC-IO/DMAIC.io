/**
 * D.Mike — Attribute control chart references (attribute-control-chart-references.js)
 * CSL-JSON subset; only `note` is localized.
 * @see docs/superpowers/specs/2026-09-27-module-references-tab-design.md
 */

import { MONTGOMERY_SQC_6 } from '../../core/references-books.js';

export default [
  {
    ...MONTGOMERY_SQC_6,
    note: {
      de: 'Abschn. 5.3.6: Jede zusätzliche Sensitivitätsregel erhöht die Fehlalarm-Rate; Grundlage für die Voreinstellung „nur Test 1“.',
      en: 'Sec. 5.3.6: every additional sensitizing rule raises the false-alarm rate; basis for the default of test 1 only.',
    },
  },
];
