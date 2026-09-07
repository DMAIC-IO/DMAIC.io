/**
 * Tests für Workspace.getInstancesByModuleId — deterministische Auflösung
 * einer Modulinstanz, unabhängig davon, welche Kachel gerade aktiv ist.
 */
import { suite, test, assertEqual } from '../test-utils.js';
import { Workspace } from '../../js/ui/workspace.js';

/** Minimaler Workspace ohne DOM: nur die Instanzverwaltung wird geprüft. */
function makeWorkspace() {
  const ws = Object.create(Workspace.prototype);
  ws._instances = new Map();
  return ws;
}

suite('workspace instances', () => {
  test('getInstancesByModuleId liefert alle Instanzen des Typs in Einfügereihenfolge', () => {
    const ws = makeWorkspace();
    const a = { id: 'worksheet', tag: 'a' };
    const b = { id: 'sipoc', tag: 'b' };
    const c = { id: 'worksheet', tag: 'c' };
    ws._instances.set('i1', a);
    ws._instances.set('i2', b);
    ws._instances.set('i3', c);
    assertEqual(ws.getInstancesByModuleId('worksheet').map(i => i.tag).join(','), 'a,c');
  });

  test('getInstancesByModuleId liefert ein leeres Array, wenn der Typ fehlt', () => {
    const ws = makeWorkspace();
    assertEqual(ws.getInstancesByModuleId('worksheet').length, 0);
  });
});
