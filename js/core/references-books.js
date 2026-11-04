/**
 * D.Mike — bibliographic data shared by several module reference lists.
 * Each module spreads an entry and adds its own localized `note`.
 * Module in neuer Form verweisen in `resources/data/references.json` per
 * `{ book: <id> }` auf ein Buch; `resolveReferences` löst das auf.
 */

/** Melzer 2019 — basis of a book review. */
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

/** Montgomery SQC — sensitizing rules (§5.3.6) and process capability. */
export const MONTGOMERY_SQC_6 = {
  id: 'montgomery-sqc-6',
  type: 'book',
  author: [{ family: 'Montgomery', given: 'Douglas C.' }],
  title: 'Introduction to Statistical Quality Control',
  edition: '6th',
  publisher: 'John Wiley & Sons',
  'publisher-place': 'Hoboken, NJ',
  issued: { 'date-parts': [[2009]] },
  ISBN: '978-0-470-16992-6',
};

/** Die Bücher unter ihrer id — Ziel von `{ book: <id> }` in resources/data/references.json. */
export const BOOKS = Object.freeze(Object.fromEntries(
  [MELZER_2019, AIAG_MSA_4, BOSCH_HEFT_10, MONTGOMERY_SQC_6].map((b) => [b.id, b]),
));

/**
 * Buchverweise einer Referenzliste auflösen: `{ book, note? }` wird zum
 * Buch-Eintrag mit eigener `note`; CSL-Einträge bleiben unverändert. Ein
 * unbekanntes Buch fällt mit Warnung weg (das Build-Gate verhindert ihn).
 * @param {object[]} list
 * @param {Record<string, object>} [books]
 * @returns {object[]}
 */
export function resolveReferences(list, books = BOOKS) {
  const out = [];
  for (const entry of list) {
    if (!Object.hasOwn(entry, 'book')) { out.push(entry); continue; }
    const book = Object.hasOwn(books, entry.book) ? books[entry.book] : undefined;
    if (!book) { console.warn('[references] unbekanntes Buch:', entry.book); continue; }
    out.push(entry.note ? { ...book, note: entry.note } : { ...book });
  }
  return out;
}
