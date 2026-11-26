/**
 * Tests for modules/triz-sufield/domain/standards.js — Form der Tabelle der
 * 78 Standardlösungen (ids, Klassen, Gruppen, Reihenfolge), Gruppierung je
 * Klasse, Einfrieren, Gleichheit mit der früheren Quelldatei
 * `data/standards.json` und eine Prüfsumme über die ganze Tabelle.
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../../test-utils.js';
import { cyrb53 } from '../../../js/core/hash.js';
import {
  STANDARDS, STANDARD_IDS, CLASS_NUMBERS, STANDARD_CLASSES,
} from '../../../js/modules/triz-sufield/domain/standards.js';

const plain = (v) => JSON.parse(JSON.stringify(v));

suite('triz-sufield Standardlösungen — Form', () => {
  test('78 Einträge mit genau id, class, group', () => {
    assertEqual(STANDARDS.length, 78);
    for (const s of STANDARDS) assertDeepEqual(Object.keys(s), ['id', 'class', 'group'], s.id);
  });
  test('ids eindeutig und dreiteilig, group und class aus der id', () => {
    assertEqual(new Set(STANDARDS.map((s) => s.id)).size, 78);
    for (const s of STANDARDS) {
      assertTrue(/^[1-5]\.\d+\.\d+$/.test(s.id), s.id);
      const [c, g] = s.id.split('.');
      assertEqual(s.class, Number(c), s.id);
      assertEqual(s.group, `${c}.${g}`, s.id);
    }
  });
  test('ids aufsteigend nach Klasse, Gruppe und Nummer', () => {
    const key = (id) => id.split('.').map(Number);
    for (let i = 1; i < STANDARDS.length; i++) {
      const [a, b] = [key(STANDARDS[i - 1].id), key(STANDARDS[i].id)];
      const cmp = a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
      assertTrue(cmp < 0, `${STANDARDS[i - 1].id} vor ${STANDARDS[i].id}`);
    }
  });
  test('18 Gruppen, erster und letzter Eintrag', () => {
    assertEqual(new Set(STANDARDS.map((s) => s.group)).size, 18);
    assertDeepEqual(plain(STANDARDS[0]), { id: '1.1.1', class: 1, group: '1.1' });
    assertDeepEqual(plain(STANDARDS[77]), { id: '5.5.3', class: 5, group: '5.5' });
  });
  test('STANDARD_IDS sind die ids in Tabellenreihenfolge', () => {
    assertDeepEqual([...STANDARD_IDS], STANDARDS.map((s) => s.id));
    assertTrue(STANDARD_IDS.includes('2.2.5'));
  });
});

suite('triz-sufield Standardlösungen — Klassen', () => {
  test('CLASS_NUMBERS 1 bis 5', () => {
    assertDeepEqual([...CLASS_NUMBERS], [1, 2, 3, 4, 5]);
  });
  test('STANDARD_CLASSES je Klasse vollständig, 13, 25, 6, 17, 17 Einträge', () => {
    assertDeepEqual(STANDARD_CLASSES.map((g) => g.cls), [1, 2, 3, 4, 5]);
    assertDeepEqual(STANDARD_CLASSES.map((g) => g.standards.length), [13, 25, 6, 17, 17]);
    for (const g of STANDARD_CLASSES) {
      assertDeepEqual(Object.keys(g), ['cls', 'standards']);
      assertTrue(g.standards.every((s) => s.class === g.cls), `Klasse ${g.cls}`);
    }
    assertDeepEqual(STANDARD_CLASSES.flatMap((g) => g.standards), [...STANDARDS]);
  });
  test('die Einträge der Klassen sind dieselben Objekte wie in der Tabelle', () => {
    assertTrue(STANDARD_CLASSES[1].standards[0] === STANDARDS[13]);
  });
});

suite('triz-sufield Standardlösungen — eingefroren', () => {
  test('Tabelle, Einträge, ids, Klassen und ihre Listen', () => {
    assertTrue(Object.isFrozen(STANDARDS));
    assertTrue(STANDARDS.every((s) => Object.isFrozen(s)));
    assertTrue(Object.isFrozen(STANDARD_IDS));
    assertTrue(Object.isFrozen(CLASS_NUMBERS));
    assertTrue(Object.isFrozen(STANDARD_CLASSES));
    assertTrue(STANDARD_CLASSES.every((g) => Object.isFrozen(g) && Object.isFrozen(g.standards)));
  });
});

suite('triz-sufield Standardlösungen — Quelldatei und Prüfsumme', () => {
  test('gleich data/standards.json in id, class, group und Reihenfolge', async () => {
    const url = new URL('../../../js/modules/triz-sufield/data/standards.json', import.meta.url);
    const res = await fetch(url, { cache: 'no-cache' });
    assertTrue(res.ok, `could not fetch standards.json: HTTP ${res.status}`);
    const { standards } = await res.json();
    assertEqual(JSON.stringify(STANDARDS), JSON.stringify(standards.map((s) => ({ id: s.id, class: s.class, group: s.group }))));
  });
  test('cyrb53 über JSON der Tabelle', () => {
    assertEqual(cyrb53(JSON.stringify(STANDARDS)), 4855512947701641);
  });
});
