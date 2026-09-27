/**
 * D.Mike — MSA Type 1 references (msa-typ1-references.js)
 * CSL-JSON subset; only `note` is localized.
 * @see docs/superpowers/specs/2026-09-27-module-references-tab-design.md
 */

export default [
  {
    id: 'aiag-msa-4',
    type: 'book',
    author: [{ family: 'AIAG' }],
    title: 'Measurement Systems Analysis (MSA) Reference Manual',
    edition: '4th',
    publisher: 'Automotive Industry Action Group',
    'publisher-place': 'Southfield, MI',
    issued: { 'date-parts': [[2010]] },
    ISBN: '978-1-60534-211-5',
    note: {
      de: 'Grundlage für Bias, Wiederholbarkeit und die Akzeptanzpraxis der Fähigkeitskennzahlen.',
      en: 'Basis for bias, repeatability and the acceptance practice for capability indices.',
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
