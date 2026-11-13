/**
 * Tests for modules/project-charter/io/export.js — Organigramm als
 * node-diagram-Konfiguration und der daraus gezeichnete SVG-Text.
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../../test-utils.js';
import { orgExportConfig } from '../../../js/modules/project-charter/io/export.js';
import ChartManager from '../../../js/core/chart/chart-manager.js';

const n = (id, title, pid = null, extra = {}) => ({ id, title, desc: `${title} Beschreibung`, pid, ...extra });
const PIZZA = [
  n('n1', 'Geschäftsführung'), n('n2', 'Projektleitung', 'n1'), n('n3', 'Filialleiter', 'n2'),
  n('n4', 'Küche', 'n3'), n('n5', 'Bestellannahme', 'n3'), n('n6', 'Fahrer', 'n3'), n('n7', 'Controlling', 'n2'),
];
const STYLE = { nodeBg: '', nodeBorderColor: '', nodeBorderStyle: 'solid', nodeBorderWidth: 1, lineColor: '', lineStyle: 'solid', lineWidth: 2 };
const cssVars = (map) => {
  const cs = getComputedStyle(document.documentElement);
  return Object.fromEntries(Object.entries(map).map(([k, v]) => [k, cs.getPropertyValue(v).trim()]));
};
const i18n = { language: 'de', t: (k) => k };

suite('project-charter export', () => {
  test('alle Knoten, ein Link je Nichtwurzel, Padding 30', () => {
    const cfg = orgExportConfig({ orgChart: PIZZA, orgStyle: STYLE }, { heights: new Map(), cssVars });
    assertEqual(cfg.nodes.length, PIZZA.length);
    assertEqual(cfg.links.length, PIZZA.length - 1);
    assertEqual(cfg.padding, 30);
    assertDeepEqual(cfg.nodes.map((x) => x.id), PIZZA.map((x) => x.id));
  });

  test('eingeklappte Knoten: Nachfahren fehlen im Bild', () => {
    const cfg = orgExportConfig({ orgChart: PIZZA, orgStyle: STYLE }, { heights: {}, cssVars, collapsed: ['n3'] });
    assertDeepEqual(cfg.nodes.map((x) => x.id), ['n1', 'n2', 'n3', 'n7']);
    assertEqual(cfg.links.length, 3);
  });

  test('Stil: Knoten überschreibt globalen Stil; ungesetzte Schlüssel fehlen', () => {
    const nodes = [n('a', 'A', null, { bg: 'rgb(1, 2, 3)', borderWidth: 4, borderStyle: 'dashed' }), n('b', 'B', 'a')];
    const style = { ...STYLE, nodeBg: 'rgb(9, 9, 9)', lineStyle: 'dotted', lineWidth: 3 };
    const cfg = orgExportConfig({ orgChart: nodes, orgStyle: style }, { heights: { a: 80 }, cssVars: () => ({}) });
    const [a, b] = cfg.nodes;
    assertEqual(a.fill, 'rgb(1, 2, 3)');
    assertEqual(a.strokeWidth, 4);
    assertEqual(a.dash, '8 4');
    assertEqual(a.h, 80);
    assertEqual(b.fill, 'rgb(9, 9, 9)');
    assertEqual(b.strokeWidth, 1);
    assertTrue(!('dash' in b), 'solid: kein dash-Schlüssel');
    assertTrue(!('stroke' in b), 'ohne Farbe kein stroke-Schlüssel');
    assertEqual(cfg.links[0].width, 3);
    assertEqual(cfg.links[0].dash, '2 4');
    assertTrue(Object.values(cfg).every((v) => v !== undefined));
    assertTrue(cfg.nodes.every((x) => Object.values(x).every((v) => v !== undefined)));
    assertTrue(cfg.links.every((x) => Object.values(x).every((v) => v !== undefined)));
  });

  test('chartSVG enthält jeden Titel, keine var(', async () => {
    const cfg = orgExportConfig({ orgChart: PIZZA, orgStyle: STYLE }, { heights: new Map(), cssVars });
    const svg = await new ChartManager({ on() {} }, i18n).renderSVG('node-diagram', cfg);
    for (const node of PIZZA) assertTrue(svg.includes(node.title), `Titel ${node.title}`);
    assertTrue(!svg.includes('var('), 'keine var( im SVG');
  });

  test('leeres Organigramm: keine Knoten, keine Links', () => {
    const cfg = orgExportConfig({ orgChart: [], orgStyle: STYLE }, { heights: new Map(), cssVars });
    assertEqual(cfg.nodes.length, 0);
    assertEqual(cfg.links.length, 0);
  });
});
