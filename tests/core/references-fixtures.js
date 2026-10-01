/**
 * Shared CSL-JSON entries for the references-renderer tests. Not a test file
 * itself (no `.test.js` suffix), so neither runner collects it.
 */

export const BOOK = {
  id: 'aiag-msa-4', type: 'book',
  author: [{ family: 'AIAG' }],
  title: 'Measurement Systems Analysis (MSA)',
  edition: '4th', publisher: 'AIAG',
  issued: { 'date-parts': [[2010]] },
  ISBN: '978-1605341118',
  note: { de: 'Cg/Cgk-Grenzen', en: 'Cg/Cgk limits' },
};

export const ARTICLE = {
  id: 'wheeler-1992', type: 'article-journal',
  author: [{ family: 'Wheeler', given: 'Donald J.' }, { family: 'Chambers', given: 'David S.' }],
  title: 'Understanding Statistical Process Control',
  'container-title': 'Quality Engineering',
  volume: '5', page: '1-20',
  issued: { 'date-parts': [[1992]] },
  DOI: '10.1000/xyz',
};

export const THREE = {
  id: 'montgomery-2011', type: 'book',
  author: [{ family: 'Montgomery' }, { family: 'Runger' }, { family: 'Hubele' }],
  title: 'Engineering Statistics',
  issued: { 'date-parts': [[2011]] },
};
