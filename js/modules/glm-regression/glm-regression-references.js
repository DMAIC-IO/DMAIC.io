/**
 * D.Mike — GLM regression references (glm-regression-references.js)
 * CSL-JSON subset; only `note` is localized.
 * @see docs/superpowers/specs/2026-09-27-module-references-tab-design.md
 */

import { MELZER_2019 } from '../../core/references-books.js';

export default [
  {
    ...MELZER_2019,
    note: {
      de: 'Abgleich der binären logistischen Regression mit gruppierten Daten (Ereignisse/Versuche, Kap. 15.3) und des Anpassungstests (Kap. 9.14.2): Hosmer-Lemeshow, ROC und Klassifikationstabelle zählen Versuche, nicht Zeilen.',
      en: 'Cross-check of binary logistic regression on grouped data (events/trials, ch. 15.3) and of the goodness-of-fit test (ch. 9.14.2): Hosmer–Lemeshow, ROC and the classification table count trials, not rows.',
    },
  },
  {
    id: 'hosmer-lemeshow-2013',
    type: 'book',
    author: [
      { family: 'Hosmer', given: 'David W.' },
      { family: 'Lemeshow', given: 'Stanley' },
      { family: 'Sturdivant', given: 'Rodney X.' },
    ],
    title: 'Applied Logistic Regression',
    edition: '3rd',
    publisher: 'John Wiley & Sons',
    'publisher-place': 'Hoboken, NJ',
    issued: { 'date-parts': [[2013]] },
    ISBN: '978-0-470-58247-3',
    note: {
      de: 'Hosmer-Lemeshow-Anpassungstest: Gruppierung nach geschätzten Wahrscheinlichkeiten, beobachtete gegen erwartete Häufigkeiten je Gruppe.',
      en: 'Hosmer–Lemeshow goodness-of-fit test: grouping by estimated probabilities, observed versus expected counts per group.',
    },
  },
];
