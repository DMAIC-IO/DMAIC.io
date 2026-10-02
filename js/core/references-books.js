/**
 * D.Mike — bibliographic data shared by several module reference lists.
 * Each module spreads an entry and adds its own localized `note`.
 * @see docs/superpowers/specs/2026-09-27-module-references-tab-design.md
 */

/** Melzer 2019 — basis of the book review in docs/book-reviews/melzer-2019/. */
export const MELZER_2019 = {
  id: 'melzer-2019',
  type: 'book',
  author: [{ family: 'Melzer', given: 'Almut' }],
  title: 'Six Sigma – kompakt und praxisnah: Prozessverbesserung effizient und erfolgreich implementieren',
  edition: '2.',
  publisher: 'Springer Gabler',
  'publisher-place': 'Wiesbaden',
  issued: { 'date-parts': [[2019]] },
  ISBN: '978-3-658-23754-7',
  DOI: '10.1007/978-3-658-23755-4',
};

export const AIAG_MSA_4 = {
  id: 'aiag-msa-4',
  type: 'book',
  author: [{ family: 'AIAG' }],
  title: 'Measurement Systems Analysis (MSA) Reference Manual',
  edition: '4th',
  publisher: 'Automotive Industry Action Group',
  'publisher-place': 'Southfield, MI',
  issued: { 'date-parts': [[2010]] },
  ISBN: '978-1-60534-211-5',
};

/** Edition 11.2019; cited as "Bosch Heft 10" throughout the app. */
export const BOSCH_HEFT_10 = {
  id: 'bosch-heft-10',
  type: 'book',
  author: [{ family: 'Robert Bosch GmbH' }],
  title: 'Qualitätsmanagement in der Bosch-Gruppe, Technische Statistik, Heft 10: Fähigkeit von Mess- und Prüfprozessen',
  publisher: 'Robert Bosch GmbH',
  'publisher-place': 'Stuttgart',
  issued: { 'date-parts': [[2019, 11]] },
};
