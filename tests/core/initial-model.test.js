import { suite, test, assertEqual } from '../test-utils.js';
import { initialModel } from '../../js/core/initial-model.js';
import { State, stateFromSettings } from '../../js/modules/fmea/fmea-model.js';

class Plain {
  constructor() { this.origin = 'new'; }
  static fromJSON(d) { const p = new Plain(); p.origin = `saved:${d.v}`; return p; }
}

suite('initialModel', () => {
  test('without createDefault an empty instance uses new Model()', () => {
    assertEqual(initialModel(Plain, null, undefined, {}).origin, 'new');
  });

  test('createDefault is used for an empty instance and receives the context', () => {
    const ctx = { tag: 'ctx' };
    const m = initialModel(Plain, null, (c) => { const p = new Plain(); p.origin = c.tag; return p; }, ctx);
    assertEqual(m.origin, 'ctx');
  });

  test('saved state wins over createDefault', () => {
    const m = initialModel(Plain, { v: 1 }, () => { throw new Error('must not run'); }, {});
    assertEqual(m.origin, 'saved:1');
  });

  test('a throwing or empty createDefault falls back to new Model()', () => {
    assertEqual(initialModel(Plain, null, () => { throw new Error('x'); }, {}).origin, 'new');
    assertEqual(initialModel(Plain, null, () => null, {}).origin, 'new');
  });
});

suite('FMEA createDefault from settings', () => {
  const fmeaDefault = () => (ctx) => stateFromSettings(ctx.stateManager.get('settings.fmea'));
  const ctxWith = (value) => ({ stateManager: { get: (k) => (k === 'settings.fmea' ? value : undefined) } });

  test('rpn/design settings are applied', () => {
    const s = initialModel(State, null, fmeaDefault(), ctxWith({ defaultMethod: 'rpn', defaultType: 'design' }));
    assertEqual(s.method, 'rpn');
    assertEqual(s.fmeaType, 'design');
  });

  test('missing or corrupt settings fall back to ap/process', () => {
    for (const v of [undefined, null, 'rpn', { defaultMethod: 'xyz', defaultType: 7 }]) {
      const s = initialModel(State, null, fmeaDefault(), ctxWith(v));
      assertEqual(s.method, 'ap', JSON.stringify(v));
      assertEqual(s.fmeaType, 'process', JSON.stringify(v));
    }
  });
});
