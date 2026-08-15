/**
 * Tests for js/core/flowchart/flowchart-model.js — chain-core state.
 */
import { suite, test, assertEqual } from '../test-utils.js';
import { FlowchartState } from '../../js/core/flowchart/flowchart-model.js';

suite('FlowchartState — construction', () => {
  test('constructs with empty steps array', () => {
    const s = new FlowchartState();
    assertEqual(Array.isArray(s.steps), true);
    assertEqual(s.steps.length, 0);
  });

  test('normalizeStep exists as instance method', () => {
    const s = new FlowchartState();
    assertEqual(typeof s.normalizeStep, 'function');   // fails in this task — implemented in Task 2
  });
});
