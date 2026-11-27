/**
 * Activity-Flowchart: Geste `flow` (interaction/gestures.js) — Positionen aus
 * Zeiger und Tastatur, `clamp`, beide Ziele in `toCommand`, Ansage. Ohne DOM:
 * Griff, Verbinder und Bandzeilen sind Attrappen mit Rechteck und `dataset`.
 */
import { suite, test, assertEqual, assertDeepEqual } from '../../test-utils.js';
import { flow, substeps } from '../../../js/modules/activity-flowchart/interaction/gestures.js';

const a = (id, branchId = 'main') => ({ id, kind: 'activity', branchId, decision: null });
const d = (id, branchId = 'main', label = '') => ({ id, kind: 'decision', branchId, decision: { label, noTarget: 'end' } });

/** Viewmodel-Attrappe: a · D [x · E [e1]] · b · F; `this` aller Callbacks. */
function host() {
  return {
    model: { steps: [a('a'), d('D', 'main', 'Frei?'), a('x', 'no:D'), d('E', 'no:D'), a('e1', 'no:E'), a('b'), d('F')] },
    state: { flowPreview: null },
  };
}

/** Element-Attrappe mit Rechteck. */
const box = (left, top, width, height, dataset) => ({
  dataset,
  getBoundingClientRect: () => ({ left, top, right: left + width, bottom: top + height }),
});

/** Wurzel mit zwei Verbindern und drei Bandzeilen. */
function root() {
  const gaps = [box(100, 0, 20, 20, { gap: '1' }), box(400, 0, 20, 20, { gap: '6' })];
  const lanes = [box(0, 0, 1000, 100, { bandId: 'main' }), box(0, 100, 1000, 100, { bandId: 'no:D' }),
    box(0, 200, 1000, 100, { bandId: 'no:E' })];
  return { querySelectorAll: (sel) => (sel === '[data-gap]' ? gaps : sel.startsWith('.af__lane') ? lanes : []) };
}

const T = (key, p) => (key === 'gestureBand' ? `Band ${p.band}`
  : key === 'common.gesture.position' ? `Position ${p.pos} von ${p.total}`
    : ({ mainPath: 'Hauptpfad', unnamedDecision: '(ohne Frage)', bandLabel: `Nein: ${p?.q}` })[key] ?? key);

