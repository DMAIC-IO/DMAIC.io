/**
 * Tests for js/core/module-catalog.js — module.js-Beschreibung → Registry-Eintrag.
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../test-utils.js';
import { fromDescriptor } from '../../js/core/module-catalog.js';

suite('module-catalog: fromDescriptor', () => {
  const load = () => Promise.resolve({ default: {} });
  const tile = () => Promise.resolve({ default: {} });

  test('tile wird loadTile, form ist module, übrige Felder bleiben', () => {
    const entry = fromDescriptor({ id: 'neu', version: '1.0.0', icon: 'module.neu', phase: 'define',
      group: 'scope', uses: ['worksheet'], load, tile });
    assertEqual(entry.form, 'module');
    assertTrue(entry.loadTile === tile);
    assertTrue(entry.load === load);
    assertEqual('tile' in entry, false);
    assertDeepEqual(entry.uses, ['worksheet']);
    assertEqual(entry.group, 'scope');
  });

  test('ohne tile kein loadTile', () => {
    const entry = fromDescriptor({ id: 'neu', version: '1.0.0', icon: 'module.neu', phase: 'data', load });
    assertEqual('loadTile' in entry, false);
  });

  test('Beschreibung bleibt unverändert', () => {
    const d = { id: 'neu', version: '1.0.0', icon: 'module.neu', phase: 'data', load, tile };
    fromDescriptor(d);
    assertTrue(d.tile === tile);
    assertEqual('form' in d, false);
  });
});
