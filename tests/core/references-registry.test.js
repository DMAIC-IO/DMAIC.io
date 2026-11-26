import { suite, test, assertEqual, assertTrue } from '../test-utils.js';
import { BOOKS, resolveReferences, MELZER_2019 } from '../../js/core/references-books.js';
import { getModuleReferences, hasModuleReferences } from '../../js/core/references-registry.js';
import { REFS } from '../../js/core/references-registry.generated.js';
import attributeControlChartRefs from '../../js/modules/attribute-control-chart/resources/data/references.json' with { type: 'json' };
import controlChartRefs from '../../js/modules/control-chart/resources/data/references.json' with { type: 'json' };
import doePlannerRefs from '../../js/modules/doe-planner/resources/data/references.json' with { type: 'json' };
import hypothesisTestRefs from '../../js/modules/hypothesis-test/resources/data/references.json' with { type: 'json' };
import msaTyp1Refs from '../../js/modules/msa-typ1/resources/data/references.json' with { type: 'json' };
import msaTyp2Refs from '../../js/modules/msa-typ2/resources/data/references.json' with { type: 'json' };
import msaTyp5Refs from '../../js/modules/msa-typ5/resources/data/references.json' with { type: 'json' };
import processCapabilityRefs from '../../js/modules/process-capability/resources/data/references.json' with { type: 'json' };
import sampleSizeRefs from '../../js/modules/sample-size/resources/data/references.json' with { type: 'json' };

/** Umgestellte Module führen ihre Quellen in resources/data/references.json, nicht in REFS. */
const JSON_REFS = {
  'attribute-control-chart': resolveReferences(attributeControlChartRefs.references ?? []),
  'control-chart': resolveReferences(controlChartRefs.references ?? []),
  'doe-planner': resolveReferences(doePlannerRefs.references ?? []),
  'hypothesis-test': resolveReferences(hypothesisTestRefs.references ?? []),
  'msa-typ1': resolveReferences(msaTyp1Refs.references ?? []),
  'msa-typ2': resolveReferences(msaTyp2Refs.references ?? []),
  'msa-typ5': resolveReferences(msaTyp5Refs.references ?? []),
  'process-capability': resolveReferences(processCapabilityRefs.references ?? []),
  'sample-size': resolveReferences(sampleSizeRefs.references ?? []),
};

suite('references-registry', () => {
  test('hasModuleReferences is false for an unknown module', () => {
    assertEqual(hasModuleReferences('gibt-es-nicht'), false, 'unknown module');
  });

  test('getModuleReferences resolves to [] for an unknown module', async () => {
    const refs = await getModuleReferences('gibt-es-nicht');
    assertTrue(Array.isArray(refs) && refs.length === 0, 'empty array');
  });

  test('every generated entry is an array and is reachable through the API', async () => {
    for (const id of Object.keys(REFS)) {
      assertTrue(hasModuleReferences(id), `hasModuleReferences(${id})`);
      const refs = await getModuleReferences(id);
      assertTrue(Array.isArray(refs), `${id} → array`);
    }
  });
});

/**
 * Modules revised after the Melzer 2019 book review cite the book and the
 * primary sources their specs relied on.
 */
const BOOK_REVIEW_REFS = {
  'attribute-control-chart': ['montgomery-sqc-6'],
  'control-chart': ['melzer-2019', 'montgomery-sqc-6'],
  'doe-planner': ['melzer-2019', 'montgomery-doe-10'],
  'glm-regression': ['melzer-2019', 'hosmer-lemeshow-2013'],
  'hypothesis-test': ['melzer-2019'],
  'sample-size': ['melzer-2019'],
  'msa-typ1': ['melzer-2019', 'bosch-heft-10'],
  'msa-typ2': ['melzer-2019', 'aiag-msa-4'],
  'msa-typ5': ['melzer-2019', 'aiag-msa-4', 'bosch-heft-10', 'fleiss-nee-landis-1979'],
  'msa-typ6': ['aiag-msa-4', 'montgomery-sqc-6', 'nelson-1984'],
  'process-capability': ['melzer-2019', 'montgomery-sqc-6'],
};

suite('references-registry — book review sources', () => {
  for (const [moduleId, ids] of Object.entries(BOOK_REVIEW_REFS)) {
    test(`${moduleId} lists ${ids.join(', ')}`, () => {
      const refs = REFS[moduleId] ?? JSON_REFS[moduleId];
      assertTrue(Array.isArray(refs), `${moduleId}: keine Quellen in REFS oder JSON_REFS`);
      const known = new Set(refs.map(r => r.id));
      const missing = ids.filter(id => !known.has(id));
      assertEqual(missing.join(', '), '', `${moduleId} missing references`);
    });
  }

  test('every entry has a unique id, a title and a note in de and en', () => {
    const offenders = [];
    for (const [moduleId, refs] of Object.entries(REFS)) {
      const seen = new Set();
      for (const r of refs) {
        if (!r.id || seen.has(r.id)) offenders.push(`${moduleId}: duplicate or missing id ${r.id}`);
        seen.add(r.id);
        if (!r.title) offenders.push(`${moduleId}/${r.id}: no title`);
        if (!r.note?.de || !r.note?.en) offenders.push(`${moduleId}/${r.id}: note not in de and en`);
      }
    }
    assertEqual(offenders.join('\n'), '', 'malformed references');
  });
});

suite('references-books: BOOKS und resolveReferences', () => {
  test('BOOKS führt die vier Bücher unter ihrer id', () => {
    assertEqual(Object.keys(BOOKS).sort().join(','), 'aiag-msa-4,bosch-heft-10,melzer-2019,montgomery-sqc-6');
    assertTrue(BOOKS['melzer-2019'] === MELZER_2019);
  });

  test('Buch-Id aus der Prototypenkette ist unbekannt und fällt mit Warnung weg', () => {
    const warn = console.warn;
    const warned = [];
    console.warn = (...a) => warned.push(a.join(' '));
    let out;
    try { out = resolveReferences([{ book: 'constructor' }]); } finally { console.warn = warn; }
    assertEqual(out.length, 0);
    assertEqual(warned.length, 1);
  });

  test('{ book, note } wird zum Buch mit note; CSL bleibt; unbekanntes Buch fällt weg', () => {
    const warn = console.warn;
    const warned = [];
    console.warn = (...a) => warned.push(a.join(' '));
    let out;
    try {
      out = resolveReferences([
        { book: 'melzer-2019', note: { de: 'K3', en: 'C3' } },
        { book: 'aiag-msa-4' },
        { book: 'nope' },
        { id: 'x', type: 'webpage', title: 'X', author: [{ literal: 'X' }] },
      ]);
    } finally { console.warn = warn; }
    assertEqual(out.length, 3);
    assertEqual(out[0].id, 'melzer-2019');
    assertEqual(out[0].note.de, 'K3');
    assertEqual('note' in out[1], false);
    assertEqual(out[2].id, 'x');
    assertEqual(warned.length, 1);
    assertTrue(warned[0].includes('nope'));
    assertEqual('note' in MELZER_2019, false, 'Buch-Konstante unverändert');
  });
});
