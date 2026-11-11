/**
 * Tests for core/flowchart/substeps-view.js — die Glieder, die
 * substeps.view.part.html im view-Block eines Flowchart-Moduls erwartet.
 */
import { suite, test, assertEqual, assertDeepEqual } from '../../test-utils.js';
import { substepsView } from '../../../js/core/flowchart/substeps-view.js';

/** Ein Host wie `this` im view-Block: Model mit `expanded`, Modul-`t`. */
function host(expanded = ['s1'], substepPreview = null) {
  const block = substepsView();
  const h = Object.defineProperties({
    model: { expanded },
    state: { substepPreview },
    t: (key) => ({ substepsLabel: 'Detail-Schritte' })[key] ?? key,
  }, Object.getOwnPropertyDescriptors(block));
  return h;
}
const step = (id, n) => ({ id, substeps: Array.from({ length: n }, (_, i) => ({ id: `ss${i}`, title: '' })) });

suite('flowchart/substeps-view', () => {
  test('liefert genau die Glieder des Vertrags', () => {
    assertDeepEqual(Object.keys(substepsView()).sort(),
      ['ariaExpanded', 'expandArg', 'isExpanded', 'substepItemClass', 'substepNum', 'substepsBarClass', 'substepsBarLabel']);
  });

  test('aufgeklappt: isExpanded, Argument zum Zuklappen, aria-expanded', () => {
    const h = host(['s1']);
    assertEqual(h.isExpanded('s1'), true);
    assertEqual(h.expandArg('s1'), 'false');
    assertEqual(h.ariaExpanded('s1'), 'true');
  });

  test('zugeklappt: isExpanded, Argument zum Aufklappen, aria-expanded', () => {
    const h = host(['s1']);
    assertEqual(h.isExpanded('s2'), false);
    assertEqual(h.expandArg('s2'), 'true');
    assertEqual(h.ariaExpanded('s2'), 'false');
  });

  test('liest expanded beim Aufruf, nicht beim Bau', () => {
    const h = host([]);
    assertEqual(h.isExpanded('s1'), false);
    h.model.expanded = ['s1'];
    assertEqual(h.isExpanded('s1'), true);
  });

  test('Leiste: Beschriftung mit Anzahl, Klasse nur mit Unterschritten', () => {
    const h = host();
    assertEqual(h.substepsBarLabel(step('s1', 2)), 'Detail-Schritte (2)');
    assertEqual(h.substepsBarLabel(step('s1', 0)), 'Detail-Schritte');
    assertEqual(h.substepsBarClass(step('s1', 1)), 'fc-substeps-bar--has');
    assertEqual(h.substepsBarClass(step('s1', 0)), '');
  });

  test('Nummer des Unterschritts: Schritt.Unterschritt, ab 1', () => {
    const h = host();
    assertEqual(h.substepNum(0, 0), '1.1');
    assertEqual(h.substepNum(1, 2), '2.3');
  });

  test('Zielmarke der Geste: nur am Zielindex im eigenen Schritt, Linie in Zugrichtung', () => {
    const s = step('s1', 3);
    assertEqual(host(['s1'], null).substepItemClass(s, 1), '');
    const down = host(['s1'], { group: 's1', index: 2, id: 'ss0' });
    assertEqual(down.substepItemClass(s, 2), 'fc-substep-item--drop-after');
    assertEqual(down.substepItemClass(s, 1), '');
    assertEqual(down.substepItemClass(step('s2', 3), 2), '');
    assertEqual(host(['s1'], { group: 's1', index: 0, id: 'ss2' }).substepItemClass(s, 0), 'is-drop-target');
    assertEqual(host(['s1'], { group: 's1', index: 0, id: 'ss0' }).substepItemClass(s, 0), '');
  });
});
