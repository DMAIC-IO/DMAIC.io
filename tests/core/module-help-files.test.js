/**
 * Tests for js/core/module-help-files.js — help.<lang>.json → Hilfe-Definition.
 */
import { suite, test, assertDeepEqual } from '../test-utils.js';
import { helpDefFromFile, helpDefFromFiles } from '../../js/core/module-help-files.js';

const DE = { sections: { a: { title: 'A', blocks: [] }, b: { title: 'B', blocks: [] } } };
const EN = { sections: { a: { title: 'A-en', blocks: [] }, b: { title: 'B-en', blocks: [] }, c: { title: 'C', blocks: [] } } };

suite('module-help-files', () => {
  test('helpDefFromFile: eine Sprache unter sections.<sec>.<lang>', () => {
    assertDeepEqual(helpDefFromFile('neu', 'de', DE), {
      moduleId: 'neu',
      sections: { a: { de: DE.sections.a }, b: { de: DE.sections.b } },
    });
  });

  test('helpDefFromFiles: beide Sprachen zusammengeführt, Reihenfolge de, dann nur-en', () => {
    const def = helpDefFromFiles('neu', { de: DE, en: EN });
    assertDeepEqual(Object.keys(def.sections), ['a', 'b', 'c']);
    assertDeepEqual(def.sections.a, { de: DE.sections.a, en: EN.sections.a });
    assertDeepEqual(def.sections.c, { en: EN.sections.c });
  });

  test('fehlende Datei oder ohne sections: leere sections', () => {
    assertDeepEqual(helpDefFromFiles('neu', { de: undefined }), { moduleId: 'neu', sections: {} });
  });
});
