/**
 * D.Mike — Symbolauswahl im Diagramm-Editor: Beschriftungen kommen aus i18n.
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../../test-utils.js';
import { MARKER_SYMBOLS, markerSymbolOptions } from '../../../js/core/chart/chart-editor.js';
import de from '../../../i18n/de.json' with { type: 'json' };
import en from '../../../i18n/en.json' with { type: 'json' };

/** Translation lookup like the chart types build it: key under chart.editor.marker.*, fallback = key. */
function lookup(dict) {
  return (key) => {
    let node = dict.chart.editor.marker;
    for (const part of key.split('.')) node = node?.[part];
    return typeof node === 'string' ? node : key;
  };
}

suite('Diagramm-Editor — Symbolnamen', () => {
  test('deutsche Beschriftungen mit führendem Zeichen', () => {
    const opts = markerSymbolOptions(lookup(de));
    assertDeepEqual(opts.map((o) => o.value), MARKER_SYMBOLS.map((s) => s.value));
    const byValue = Object.fromEntries(opts.map((o) => [o.value, o.label]));
    assertEqual(byValue.circle, '● Kreis');
    assertEqual(byValue.square, '■ Quadrat');
    assertEqual(byValue.triangle, '▲ Dreieck');
  });

  test('jedes Symbol hat einen Schlüssel in de und en', () => {
    for (const { value } of MARKER_SYMBOLS) {
      assertTrue(typeof de.chart.editor.marker.symbols?.[value] === 'string', `de: ${value}`);
      assertTrue(typeof en.chart.editor.marker.symbols?.[value] === 'string', `en: ${value}`);
    }
  });

  test('ohne Übersetzung bleibt die englische Bezeichnung', () => {
    const opts = markerSymbolOptions((key) => key);
    assertEqual(opts.find((o) => o.value === 'circle').label, '● Circle');
  });
});
