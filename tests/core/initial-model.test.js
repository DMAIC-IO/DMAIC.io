import { suite, test, assertEqual, assertTrue } from '../test-utils.js';
import { initialModel, loadModel } from '../../js/core/initial-model.js';
import { defineModel, text, number } from '../../js/core/model.js';
import { State, fmeaCreateDefault } from '../../js/modules/fmea/fmea-model.js';

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
  const ctxWith = (value) => ({ stateManager: { get: (k) => (k === 'settings.fmea' ? value : undefined) } });

  test('rpn/design settings are applied', () => {
    const s = initialModel(State, null, fmeaCreateDefault, ctxWith({ defaultMethod: 'rpn', defaultType: 'design' }));
    assertEqual(s.method, 'rpn');
    assertEqual(s.fmeaType, 'design');
  });

  test('missing or corrupt settings fall back to ap/process', () => {
    for (const v of [undefined, null, 'rpn', { defaultMethod: 'xyz', defaultType: 7 }]) {
      const s = initialModel(State, null, fmeaCreateDefault, ctxWith(v));
      assertEqual(s.method, 'ap', JSON.stringify(v));
      assertEqual(s.fmeaType, 'process', JSON.stringify(v));
    }
  });
});

suite('loadModel', () => {
  const M = defineModel({ fields: { title: text(), note: text() } });

  test('Schema-Model: gültiger Zustand streng geladen', () => {
    assertEqual(loadModel(M, { title: 'T' }).title, 'T');
  });

  test('Schema-Model: ungültiges Feld → Vorgabe, gültige Felder bleiben', () => {
    const warn = console.warn; let warned = 0;
    console.warn = () => { warned += 1; };
    try {
      const m = loadModel(M, { title: 5, note: 'n' });
      assertEqual(m.title, '');
      assertEqual(m.note, 'n');
      assertEqual(warned, 1);
    } finally { console.warn = warn; }
  });

  test('Schema-Model: genau eine Sammelwarnung nennt alle zurückgesetzten Felder', () => {
    const warn = console.warn; const warnings = [];
    console.warn = (msg) => { warnings.push(String(msg)); };
    try {
      const m = loadModel(M, { title: 5, note: 7 });
      assertEqual(m.title, '');
      assertEqual(m.note, '');
      assertEqual(warnings.length, 1);
      assertTrue(/Felder auf Vorgabe gesetzt: title, note/.test(warnings[0]), warnings[0]);
    } finally { console.warn = warn; }
  });

  test('Klasse ohne Schema: Model.fromJSON wie bisher', () => {
    class Legacy { static fromJSON(j) { const l = new Legacy(); l.v = j.v; return l; } }
    assertEqual(loadModel(Legacy, { v: 3 }).v, 3);
  });

  test('initialModel nutzt loadModel für gespeicherten Zustand', () => {
    const warn = console.warn; console.warn = () => {};
    try { assertEqual(initialModel(M, { title: 9 }, undefined, {}).title, ''); } finally { console.warn = warn; }
  });
});

suite('initialModel: Kontext', () => {
  const Stats = defineModel({ fields: { alpha: number({ exclusiveMin: 0, exclusiveMax: 1, default: (c) => Number((1 - c.confidenceLevel / 100).toFixed(4)) }) } });
  const ctxOf = (conf) => ({ stateManager: { getProjectCycle: () => 'dmaic', get: (k) => (k === 'settings.confidenceLevel' ? conf : undefined) } });

  test('frisches Schema-Model mit dem Kontext des Projekts', () => {
    const m = initialModel(Stats, null, undefined, ctxOf(90));
    assertEqual(m.alpha, 0.1);
    assertEqual(m.hasContent(), false);
  });

  test('gespeichert: fehlende Felder aus dem Kontext', () => {
    assertEqual(initialModel(Stats, { _schema: { version: '1.0' } }, undefined, ctxOf(90)).alpha, 0.1);
    assertEqual(loadModel(Stats, {}, { cycle: 'dmaic', confidenceLevel: 99, power: 80 }).alpha, 0.01);
  });
});
