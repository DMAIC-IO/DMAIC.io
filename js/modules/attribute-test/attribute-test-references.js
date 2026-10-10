/**
 * D.Mike — Attribute test references (attribute-test-references.js)
 * CSL-JSON subset; only `note` is localized.
 * @see docs/superpowers/specs/2026-09-27-module-references-tab-design.md
 */

import { MELZER_2019 } from '../../core/references-books.js';

export default [
  {
    ...MELZER_2019,
    note: {
      de: 'Referenzwerte für die Validierung: Tests auf Anteile (§3.5.1, §13.4), Fisher-exakt (§9.10), Chi-Quadrat-Test auf Unabhängigkeit (§9.11) und Clopper-Pearson-Intervall (§8.7).',
      en: 'Reference values for validation: proportion tests (§3.5.1, §13.4), Fisher\'s exact test (§9.10), chi-square test of association (§9.11) and the Clopper-Pearson interval (§8.7).',
    },
  },
  {
    id: 'minitab-methods-proportions',
    type: 'webpage',
    title: 'Minitab Methods and Formulas: 1 Proportion, 2 Proportions, Chi-Square Test for Association',
    author: [{ literal: 'Minitab, LLC' }],
    URL: 'https://support.minitab.com/en-us/minitab/help-and-how-to/statistics/basic-statistics/how-to/1-proportion/methods-and-formulas/methods-and-formulas/',
    note: {
      de: 'Methodenabgleich. Abweichung: Minitab rechnet für einen Anteil standardmäßig das angepasste Blaker-Intervall; dieses Modul verwendet Clopper-Pearson (bei Minitab die Option „Exakt“).',
      en: 'Method cross-check. Deviation: for one proportion Minitab defaults to the adjusted Blaker interval; this module uses Clopper-Pearson (Minitab\'s "Exact" option).',
    },
  },
];