suite('Activity-Flowchart Geste flow', () => {
  test('Art move, Griff .af__grip; Unterschritte am Griff .fc-substep-grip', () => {
    assertEqual(flow.kind, 'move');
    assertEqual(flow.handle, '.af__grip');
    assertEqual(substeps.handle, '.fc-substep-grip');
  });

  test('start liest id, Kettenindex und Band an der Karte', () => {
    const card = { dataset: { stepId: 'x', stepIndex: '2', bandId: 'no:D' } };
    const grip = { closest: () => card };
    assertDeepEqual(flow.start(grip), { id: 'x', index: 2, band: 'no:D' });
  });

  test('locate: Verbinder → Endindex, Band bleibt; Bandzeile (auch über Karte) → Band, Stelle bleibt; sonst null', () => {
    const h = host();
    const from = { id: 'b', index: 5, band: 'main' };
    assertDeepEqual(flow.locate.call(h, { x: 110, y: 10 }, { root: root() }, from), { id: 'b', index: 1, band: 'main' });
    assertDeepEqual(flow.locate.call(h, { x: 600, y: 150 }, { root: root() }, from), { id: 'b', index: 5, band: 'no:D' });
    assertEqual(flow.locate.call(h, { x: 600, y: 900 }, { root: root() }, from), null);
    // Raute D zieht ihren Block: Lücke 6 hinter dem Block (1…4) → Endindex 2.
    assertDeepEqual(flow.locate.call(h, { x: 405, y: 5 }, { root: root() }, { id: 'D', index: 1, band: 'main' }),
      { id: 'D', index: 2, band: 'main' });
  });

  test('step: ←/→ Stelle ±1 mit Band des Ausgangs, Rand → null', () => {
    const h = host();
    const from = { id: 'b', index: 5, band: 'main' };
    assertDeepEqual(flow.step.call(h, from, { x: -1, y: 0 }, {}, from), { id: 'b', index: 4, band: 'main' });
    assertDeepEqual(flow.step.call(h, { ...from, band: 'no:D' }, { x: 1, y: 0 }, {}, from), { id: 'b', index: 6, band: 'main' });
    assertEqual(flow.step.call(h, { ...from, index: 6 }, { x: 1, y: 0 }, {}, from), null);
    const dFrom = { id: 'D', index: 1, band: 'main' };
    assertEqual(flow.step.call(h, { ...dFrom, index: 3 }, { x: 1, y: 0 }, {}, dFrom), null, 'Block: höchstens n − 4');
    assertEqual(flow.step.call(h, { ...dFrom, index: 0 }, { x: -1, y: 0 }, {}, dFrom), null);
  });

  test('step: ↑/↓ nächstes gültiges Band in Zeilenfolge, Stelle zurück; ungültige übersprungen', () => {
    const h = host();
    // b (Index 5): gültig main, no:D, no:E; Zeilen main, no:D, no:E, no:F.
    const from = { id: 'b', index: 5, band: 'main' };
    assertDeepEqual(flow.step.call(h, from, { x: 0, y: 1 }, {}, from), { id: 'b', index: 5, band: 'no:D' });
    assertDeepEqual(flow.step.call(h, { id: 'b', index: 4, band: 'no:E' }, { x: 0, y: 1 }, {}, from), null, 'no:F steht hinter b');
    assertDeepEqual(flow.step.call(h, { id: 'b', index: 4, band: 'no:E' }, { x: 0, y: -1 }, {}, from), { id: 'b', index: 5, band: 'no:D' });
    assertEqual(flow.step.call(h, from, { x: 0, y: -1 }, {}, from), null);
    // a (Index 0) hat nur den Hauptpfad.
    const af = { id: 'a', index: 0, band: 'main' };
    assertEqual(flow.step.call(h, af, { x: 0, y: 1 }, {}, af), null);
  });

  test('clamp: Stelle in 0…n − Block, ungültiges Band → null', () => {
    const h = host();
    const from = { id: 'D', index: 1, band: 'main' };
    assertDeepEqual(flow.clamp.call(h, { ...from, index: 9 }, {}, from), { id: 'D', index: 3, band: 'main' });
    assertDeepEqual(flow.clamp.call(h, { ...from, index: -2 }, {}, from), { id: 'D', index: 0, band: 'main' });
    assertEqual(flow.clamp.call(h, { ...from, band: 'no:D' }, {}, from), null, 'eigenes Band');
    const a0 = { id: 'a', index: 0, band: 'main' };
    assertEqual(flow.clamp.call(h, { ...a0, band: 'no:D' }, {}, a0), null, 'Raute hinter dem Schritt');
  });

  test('preview schreibt state.flowPreview', () => {
    const h = host();
    flow.preview.call(h, { id: 'b', index: 2, band: 'main' });
    assertDeepEqual(h.state.flowPreview, { id: 'b', index: 2, band: 'main' });
    flow.preview.call(h, null);
    assertEqual(h.state.flowPreview, null);
  });

  test('toCommand: Stelle → moveStep, Band → setStepBand', () => {
    const from = { id: 'b', index: 5, band: 'main' };
    assertDeepEqual(flow.toCommand(from, { ...from, index: 1 }), ['moveStep', { id: 'b', index: 1 }]);
    assertDeepEqual(flow.toCommand(from, { ...from, band: 'no:D' }), ['setStepBand', { stepId: 'b', bandId: 'no:D' }]);
  });

  test('announce: Bandname bzw. Position unter den möglichen Stellen', () => {
    const h = host();
    const from = { id: 'b', index: 5, band: 'main' };
    assertEqual(flow.announce.call(h, { ...from, band: 'no:D' }, T, {}, from), 'Band Nein: Frei?');
    assertEqual(flow.announce.call(h, { ...from, index: 2 }, T, {}, from), 'Position 3 von 7');
    const dFrom = { id: 'D', index: 1, band: 'main' };
    assertEqual(flow.announce.call(h, dFrom, T, {}, dFrom), 'Position 2 von 4');
  });
});
