import { suite, test, assertDeepEqual } from '../test-utils.js';
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

  test('diffEdits: geänderte Schlüssel, geleertes Textfeld entfällt, Reihen nach Name', () => {
    const before = { title: 'auto', showLegend: true, series: [{ name: 'A', fillColor: 'red', visible: true }] };
    const after = { title: '', showLegend: false, series: [{ name: 'A', fillColor: 'pink', visible: true }] };
    const { next, cleared } = diffEdits({ title: 'alt', barGap: 2 }, before, after, editable, new Set());
    assertDeepEqual(next, { barGap: 2, showLegend: false, series: [{ name: 'A', fillColor: 'pink' }] });
    assertDeepEqual(cleared, ['title']);
  });

  test('diffEdits: Reihen-Einstellungen überleben Umsortieren', () => {
    const prev = { series: [{ name: 'B', fillColor: 'green' }] };
    const before = { series: [{ name: 'A', visible: true }, { name: 'B', visible: true }] };
    const after = { series: [{ name: 'A', visible: false }, { name: 'B', visible: true }] };
    assertDeepEqual(diffEdits(prev, before, after, editable, new Set()).next,
      { series: [{ name: 'B', fillColor: 'green' }, { name: 'A', visible: false }] });
  });

  test('pickShown: nur bearbeitbare Schlüssel und die Reihen', () => {
    assertDeepEqual(pickShown({ title: 'T', values: [1], series: [{ name: 'A', fillColor: 'r', values: [1] }] }, editable),
      { title: 'T', series: [{ name: 'A', fillColor: 'r' }] });
  });
});
