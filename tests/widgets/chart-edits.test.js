import { suite, test, assertDeepEqual } from '../test-utils.js';
import { checkValue } from '../../js/core/model.js';
import { REF_LINE } from '../../js/widgets/chart-parts.js';
import { applyEdits, diffEdits, ownedKeys, pickShown } from '../../js/widgets/chart-edits.js';

const editable = { base: ['title', 'showLegend', 'refLines', 'barGap'], series: ['fillColor', 'visible'] };

suite('Editor-Einstellungen', () => {
  test('applyEdits: Basis überlagert, Reihen nach Name, vom Modul gesetzte refLines bleiben', () => {
    const cfg = { title: 'auto', refLines: [{ dir: 'h', value: 0 }], series: [{ name: 'A', fillColor: 'red' }, { name: 'B', fillColor: 'blue' }] };
    const edits = { title: 'Mein Titel', refLines: [], series: [{ name: 'B', fillColor: 'green' }, { name: 'Z', visible: false }] };
    const out = applyEdits(cfg, edits, editable, ownedKeys(cfg));
    assertDeepEqual(out.title, 'Mein Titel');
    assertDeepEqual(out.refLines, [{ dir: 'h', value: 0 }]);
    assertDeepEqual(out.series.map((s) => s.fillColor), ['red', 'green']);
  });

  test('applyEdits: Reihen sind Kopien, auch ohne Einstellung — Änderungen am Ergebnis erreichen die Konfiguration nicht', () => {
    const cfg = { series: [{ name: 'A', fillColor: 'red' }, { name: 'B', fillColor: 'blue' }] };
    const out = applyEdits(cfg, { series: [{ name: 'B', fillColor: 'green' }] }, editable, new Set());
    out.series[0].fillColor = 'pink';
    out.series[1].fillColor = 'pink';
    assertDeepEqual(cfg.series.map((s) => s.fillColor), ['red', 'blue']);
  });

  test('applyEdits: Reihen sind auch dann Kopien, wenn gar keine Reihen-Einstellungen gespeichert sind', () => {
    const cfg = { series: [{ name: 'A', showNormalCurve: true }] };
    const out = applyEdits(cfg, {}, editable, new Set());
    out.series[0].showNormalCurve = false;
    assertDeepEqual(cfg.series[0].showNormalCurve, true);
  });

  test('diffEdits: geänderte Schlüssel, geleertes Textfeld entfällt, Reihen nach Name', () => {
    const before = { title: 'auto', showLegend: true, series: [{ name: 'A', fillColor: 'red', visible: true }] };
    const after = { title: '', showLegend: false, series: [{ name: 'A', fillColor: 'pink', visible: true }] };
    const { next, cleared } = diffEdits({ title: 'alt', barGap: 2 }, before, after, editable, new Set());
    assertDeepEqual(next, { barGap: 2, showLegend: false, series: [{ name: 'A', fillColor: 'pink' }] });
    assertDeepEqual(cleared, ['title']);
  });

  test('diffEdits: eine Reihe, deren einziger Schlüssel der Name ist, wird nicht gespeichert', () => {
    const before = { series: [{ name: 'A', fillColor: 'red' }] };
    const after = { series: [{ name: 'A' }] };
    assertDeepEqual(diffEdits(null, before, after, editable, new Set()).next, {});
    const prev = { series: [{ name: 'A', fillColor: 'red' }] };
    assertDeepEqual(diffEdits(prev, before, after, editable, new Set()).next, {});
  });

  test('REF_LINE nimmt dash „dashdot“ an', () => {
    const line = { dir: 'h', value: 1, dash: 'dashdot' };
    assertDeepEqual(checkValue(REF_LINE, 'l', line), line);
  });

  test('diffEdits: Reihen-Einstellungen überleben Umsortieren', () => {
    const prev = { series: [{ name: 'B', fillColor: 'green' }] };
    const before = { series: [{ name: 'A', visible: true }, { name: 'B', visible: true }] };
    const after = { series: [{ name: 'A', visible: false }, { name: 'B', visible: true }] };
    assertDeepEqual(diffEdits(prev, before, after, editable, new Set()).next,
      { series: [{ name: 'B', fillColor: 'green' }, { name: 'A', visible: false }] });
  });

  test('diffEdits: Objekt-Schlüssel einer Reihe (Verbindungslinie) nach Inhalt verglichen', () => {
    const ed = { base: [], series: ['connectLine'] };
    const before = { series: [{ name: 'A', connectLine: { show: false, dash: 'solid', width: 2 } }] };
    const after = { series: [{ name: 'A', connectLine: { show: true, dash: 'dash', width: 2 } }] };
    assertDeepEqual(diffEdits(null, before, after, ed, new Set()).next,
      { series: [{ name: 'A', connectLine: { show: true, dash: 'dash', width: 2 } }] });
    const same = { series: [{ name: 'A', connectLine: { show: false, dash: 'solid', width: 2 } }] };
    assertDeepEqual(diffEdits(null, before, same, ed, new Set()).next, {});
  });

  test('pickShown: nur bearbeitbare Schlüssel und die Reihen', () => {
    assertDeepEqual(pickShown({ title: 'T', values: [1], series: [{ name: 'A', fillColor: 'r', values: [1] }] }, editable),
      { title: 'T', series: [{ name: 'A', fillColor: 'r' }] });
  });
});
