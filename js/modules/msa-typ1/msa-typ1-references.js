/**
 * D.Mike — MSA Type 1 references (msa-typ1-references.js)
 * CSL-JSON subset; only `note` is localized.
 * @see docs/superpowers/specs/2026-09-27-module-references-tab-design.md
 */

import { AIAG_MSA_4, BOSCH_HEFT_10, MELZER_2019 } from '../../core/references-books.js';

export default [
  {
    ...AIAG_MSA_4,
    note: {
      de: 'Grundlage für Bias, Wiederholbarkeit und die Akzeptanzpraxis der Fähigkeitskennzahlen.',
      en: 'Basis for bias, repeatability and the acceptance practice for capability indices.',
    },
  },
  {
    ...BOSCH_HEFT_10,
    note: {
      de: 'Vorgabe k₂ = 3 (6·s) für Cg und Cgk, wie auch in Minitab.',
      en: 'Default k₂ = 3 (6·s) for Cg and Cgk, as in Minitab.',
    },
  },
  {
    ...MELZER_2019,
    note: {
      de: 'Abgleich der Typ-1-Studie: Vorgabe 6·s, Bias-t-Test, %Var(Wiederholbarkeit) und einseitige Toleranz.',
      en: 'Cross-check of the type 1 study: 6·s default, bias t-test, %Var(repeatability) and one-sided tolerance.',
    },
  },
  {
    id: 'vda-5',
    type: 'book',
    author: [{ family: 'Verband der Automobilindustrie' }],
    title: 'VDA Band 5 — Mess- und Prüfprozesseignung',
    edition: '3.',
    publisher: 'VDA QMC',
    'publisher-place': 'Berlin',
    issued: { 'date-parts': [[2021]] },
    note: {
      de: 'Definiert Cg und Cgk über 0,2·T und 6·s sowie die Annahmegrenze 1,33.',
      en: 'Defines Cg and Cgk via 0.2·T and 6·s, and the 1.33 acceptance limit.',
    },
  },
  {
    id: 'iso-22514-7',
    type: 'standard',
    author: [{ family: 'ISO' }],
    title: 'ISO 22514-7: Capability of measurement processes',
    publisher: 'International Organization for Standardization',
    issued: { 'date-parts': [[2021]] },
    URL: 'https://www.iso.org/standard/78307.html',
    note: {
      de: 'Normativer Rahmen für die Eignung von Messprozessen.',
      en: 'Normative framework for the capability of measurement processes.',
    },
  },
];
