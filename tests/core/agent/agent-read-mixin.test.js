/**
 * Tests für core/agent/agent-read-mixin.js — das EINE read(), das Spec §9
 * Migrationsschritt 3 an jedem Viewmodel verlangt. Einmal geschrieben statt
 * 72-mal: der Generator löst den Spread auf und sieht Marke und Schema des
 * Mixin-Mitglieds.
 */
import { suite, test, assertEqual, assertTrue, assertDeepEqual } from '../../test-utils.js';
import { agentReadMixin, readAgentState } from '../../../js/core/agent/agent-read-mixin.js';

/** Eine Alpine-Komponente, soweit das Mixin sie braucht. */
function componentFor(moduleId, modelJson) {
  const mixin = agentReadMixin({ id: moduleId });
  return { ...mixin, model: { toJSON: () => modelJson } };
}

suite('agent read mixin', () => {
  test('read() projects the model JSON through the registry schema', () => {
    // five-why ist nach Task 5 freigegeben; bis dahin liefert die Registry
    // für das Modul bereits `fields`, auch ohne Freigabe.
    const component = componentFor('five-why', { problem: 'P', nodes: [], _idCounter: 7 });
    const state = component.read();
    assertEqual(state.problem, 'P');
    assertDeepEqual(state.nodes, []);
    assertEqual('_idCounter' in state, false);
  });

  test('read() of an unknown module id yields an empty object, it does not throw', () => {
    const component = componentFor('does-not-exist', { a: 1 });
    assertDeepEqual(component.read(), {});
  });

  test('read() passes options through to the projection', () => {
    const schemaState = readAgentState('five-why', { problem: 'P', nodes: [1, 2] }, undefined);
    assertEqual(schemaState.problem, 'P');
  });

  test('readAgentState never hands out a reference into the live state', () => {
    const live = { problem: 'P', nodes: [{ id: 1 }] };
    const state = readAgentState('five-why', live, {});
    state.nodes[0].id = 99;
    assertEqual(live.nodes[0].id, 1);
  });

  test('read() returns a plain object even when the model has no toJSON', () => {
    const mixin = agentReadMixin({ id: 'five-why' });
    const component = { ...mixin, model: null };
    assertTrue(typeof component.read() === 'object');
  });
});
