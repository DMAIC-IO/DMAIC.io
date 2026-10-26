/**
 * D.Mike — Attribute test references (attribute-test-references.js)
 * CSL-JSON subset; only `note` is localized.
 */

import { MELZER_2019 } from '../../core/references-books.js';

export default [
  {
    ...MELZER_2019,
    note: {
      de: 'Referenzwerte für die Validierung: Tests auf Anteile (§3.5.1, §13.4), Fisher-exakt (§9.10), Chi-Quadrat-Test auf Unabhängigkeit (§9.11) und Clopper-Pearson-Intervall (§8.7). Als Szenarien in der Hilfe: gepaarte Vorher-nachher-Prüfung für McNemar (§3.5.1) und Nachprüfung für den Äquivalenztest (§13.4).',
      en: 'Reference values for validation: proportion tests (§3.5.1, §13.4), Fisher\'s exact test (§9.10), chi-square test of association (§9.11) and the Clopper-Pearson interval (§8.7). Used as scenarios in the help: the paired before/after inspection for McNemar (§3.5.1) and the re-inspection for the equivalence test (§13.4).',
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
  {
    id: 'minitab-methods-poisson-rate',
    type: 'webpage',
    title: 'Minitab Methods and Formulas: 1-Sample Poisson Rate',
    author: [{ literal: 'Minitab, LLC' }],
    URL: 'https://support.minitab.com/en-us/minitab/help-and-how-to/statistics/basic-statistics/how-to/1-sample-poisson-rate/methods-and-formulas/methods-and-formulas/',
    note: {
      de: 'Methodenabgleich für Poisson-Raten (exaktes Intervall, Normalapproximation, Differenz zweier Raten). Abweichung: der zweiseitige exakte p-Wert verdoppelt den kleineren einseitigen Wert („central“), nicht das „minlike“-Verfahren von R.',
      en: 'Method cross-check for Poisson rates (exact interval, normal approximation, difference of two rates). Deviation: the two-sided exact p-value doubles the smaller one-sided value ("central"), not the "minlike" method of R.',
    },
  },
];
