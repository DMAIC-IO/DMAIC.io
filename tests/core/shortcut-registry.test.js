/**
 * Kürzel-Register: Verlaufskürzel im Scope `module`.
 */
import { suite, test, assertEqual, assertTrue } from '../test-utils.js';
import { shortcutRegistry } from '../../js/core/shortcut-registry.js';

const all = () => shortcutRegistry.getAll();
const byId = (id) => all().find((d) => d.id === id);

suite('Kürzel-Register — Verlauf im Modul', () => {
  test('module.undo und module.redo sind in Scope und Kategorie module definiert', () => {
    for (const id of ['module.undo', 'module.redo']) {
      const def = byId(id);
      assertTrue(Boolean(def), `${id} fehlt`);
      assertEqual(def.scope, 'module', `${id} scope`);
      assertEqual(def.category, 'module', `${id} category`);
    }
  });

  test('module.undo ist Strg+Z, module.redo Strg+Y mit Alias Strg+Shift+Z', () => {
    assertEqual(shortcutRegistry.getCombo('module.undo'), 'Ctrl+Z');
    assertEqual(shortcutRegistry.getCombo('module.redo'), 'Ctrl+Y');
    const z = { key: 'z', ctrlKey: true };
    const zs = { key: 'Z', ctrlKey: true, shiftKey: true };
    assertTrue(shortcutRegistry.matches(z, 'module.undo'));
    assertTrue(shortcutRegistry.matches(zs, 'module.redo'));
    assertEqual(shortcutRegistry.matches(zs, 'module.undo'), false);
  });

  test('Strg+Z im Scope module kollidiert nur mit module.undo, nicht mit datagrid.undo', () => {
    const ids = shortcutRegistry.findConflicts('Ctrl+Z', 'module').map((c) => c.id);
    assertEqual(ids.join(','), 'module.undo');
  });
});
