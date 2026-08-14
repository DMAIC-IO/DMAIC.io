/**
 * Tests for the #/action/... branch of the router path codec.
 */
import { suite, test, assertEqual, assertDeepEqual } from '../test-utils.js';
import { parseHash, serializeRoute } from '../../js/core/router/route-path.js';

suite('parseHash actions', () => {
  test('parses a verb with one argument', () => {
    const r = parseHash('#/action/scenario/scenario-pizza-full');
    assertEqual(r.kind, 'action');
    assertEqual(r.verb, 'scenario');
    assertDeepEqual(r.args, ['scenario-pizza-full']);
  });

  test('parses a verb with several arguments', () => {
    const r = parseHash('#/action/example/charter-pizza-lieferzeit/extra');
    assertDeepEqual(r.args, ['charter-pizza-lieferzeit', 'extra']);
  });

  test('a verb without arguments still parses', () => {
    const r = parseHash('#/action/new-project');
    assertEqual(r.kind, 'action');
    assertDeepEqual(r.args, []);
  });

  test('project routes are unaffected', () => {
    const r = parseHash('#/project/p-1/phase/define');
    assertEqual(r.kind, 'phase');
  });
});

suite('serializeRoute actions', () => {
  test('never serialises an action route', () => {
    assertEqual(serializeRoute({ kind: 'action', verb: 'scenario', args: ['x'] }), '#/');
  });
});
