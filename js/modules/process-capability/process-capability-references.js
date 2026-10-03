/**
 * D.Mike — Process capability references (process-capability-references.js)
 * CSL-JSON subset; only `note` is localized.
 * @see docs/superpowers/specs/2026-09-27-module-references-tab-design.md
 */

import { MELZER_2019, MONTGOMERY_SQC_6 } from '../../core/references-books.js';

export default [
  {
    ...MELZER_2019,
    note: {
      de: 'Abgleich der Fähigkeitskennzahlen: Cp/Cpk aus σ innerhalb, Pp/Ppk aus σ gesamt, Z.bench, PPM beobachtet und erwartet.',
      en: 'Cross-check of the capability indices: Cp/Cpk from σ within, Pp/Ppk from σ overall, Z.bench, observed and expected PPM.',
    },
  },
  {
    ...MONTGOMERY_SQC_6,
    note: {
      de: 'Kolbenring-Daten (Tab. 6.3) als Referenz für Cp/Cpk aus σ innerhalb.',
      en: 'Piston-ring data (Table 6.3) as the reference for Cp/Cpk from σ within.',
    },
  },
];
