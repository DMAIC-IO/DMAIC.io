/**
 * D.Mike — MSA Type 6 references (msa-typ6-references.js)
 * CSL-JSON subset; only `note` is localized.
 *
 * The traffic-light thresholds (≥ 3 Nelson violations, p < α/10) are
 * D.Mike's own rule — no note may attribute them to a source.
 *
 * @see docs/superpowers/specs/2026-10-07-handbook-references-design.md
 */

import { AIAG_MSA_4, MONTGOMERY_SQC_6 } from '../../core/references-books.js';

export default [
  {
    ...AIAG_MSA_4,
    note: {
      de: 'Stabilitätsstudie: ein Referenzteil wird regelmäßig gemessen und die Werte werden auf einer Regelkarte über die Zeit ausgewertet.',
      en: 'Stability study: one reference part is measured periodically and the readings are evaluated on a control chart over time.',
    },
  },
  {
    ...MONTGOMERY_SQC_6,
    note: {
      de: 'Shewhart-Regelkarten (I-MR, x̄-R) und Regeln für Sonderursachen.',
      en: 'Shewhart control charts (I-MR, x̄-R) and run rules for special causes.',
    },
  },
  {
    id: 'nelson-1984',
    type: 'article-journal',
    author: [{ family: 'Nelson', given: 'Lloyd S.' }],
    title: 'The Shewhart Control Chart—Tests for Special Causes',
    'container-title': 'Journal of Quality Technology',
    volume: '16',
    issue: '4',
    page: '237–239',
    issued: { 'date-parts': [[1984]] },
    DOI: '10.1080/00224065.1984.11978921',
    note: {
      de: 'Die acht Tests auf Sonderursachen (Nelson-Regeln 1–8).',
      en: 'The eight tests for special causes (Nelson rules 1–8).',
    },
  },
];
