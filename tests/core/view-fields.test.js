/**
 * Tests for core/view-fields.js — Pfade aus einer JSON-Form entfernen.
 */
import { suite, test, assertEqual, assertDeepEqual } from '../test-utils.js';
import { stripPaths } from '../../js/core/view-fields.js';

suite('view-fields — stripPaths', () => {
  test('ohne Pfade kommt derselbe Wert zurück', () => {
    const json = { a: 1 };
    assertEqual(stripPaths(json, []), json);
    assertEqual(stripPaths(json, undefined), json);
  });

  test('Schlüssel und Unterschlüssel', () => {
    assertDeepEqual(stripPaths({ a: 1, b: 2 }, ['a']), { b: 2 });
    assertDeepEqual(stripPaths({ ui: { tab: 'x', filter: null } }, ['ui.tab']), { ui: { filter: null } });
  });

  test('je Element', () => {
    assertDeepEqual(
      stripPaths({ risks: [{ id: 1, collapsed: true }, { id: 2 }] }, ['risks[].collapsed']),
      { risks: [{ id: 1 }, { id: 2 }] },
    );
    assertDeepEqual(
      stripPaths({ sheets: [{ id: 's', state: { selection: 1, colWidths: 2, sortCol: 'x' } }] },
        ['sheets[].state.selection', 'sheets[].state.colWidths']),
      { sheets: [{ id: 's', state: { sortCol: 'x' } }] },
    );
  });

  test('rekursiv über children', () => {
    const nodes = [{ id: 1, collapsed: true, children: [{ id: 2, collapsed: false, children: [] }] }];
    assertDeepEqual(stripPaths({ nodes }, ['nodes[]**.collapsed']),
      { nodes: [{ id: 1, children: [{ id: 2, children: [] }] }] });
  });

  test('fehlende Zwischenknoten und fremde Formen treffen nichts', () => {
    assertDeepEqual(stripPaths({ a: 1 }, ['b', 'c.d', 'e[].f']), { a: 1 });
    assertDeepEqual(stripPaths({ s: [{ state: null }] }, ['s[].state.selection']), { s: [{ state: null }] });
    const bulk = { risks: { $bulk: true, rowCount: 3 } };
    assertDeepEqual(stripPaths(bulk, ['risks[].collapsed']), bulk);
  });

  test('das Original bleibt unverändert und die Schlüsselfolge erhalten', () => {
    const json = { a: 1, ui: { tab: 'x', filter: 2 }, z: 3 };
    const copy = JSON.stringify(json);
    assertEqual(JSON.stringify(stripPaths(json, ['ui.tab'])), '{"a":1,"ui":{"filter":2},"z":3}');
    assertEqual(JSON.stringify(json), copy);
  });
});
