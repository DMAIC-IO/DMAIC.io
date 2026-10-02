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
];
