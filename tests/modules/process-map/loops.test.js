/**
 * Process Map Loop-Bänder: Schienen, Durchlässe, Pfeilspitzen, Ziel-Auswahl.
 */
import { suite, test, assertEqual, assertDeepEqual } from '../../test-utils.js';
import {
  loopRailCells, loopPassColumns, loopArrowColumns, loopTargetOptions, loopLanes, isTargetBefore, stepNumber,
} from '../../../js/modules/process-map/domain/loops.js';

suite('Process Map Loops — loopRailCells()', () => {
  test('Ziel, Spanne und Quelle über die Spalten dazwischen', () => {
    assertDeepEqual(loopRailCells(6, 5, 1), ['', 'target', 'span', 'span', 'span', 'source']);
  });
  test('benachbartes Ziel ohne Spanne', () => {
    assertDeepEqual(loopRailCells(3, 1, 0), ['target', 'source', '']);
  });
  test('ohne Ziel bleibt die Schiene an der Quelle offen', () => {
    assertDeepEqual(loopRailCells(3, 1, -1), ['', 'source-open', '']);
  });
  test('ein Ziel an oder hinter der Quelle zählt als kein Ziel', () => {
    assertDeepEqual(loopRailCells(4, 1, 1), ['', 'source-open', '', '']);
    assertDeepEqual(loopRailCells(4, 1, 3), ['', 'source-open', '', '']);
  });
  test('Loop am ersten Schritt', () => {
    assertDeepEqual(loopRailCells(1, 0, -1), ['source-open']);
  });
  test('eine Quelle außerhalb der Tabelle ergibt leere Zellen', () => {
    assertDeepEqual(loopRailCells(2, 5, 0), ['', '']);
  });
});

suite('Process Map Loops — loopPassColumns()', () => {
  test('ein einzelnes Band lässt nichts durch', () => {
    assertDeepEqual(loopPassColumns(4, [{ sourceIdx: 3, targetIdx: 0 }]), [[]]);
  });
  test('das obere Band lässt Ziel und Quelle des unteren durch', () => {
    assertDeepEqual(loopPassColumns(5, [{ sourceIdx: 2, targetIdx: 0 }, { sourceIdx: 4, targetIdx: 1 }]), [[1, 4], []]);
  });
  test('das oberste Band sammelt die Senkrechten aller tieferen, ohne Doppelte', () => {
    const lanes = [{ sourceIdx: 1, targetIdx: 0 }, { sourceIdx: 3, targetIdx: 0 }, { sourceIdx: 4, targetIdx: -1 }];
    assertDeepEqual(loopPassColumns(5, lanes), [[0, 3, 4], [4], []]);
  });
  test('eine offene Schiene steigt nur an der Quelle auf', () => {
    assertDeepEqual(loopPassColumns(3, [{ sourceIdx: 1, targetIdx: 0 }, { sourceIdx: 2, targetIdx: 2 }]), [[2], []]);
  });
});

suite('Process Map Loops — loopArrowColumns()', () => {
  test('eine Pfeilspitze je verschiedenem gültigem Ziel', () => {
    const lanes = [
      { sourceIdx: 1, targetIdx: 0 }, { sourceIdx: 3, targetIdx: 0 },
      { sourceIdx: 4, targetIdx: 2 }, { sourceIdx: 5, targetIdx: -1 },
    ];
    assertDeepEqual(loopArrowColumns(6, lanes), [0, 2]);
  });
  test('ohne Loops keine Pfeilspitzen', () => {
    assertDeepEqual(loopArrowColumns(3, []), []);
  });
});

suite('Process Map Loops — Ziel-Auswahl und Bänder', () => {
  const steps = [
    { id: 'a', title: 'Annehmen', loop: null },
    { id: 'b', title: '', loop: null },
    { id: 'c', title: 'Backen', loop: { targetStepId: 'a' } },
    { id: 'd', title: 'Liefern', loop: { targetStepId: 'zz' } },
  ];

  test('loopTargetOptions: nur Schritte davor, „NN — Titel“, ohne Titel „<Schritt> NN“', () => {
    assertDeepEqual(loopTargetOptions(steps, 2, 'Schritt'), [
      { id: 'a', label: '01 — Annehmen' },
      { id: 'b', label: 'Schritt 02' },
    ]);
    assertDeepEqual(loopTargetOptions(steps, 0, 'Schritt'), []);
  });

  test('loopLanes: Bänder in Reihenfolge der Quellen, unbekanntes Ziel −1', () => {
    assertDeepEqual(loopLanes(steps).map(({ step, sourceIdx, targetIdx }) => [step.id, sourceIdx, targetIdx]),
      [['c', 2, 0], ['d', 3, -1]]);
  });

  test('isTargetBefore und stepNumber', () => {
    assertEqual(isTargetBefore(steps, 2, 'a'), true);
    assertEqual(isTargetBefore(steps, 2, 'c'), false);
    assertEqual(isTargetBefore(steps, 2, 'd'), false);
    assertEqual(isTargetBefore(steps, 2, null), false);
    assertEqual(stepNumber(0), '01');
    assertEqual(stepNumber(11), '12');
  });
});
