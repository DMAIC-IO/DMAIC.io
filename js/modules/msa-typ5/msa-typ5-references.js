/**
 * D.Mike — MSA Type 5 references (msa-typ5-references.js)
 * CSL-JSON subset; only `note` is localized.
 * @see docs/superpowers/specs/2026-09-27-module-references-tab-design.md
 */

import { AIAG_MSA_4, BOSCH_HEFT_10, MELZER_2019 } from '../../core/references-books.js';

export default [
  {
    ...MELZER_2019,
    note: {
      de: 'Abgleich der attributiven Studie: Miss-Rate und Fehlalarm im Urteil, Bosch-Regel, z und p je κ, κ innerhalb der Prüfer.',
      en: 'Cross-check of the attribute study: miss and false-alarm rate in the verdict, Bosch rule set, z and p per κ, within-appraiser κ.',
    },
  },
  {
    ...AIAG_MSA_4,
    note: {
      de: 'Kap. III-C: voreingestellte Bewertungsregel aus Fleiss κ, Effektivität, Miss-Rate und Fehlalarm-Rate.',
      en: 'Ch. III-C: default verdict rule from Fleiss κ, effectiveness, miss rate and false-alarm rate.',
    },
  },
  {
    ...BOSCH_HEFT_10,
    note: {
      de: 'Wahlweise Bewertungsregel: kleinstes κ, fähig ab 0,9, bedingt fähig ab 0,7.',
      en: 'Optional verdict rule: smallest κ, capable from 0.9, conditionally capable from 0.7.',
    },
  },
  {
    id: 'fleiss-nee-landis-1979',
    type: 'article-journal',
    author: [
      { family: 'Fleiss', given: 'Joseph L.' },
      { family: 'Nee', given: 'John C. M.' },
      { family: 'Landis', given: 'J. Richard' },
    ],
    title: 'Large sample variance of kappa in the case of different sets of raters',
    'container-title': 'Psychological Bulletin',
    volume: '86',
    issue: '5',
    page: '974–977',
    issued: { 'date-parts': [[1979]] },
    DOI: '10.1037/0033-2909.86.5.974',
    note: {
      de: 'Standardfehler von Fleiss κ unter H0 für z und p.',
      en: 'Standard error of Fleiss κ under H0 for z and p.',
    },
  },
];
