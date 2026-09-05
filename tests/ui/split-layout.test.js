/**
 * Split-Layout — Außenabstände und Spaltenbreiten.
 * Genau ein Knoten hält den Modul-Außenabstand: .module-container.
 * Alles darunter steht auf 0; der Spaltenzwischenraum kommt aus gap.
 */
import { suite, test, assertEqual, afterEach } from '../test-utils.js';

let host;

/** Baut die Container/Split/Input/Output-Kette und hängt sie ins Dokument. */
function mountSplit(splitClasses = 'dmike-split') {
  host = document.createElement('div');
  host.className = 'module-container';
  const split = document.createElement('div');
  split.className = splitClasses;
  const input = document.createElement('div');
  input.className = 'dmike-split__input';
  const output = document.createElement('div');
  output.className = 'dmike-split__output';
  split.append(input, output);
  host.appendChild(split);
  document.body.appendChild(host);
  return { host, split, input, output };
}

suite('Split-Layout — Außenabstände', () => {
  afterEach(() => {
    if (host) { host.remove(); host = null; }
  });

  test('der Modul-Container ist der einzige Besitzer des Außenabstands', () => {
    const { host: container } = mountSplit();
    const cs = getComputedStyle(container);
    assertEqual(cs.paddingTop, '12px');
    assertEqual(cs.paddingRight, '12px');
    assertEqual(cs.paddingBottom, '12px');
    assertEqual(cs.paddingLeft, '12px');
  });

  test('ein Split im Container hat kein eigenes Polster, nur noch gap', () => {
    const { split } = mountSplit();
    const cs = getComputedStyle(split);
    assertEqual(cs.paddingTop, '0px');
    assertEqual(cs.paddingRight, '0px');
    assertEqual(cs.paddingBottom, '0px');
    assertEqual(cs.paddingLeft, '0px');
    assertEqual(cs.columnGap, '12px');
  });

  test('ein Split ohne Container hält den Abstand selbst', () => {
    // 39 der 71 Module wurzeln direkt im Split und haben gar kein
    // .module-container — dort ist der Split der Besitzer, sonst stünde
    // das Modul bündig an der Kante der Arbeitsfläche.
    const split = document.createElement('div');
    split.className = 'dmike-split';
    document.body.appendChild(split);
    const cs = getComputedStyle(split);
    assertEqual(cs.paddingTop, '12px');
    assertEqual(cs.paddingLeft, '12px');
    split.remove();
  });

  test('das Input-Panel hat keinen Außenabstand, sein Innenpolster bleibt', () => {
    // Das Innenpolster gehört zur Panel-Optik (Hintergrund, Rahmen, Radius)
    // und bleibt deshalb erhalten.
    const { input } = mountSplit();
    const cs = getComputedStyle(input);
    assertEqual(cs.marginTop, '0px');
    assertEqual(cs.marginRight, '0px');
    assertEqual(cs.marginBottom, '0px');
    assertEqual(cs.marginLeft, '0px');
    assertEqual(cs.paddingTop, '12px');
  });

  test('das Output-Panel hat kein eigenes Polster', () => {
    const { output } = mountSplit();
    const cs = getComputedStyle(output);
    assertEqual(cs.paddingTop, '0px');
    assertEqual(cs.paddingLeft, '0px');
  });

  test('vom Modulrand bis zum ersten Inhalt sind es 12px', () => {
    // Regressionsschutz gegen erneutes Stapeln: früher 16 (container)
    // + 16 (split) + 8 (input-margin) = bis zu 40px.
    const { host: container, split } = mountSplit();
    const cPad = parseInt(getComputedStyle(container).paddingLeft, 10);
    const sPad = parseInt(getComputedStyle(split).paddingLeft, 10);
    assertEqual(cPad + sPad, 12);
  });
});
