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

  test('action args are URI-decoded', () => {
    const r = parseHash('#/action/new-project/dmaic/Mein%20Projekt');
    assertEqual(r.kind, 'action');
    assertDeepEqual(r.args, ['dmaic', 'Mein Projekt']);
  });

  test('a broken percent-escape falls back to the raw segment', () => {
    const r = parseHash('#/action/new-project/dmaic/100%');
    assertEqual(r.args[1], '100%');
  });

  test('umlauts and punctuation survive an encode/decode round-trip', () => {
    const name = 'Käffchen & Törtchen, Prüfung Nr. 3 (Süß)';
    const r = parseHash(`#/action/new-project/dmaic/${encodeURIComponent(name)}`);
    assertEqual(r.args[1], name);
  });

  test('a slash in the name does not split into an extra segment', () => {
    const name = 'A/B Test — Vergleich';
    const r = parseHash(`#/action/new-project/dmaic/${encodeURIComponent(name)}`);
    assertDeepEqual(r.args, ['dmaic', name]);
  });

  test('a hash in the name does not break parsing', () => {
    const name = 'Ticket #42 Nachbesserung';
    const r = parseHash(`#/action/new-project/dmaic/${encodeURIComponent(name)}`);
    assertDeepEqual(r.args, ['dmaic', name]);
  });
});

suite('serializeRoute actions', () => {
  test('never serialises an action route', () => {
    assertEqual(serializeRoute({ kind: 'action', verb: 'scenario', args: ['x'] }), '#/');
  });
});
