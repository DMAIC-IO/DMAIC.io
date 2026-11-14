/**
 * Tests for js/modules/doe-planner/domain/signatures.js.
 */
import { suite, test, assertEqual, assertTrue } from '../../test-utils.js';
import { configSignature, designSignature } from '../../../js/modules/doe-planner/domain/signatures.js';

/** @returns {any} a planner model with a design */
function model(over = {}) {
  return {
    designType: 'full',
    factors: [
      { id: 1, name: 'A', unit: 'mm', kind: 'continuous', levels: ['1', '2'] },
      { id: 2, name: 'B', unit: '', kind: 'continuous', levels: ['10', '20'] },
    ],
    responses: [{ name: 'Y', unit: '%' }],
    options: {
      randomize: true, centerPoints: false, replicates: 1, alphaType: 'rotatable', ccdCenterPoints: 3,
      bbCenterPoints: 3, taguchiArray: '', optimalRuns: 0, optimalActiveTerms: null, forbiddenVertices: [],
    },
    selectedRes: null,
    selectedPBIdx: null,
    sourceWorksheet: null,
    seed: 0,
    design: {
      designType: 'full',
      codedMatrix: [[-1, -1], [1, -1], [-1, 1], [1, 1]],
      actualMatrix: [['1', '10'], ['2', '10'], ['1', '20'], ['2', '20']],
    },
    ...over,
  };
}

/** @param {any} m @returns {any} m with the first response renamed */
const renamed = (m) => ({ ...m, responses: [{ name: 'Z', unit: '%' }] });

suite('doe-planner domain — signatures', () => {
  test('Zielgröße umbenennen ändert designSignature nicht', () => {
    const m = model();
    assertEqual(designSignature(renamed(m)), designSignature(m));
    assertEqual(designSignature(model({ responses: [] })), designSignature(m));
  });

  test('designSignature folgt Plan und Faktoren', () => {
    const m = model();
    assertTrue(designSignature(m) !== null);
    assertEqual(designSignature(model({ design: null })), null);
    const otherLevels = model({ factors: [{ ...m.factors[0], levels: ['1', '3'] }, m.factors[1]] });
    assertTrue(designSignature(otherLevels) !== designSignature(m));
    const otherMatrix = model({ design: { ...m.design, codedMatrix: [[1, 1], [1, -1], [-1, 1], [-1, -1]] } });
    assertTrue(designSignature(otherMatrix) !== designSignature(m));
  });

  test('Zielgröße umbenennen ändert configSignature nur bei optimalem Plan mit Quelle', () => {
    const plain = model();
    assertEqual(configSignature(renamed(plain)), configSignature(plain));
    const optimal = model({ designType: 'dopt' });
    assertEqual(configSignature(renamed(optimal)), configSignature(optimal));
    const source = model({ designType: 'dopt', sourceWorksheet: { instanceId: 'ws', sheetId: 'sheet_1' } });
    assertTrue(configSignature(renamed(source)) !== configSignature(source));
    const fullSource = model({ sourceWorksheet: { instanceId: 'ws', sheetId: 'sheet_1' } });
    assertEqual(configSignature(renamed(fullSource)), configSignature(fullSource));
  });

  test('ein leerer neuer Faktor ändert configSignature nicht', () => {
    const m = model();
    const blank = { id: 3, name: '', unit: '', kind: 'continuous', levels: ['', ''] };
    assertEqual(configSignature({ ...m, factors: [...m.factors, blank] }), configSignature(m));
    assertTrue(configSignature({ ...m, factors: [...m.factors, { ...blank, name: 'C' }] }) !== configSignature(m));
  });

  test('seed ändert configSignature', () => {
    assertTrue(configSignature(model({ seed: 7 })) !== configSignature(model()));
  });
});
