/**
 * Tests for js/core/export-utils.js `tableToSVG` — das Bild von
 * `exportTableAsSVG` als SVG-Text ohne Download: Maße aus dem Deskriptor,
 * ein Textpfad je beschrifteter Zelle, Farben der Summenzellen aus dem
 * Deskriptor. Braucht DOM (Themenfarben) und lädt Schriften (Browser).
 */
import { suite, test, assertEqual, assertTrue } from '../test-utils.js';
import { tableToSVG } from '../../js/core/export-utils.js';

/**
 * `tableToSVG` lädt die Schriften relativ zum Dokument (`assets/fonts/…`);
 * der Testlauf liegt eine Ebene tiefer.
 * @template T @param {() => Promise<T>} fn @returns {Promise<T>}
 */
async function withAppFonts(fn) {
  const original = globalThis.fetch;
  globalThis.fetch = (url, opts) => original(typeof url === 'string' && url.startsWith('assets/') ? `../${url}` : url, opts);
  try { return await fn(); } finally { globalThis.fetch = original; }
}

const TD = {
  outputs: ['X', 'Y'],
  inputs: ['A', 'B'],
  weights: [10, 7],
  weightLabel: 'W',
  cells: [[9, ''], ['', 5]],
  rowSums: [90, 35],
  colSums: [90, 35],
  grandTotal: 125,
  rowSumLabel: 'R',
  colSumLabel: 'C',
  cellBg: (v, min) => (v === min ? 'rgba(0,0,255,1)' : 'rgba(255,0,0,1)'),
  cellFg: (v, min) => (v === min ? 'rgb(0,0,254)' : 'rgb(254,0,0)'),
};

suite('export-utils: tableToSVG', () => {
  test('Maße: Namensspalte, je Spalte 60, Summenspalte, Ränder; Gewichts-, Kopf-, Daten- und Fußzeile', async () => {
    const svg = await withAppFonts(() => tableToSVG(TD));
    assertTrue(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" width="372" height="292"'), svg.slice(0, 120));
    assertTrue(svg.endsWith('</svg>'));
  });
  test('ein Textpfad je Beschriftung und gefüllter Zelle, leere Zellen ohne', async () => {
    const svg = await withAppFonts(() => tableToSVG(TD));
    // W, 2 Gewichte, 2 Köpfe, R, 2 Namen, 2 Zellen, 2 Zeilensummen, C, 2 Spaltensummen, Gesamt.
    assertEqual((svg.match(/<g transform=/g) ?? []).length, 16);
  });
  test('Farben der Summenzellen aus dem Deskriptor', async () => {
    const svg = await withAppFonts(() => tableToSVG(TD));
    assertTrue(svg.includes('fill="rgb(255,0,0)"'), 'Fläche Maximum');
    assertTrue(svg.includes('fill="rgb(0,0,255)"'), 'Fläche Minimum');
    assertTrue(svg.includes('fill="rgb(254,0,0)"'), 'Schrift Maximum');
    assertTrue(svg.includes('fill="rgb(0,0,254)"'), 'Schrift Minimum');
  });
});
