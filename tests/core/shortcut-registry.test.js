/**
 * Kürzel-Register: Verlaufskürzel im Scope `module`.
 */
import { suite, test, assertEqual, assertTrue } from '../test-utils.js';
import { shortcutRegistry, migrateShortcutSettings } from '../../js/core/shortcut-registry.js';

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

  test('Strg+Z im Scope module kollidiert nur mit module.undo, nicht mit einem Tabellenkürzel', () => {
    const ids = shortcutRegistry.findConflicts('Ctrl+Z', 'module').map((c) => c.id);
    assertEqual(ids.join(','), 'module.undo');
  });
});

suite('Kürzel-Register — Kürzel des Rasters (P10)', () => {
  const expected = {
    'datagrid.copy': ['Ctrl+C', []],
    'datagrid.cut': ['Ctrl+X', []],
    'datagrid.paste': ['Ctrl+V', []],
    'datagrid.clear': ['Delete', ['Backspace']],
    'datagrid.cancelEdit': ['Escape', []],
  };

  test('neue Ids sind im Scope datagrid mit Taste und Alias registriert', () => {
    for (const [id, [combo, alias]] of Object.entries(expected)) {
      const def = byId(id);
      assertTrue(Boolean(def), `${id} fehlt`);
      assertEqual(def.scope, 'datagrid', `${id} scope`);
      assertEqual(def.category, 'datagrid', `${id} category`);
      assertEqual(def.defaultCombo, combo, `${id} combo`);
      assertEqual(def.aliasCombos.join(','), alias.join(','), `${id} alias`);
      assertTrue(def.descriptionKey.startsWith('settings.shortcutsLabel.'), `${id} descriptionKey`);
    }
  });

  test('Entf und Rücktaste lösen datagrid.clear aus, Esc datagrid.cancelEdit', () => {
    assertTrue(shortcutRegistry.matches({ key: 'Delete' }, 'datagrid.clear'));
    assertTrue(shortcutRegistry.matches({ key: 'Backspace' }, 'datagrid.clear'));
    assertTrue(shortcutRegistry.matches({ key: 'Escape' }, 'datagrid.cancelEdit'));
    assertTrue(shortcutRegistry.matches({ key: 'c', ctrlKey: true }, 'datagrid.copy'));
  });

  test('datagrid.undo und datagrid.redo sind entfernt', () => {
    assertEqual(byId('datagrid.undo'), undefined);
    assertEqual(byId('datagrid.redo'), undefined);
  });

  test('migrateShortcutSettings überträgt die Belegung nach module.undo/redo', () => {
    const store = { 'settings.shortcuts.datagrid.undo': 'Ctrl+Q', 'settings.shortcuts.datagrid.redo': 'Ctrl+W' };
    const sm = { get: (p) => store[p] ?? null, set: (p, v) => { store[p] = v; } };
    migrateShortcutSettings(sm);
    assertEqual(store['settings.shortcuts.module.undo'], 'Ctrl+Q');
    assertEqual(store['settings.shortcuts.module.redo'], 'Ctrl+W');
    assertEqual(store['settings.shortcuts.datagrid.undo'], null);
    assertEqual(store['settings.shortcuts.datagrid.redo'], null);
  });

  test('migrateShortcutSettings überschreibt keine vorhandene module-Belegung', () => {
    const store = { 'settings.shortcuts.datagrid.undo': 'Ctrl+Q', 'settings.shortcuts.module.undo': 'Ctrl+J' };
    const sm = { get: (p) => store[p] ?? null, set: (p, v) => { store[p] = v; } };
    migrateShortcutSettings(sm);
    assertEqual(store['settings.shortcuts.module.undo'], 'Ctrl+J');
    assertEqual(store['settings.shortcuts.datagrid.undo'], null);
  });

  test('migrateShortcutSettings ohne alte Belegung schreibt nichts', () => {
    const writes = [];
    const sm = { get: () => null, set: (p, v) => writes.push(p, v) };
    migrateShortcutSettings(sm);
    assertEqual(writes.length, 0);
  });
});
