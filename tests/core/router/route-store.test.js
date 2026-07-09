import { suite, test, assertEqual, assertTrue } from '../../test-utils.js';
import { subMatches, registerRouteDirectives } from '../../../js/core/router/route-store.js';

suite('router/route-store', () => {
  test('subMatches: head segment equality', () => {
    assertTrue(subMatches(['scatter'], 'scatter'));
    assertTrue(subMatches(['scatter', 'x'], 'scatter'));
    assertEqual(subMatches(['residuals'], 'scatter'), false);
    assertEqual(subMatches([], 'scatter'), false);
  });

  test('registerRouteDirectives: registers store, magic and directive once', () => {
    const calls = { store: [], magic: [], directive: [] };
    const fakeAlpine = {
      store: (name, val) => { if (val !== undefined) calls.store.push(name); return calls._store?.[name]; },
      magic: (name) => calls.magic.push(name),
      directive: (name) => calls.directive.push(name),
    };
    registerRouteDirectives(fakeAlpine, { onGo: () => {} });
    assertTrue(calls.store.includes('route'));
    assertTrue(calls.magic.includes('route'));
    assertTrue(calls.directive.includes('route'));
  });
});
