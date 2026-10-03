/**
 * D.Mike — DOE planner references (doe-planner-references.js)
 * CSL-JSON subset; only `note` is localized.
 * @see docs/superpowers/specs/2026-09-27-module-references-tab-design.md
 */

import { MELZER_2019 } from '../../core/references-books.js';

export default [
  {
    ...MELZER_2019,
    note: {
      de: 'Abgleich von Versuchsbewertung und Power: VIF, Effizienz und Power folgen den aktiven Modelltermen, die Power der nichtzentralen F-Verteilung.',
      en: 'Cross-check of design evaluation and power: VIF, efficiency and power follow the active model terms, power uses the noncentral F distribution.',
    },
  },
  {
    id: 'montgomery-doe-10',
    type: 'book',
    author: [{ family: 'Montgomery', given: 'Douglas C.' }],
    title: 'Design and Analysis of Experiments',
    edition: '10th',
    publisher: 'John Wiley & Sons',
    'publisher-place': 'Hoboken, NJ',
    issued: { 'date-parts': [[2019]] },
    ISBN: '978-1-119-49244-3',
    note: {
      de: 'Kap. 10: VIF als 1/(1 − R²) der Regression eines Terms auf alle übrigen; orthogonale Pläne, auch mit Zentralpunkten, haben VIF = 1.',
      en: 'Ch. 10: VIF as 1/(1 − R²) of regressing one term on all others; orthogonal designs, centre points included, have VIF = 1.',
    },
  },
];
