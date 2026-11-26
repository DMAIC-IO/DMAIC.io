/**
 * Tests for modules/voc-ctx-tree/domain/tree.js — Farbprüfung, Stufen der
 * Randstärke, Suche im Baum, ids, angezeigte Stimme, Zählung und
 * Tabellenzeilen; dazu die Unterscheidbarkeit der Vorgabefarben (Altfälle)
 * und die Gleichheit der Schema-Literale mit den Konstanten.
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../../test-utils.js';
import {
  VALID_TYPES, COLOR_KEYS, DEFAULT_COLORS, BORDER_WIDTHS, isColor, onBorderStep, nearestBorderStep,
  findVoc, findNeed, findDriver, allIds, effectiveActiveId, totalReqs, exportRows,
} from '../../../js/modules/voc-ctx-tree/domain/tree.js';
import { State } from '../../../js/modules/voc-ctx-tree/domain/model.js';

const req = (id, text, target = '', measure = '') => ({ id, text, target, measure });
const drv = (id, text, type, requirements = []) => ({ id, text, type, requirements });
const need = (id, text, drivers = []) => ({ id, text, drivers });
const voc = (id, text, source, needs = []) => ({ id, text, source, needs });

const TREE = [
  voc('v1', 'Kalt', 'Umfrage', [
    need('n1', 'Heiß', [drv('d1', 'Temperatur', 'ctq', [req('r1', '≥ 50 °C', '50', 'Thermometer'), req('r2', 'Box')])]),
    need('n2', 'Leer'),
  ]),
  voc('v2', 'Ohne', ''),
];

suite('voc-ctx-tree tree — Konstanten und Schema-Literale', () => {
  test('Arten, Farbschlüssel und Stufen', () => {
    assertDeepEqual([...VALID_TYPES], ['ctq', 'ctd', 'ctc']);
    assertDeepEqual([...COLOR_KEYS], Object.keys(DEFAULT_COLORS));
    assertDeepEqual([...BORDER_WIDTHS], [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4]);
  });
  test('Schema: Arten, Farbschlüssel, Vorgabefarben und Randstärke gleichen den Konstanten', () => {
    const { vocs, styles } = State.schema.fields;
    assertDeepEqual([...vocs.item.shape.needs.item.shape.drivers.item.shape.type.values], [...VALID_TYPES]);
    assertDeepEqual([...styles.shape.colors.keys], [...COLOR_KEYS]);
    assertDeepEqual(styles.shape.colors.default, { ...DEFAULT_COLORS });
    assertEqual(styles.shape.borderWidth.min, 0);
    assertEqual(styles.shape.borderWidth.max, 4);
    assertEqual(styles.shape.borderWidth.default, 1);
    assertDeepEqual([...State.schema.commands.reorderNodes.params.kind.values], ['need', 'driver', 'req']);
  });
});

suite('voc-ctx-tree tree — Farben und Randstärke', () => {
  test('isColor: rgb/rgba mit Kanälen bis 255 und Alpha bis 1, auch 1.00', () => {
    for (const c of ['rgb(0,0,0)', 'rgba(255,255,255,1)', 'rgba(1, 2, 3, 0.5)', 'rgba(1,2,3,1.00)', 'rgba(1,2,3,.25)']) {
      assertTrue(isColor(c), c);
    }
    for (const c of ['rgb(300,0,0)', '#336699', 'red', 'rgba(1,2,3,1.5)', '', null, 5, 'rgba(1,2,3)x']) {
      assertTrue(!isColor(c), String(c));
    }
  });
  test('Stufe und nächste Stufe', () => {
    assertTrue(onBorderStep(2.5));
    assertTrue(!onBorderStep(3.7));
    assertEqual(nearestBorderStep(3.7), 3.5);
    assertEqual(nearestBorderStep(-1), 0);
    assertEqual(nearestBorderStep(9), 4);
    assertEqual(nearestBorderStep(0.24), 0);
  });
});

suite('voc-ctx-tree tree — Suche und ids', () => {
  test('findVoc/Need/Driver', () => {
    assertEqual(findVoc(TREE, 'v2').text, 'Ohne');
    assertEqual(findNeed(TREE, 'v1', 'n2').text, 'Leer');
    assertEqual(findDriver(TREE, 'v1', 'n1', 'd1').text, 'Temperatur');
    assertEqual(findVoc(TREE, 'x'), undefined);
    assertEqual(findNeed(TREE, 'v2', 'n1'), undefined);
    assertEqual(findDriver(TREE, 'v1', 'n2', 'd1'), undefined);
  });
  test('allIds in Anzeigereihenfolge über vier Ebenen', () => {
    assertDeepEqual(allIds(TREE), ['v1', 'n1', 'd1', 'r1', 'r2', 'n2', 'v2']);
  });
  test('effectiveActiveId: bekannte id, sonst erste Stimme, ohne Stimmen null', () => {
    assertEqual(effectiveActiveId(TREE, 'v2'), 'v2');
    assertEqual(effectiveActiveId(TREE, 'x'), 'v1');
    assertEqual(effectiveActiveId(TREE, null), 'v1');
    assertEqual(effectiveActiveId([], 'v1'), null);
  });
  test('totalReqs zählt alle Anforderungen einer Stimme', () => {
    assertEqual(totalReqs(TREE[0]), 2);
    assertEqual(totalReqs(TREE[1]), 0);
  });
});

suite('voc-ctx-tree tree — Tabellenzeilen (Altfälle getExportRows)', () => {
  test('Stimme ohne Bedürfnisse → eine Zeile mit leeren Zellen', () => {
    assertDeepEqual(exportRows([voc('a', 'A', 'S')]), [['A', 'S', '', '', '', '', '', '']]);
  });
  test('Bedürfnis ohne Treiber → Zeile bis zum Bedürfnis', () => {
    assertDeepEqual(exportRows([voc('a', 'A', '', [need('n', 'N')])]), [['A', '', 'N', '', '', '', '', '']]);
  });
  test('volle Kette → eine Zeile je Anforderung, Art in Großbuchstaben', () => {
    assertDeepEqual(exportRows([TREE[0]]), [
      ['Kalt', 'Umfrage', 'Heiß', 'CTQ', 'Temperatur', '≥ 50 °C', '50', 'Thermometer'],
      ['Kalt', 'Umfrage', 'Heiß', 'CTQ', 'Temperatur', 'Box', '', ''],
      ['Kalt', 'Umfrage', 'Leer', '', '', '', '', ''],
    ]);
  });
  test('Treiber ohne Anforderungen → Zeile bis zum Treiber', () => {
    assertDeepEqual(exportRows([voc('a', 'A', '', [need('n', 'N', [drv('d', 'D', 'ctc')])])]),
      [['A', '', 'N', 'CTC', 'D', '', '', '']]);
  });
});

suite('voc-ctx-tree tree — Vorgabefarben unterscheidbar (Altfälle)', () => {
  const rgb = (str) => str.match(/[\d.]+/g).slice(0, 3).map(Number);
  const hue = ([r, g, b]) => {
    r /= 255; g /= 255; b /= 255;
    const mx = Math.max(r, g, b);
    const mn = Math.min(r, g, b);
    const d = mx - mn;
    if (d === 0) return 0;
    let h;
    if (mx === r) h = 60 * (((g - b) / d) % 6);
    else if (mx === g) h = 60 * ((b - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
    return h < 0 ? h + 360 : h;
  };
  const hueDist = (a, b) => { const raw = Math.abs(a - b) % 360; return Math.min(raw, 360 - raw); };

  test('CTD und Anforderung liegen mindestens 30° auseinander', () => {
    assertTrue(hueDist(hue(rgb(DEFAULT_COLORS.ctd)), hue(rgb(DEFAULT_COLORS.req))) >= 30);
  });
  test('alle Vorgabefarben paarweise mindestens 25° auseinander', () => {
    const keys = Object.keys(DEFAULT_COLORS);
    for (let i = 0; i < keys.length; i++) {
      for (let j = i + 1; j < keys.length; j++) {
        const dist = hueDist(hue(rgb(DEFAULT_COLORS[keys[i]])), hue(rgb(DEFAULT_COLORS[keys[j]])));
        assertTrue(dist >= 25, `${keys[i]}/${keys[j]} ${dist}`);
      }
    }
  });
});
