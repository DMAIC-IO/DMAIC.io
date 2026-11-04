/**
 * Der erzeugte Katalog (js/modules/catalog.generated.js) zur Laufzeit.
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../test-utils.js';
import { MODULES, CONVERTED } from '../../js/modules/catalog.generated.js';
import manifest from '../../js/modules/manifest.js';
import { treePhaseForCycle } from '../../js/modules/voc-ctx-tree/voc-ctx-tree-phase.js';

suite('Katalog zur Laufzeit', () => {
  test('MODULES = manifest.js-Einträge, dahinter je umgestelltem Modul einer mit form: module', () => {
    assertEqual(MODULES.length, manifest.length + CONVERTED.length);
    assertTrue(manifest.every((e, i) => MODULES[i] === e));
    assertDeepEqual(MODULES.slice(manifest.length).map((e) => [e.id, e.form]), CONVERTED.map((id) => [id, 'module']));
  });

  test('Ids sind eindeutig', () => {
    const ids = MODULES.map((e) => e.id);
    assertEqual(new Set(ids).size, ids.length);
  });

  test('voc-ctx-tree liest seine Phase aus dem Katalog', () => {
    const def = MODULES.find((m) => m.id === 'voc-ctx-tree');
    assertEqual(treePhaseForCycle('dmaic'), def.cycles?.dmaic?.phase || def.phase || 'define');
  });
});
