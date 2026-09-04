/**
 * Layout-Primitive — drei semantische Klassen für die wiederkehrenden
 * Abstands-Muster. Bewusst keine Utility-Skala: die Einheitlichkeit
 * entsteht aus dem Stylelint-Guard, nicht aus der Klassenmenge.
 */
import { suite, test, assertEqual, afterEach } from '../test-utils.js';

let host;

/** Baut einen Container mit drei Kindern und hängt ihn ins Dokument. */
function mount(classNames) {
  host = document.createElement('div');
  host.className = classNames;
  for (let i = 0; i < 3; i += 1) {
    const child = document.createElement('div');
    child.textContent = `Kind ${i}`;
    host.appendChild(child);
  }
  document.body.appendChild(host);
  return host;
}

suite('Layout-Primitive', () => {
  afterEach(() => {
    if (host) { host.remove(); host = null; }
  });

  test('dmike-stack setzt margin-top auf jedem Kind außer dem ersten', () => {
    const el = mount('dmike-stack dmike-stack--m');
    const kids = [...el.children];
    assertEqual(getComputedStyle(kids[0]).marginTop, '0px');
    assertEqual(getComputedStyle(kids[1]).marginTop, '12px');
    assertEqual(getComputedStyle(kids[2]).marginTop, '12px');
  });

  test('dmike-stack trägt den Abstand oben, nicht unten', () => {
    // Das ist der Kern: ein trailing margin-bottom würde vom Scroll-Container
    // verschluckt (Roadmap-Eintrag „.dmike-split verschluckt den unteren
    // Abstand"). Mit margin-top gibt es ihn gar nicht erst.
    //
    // Beide Hälften gehören zusammen: margin-bottom allein wäre auch ohne das
    // Primitiv 0px — Browser-Default und der Reset des Test-Runners liefern
    // das ohnehin — und würde damit gar nichts zusichern.
    const el = mount('dmike-stack dmike-stack--l');
    const cs = getComputedStyle(el.lastElementChild);
    assertEqual(cs.marginTop, '24px');
    assertEqual(cs.marginBottom, '0px');
  });

  test('dmike-cluster setzt gap und bricht um', () => {
    const el = mount('dmike-cluster dmike-cluster--sm');
    const cs = getComputedStyle(el);
    assertEqual(cs.display, 'flex');
    assertEqual(cs.flexWrap, 'wrap');
    assertEqual(cs.rowGap, '8px');
    assertEqual(cs.columnGap, '8px');
  });

  test('dmike-row setzt gap und zentriert vertikal, ohne umzubrechen', () => {
    const el = mount('dmike-row dmike-row--s');
    const cs = getComputedStyle(el);
    assertEqual(cs.display, 'flex');
    assertEqual(cs.alignItems, 'center');
    assertEqual(cs.columnGap, '6px');
    assertEqual(cs.flexWrap, 'nowrap');
  });

  test('ohne Modifier gilt der mittlere Standardabstand', () => {
    const el = mount('dmike-cluster');
    assertEqual(getComputedStyle(el).columnGap, '12px');
  });

  test('alle fünf Modifier decken die vorgesehenen Stufen ab', () => {
    const erwartet = { s: '6px', sm: '8px', m: '12px', ml: '16px', l: '24px' };
    for (const [mod, px] of Object.entries(erwartet)) {
      const el = mount(`dmike-cluster dmike-cluster--${mod}`);
      assertEqual(getComputedStyle(el).columnGap, px);
      el.remove();
    }
    host = null;
  });
});
