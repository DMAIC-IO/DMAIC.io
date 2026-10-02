/**
 * D.Mike — MSA Type 2 references (msa-typ2-references.js)
 * CSL-JSON subset; only `note` is localized.
 * @see docs/superpowers/specs/2026-09-27-module-references-tab-design.md
 */

import { AIAG_MSA_4, MELZER_2019 } from '../../core/references-books.js';

export default [
  {
    ...MELZER_2019,
    note: {
      de: 'Abgleich der Typ-2-Studie: Multiplikator 6 statt 5,15, Urteil wahlweise über %Toleranz, optional historisches Prozess-σ.',
      en: 'Cross-check of the type 2 study: multiplier 6 instead of 5.15, verdict optionally via %tolerance, optional historical process σ.',
    },
  },
  {
    ...AIAG_MSA_4,
    note: {
      de: 'Grundlage für %GRR mit 6·σ, ndc und die Akzeptanzgrenzen 10 % / 30 %.',
      en: 'Basis for %GRR with 6·σ, ndc and the 10 % / 30 % acceptance limits.',
    },
  },
];
