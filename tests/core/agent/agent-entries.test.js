/**
 * Tests for core/agent/agent-entries.js — Platzhalter `schema: true` →
 * echter Eintrag aus dem geladenen Modul.
 */
import { suite, test, assertEqual, assertDeepEqual } from '../../test-utils.js';
import { createEntryResolver, referencedModules } from '../../../js/core/agent/agent-entries.js';

const STUB = { tagged: true, available: true, schema: true, violations: [], reported: [], actions: {}, fields: {} };
const LEGACY = { tagged: true, available: true, violations: [], reported: [], actions: { read: { params: [] } }, fields: {} };
const REAL = { ...STUB, actions: { read: { params: [] }, moveItem: { target: 'model', params: [] } } };

suite('createEntryResolver', () => {
  test('alter Eintrag bleibt, ohne zu laden', async () => {
    let loads = 0;
    const r = createEntryResolver({ old: LEGACY }, async () => { loads += 1; });
    assertEqual(await r.resolve('old'), LEGACY);
    assertEqual(loads, 0);
  });

  test('Platzhalter wird einmal geladen und ersetzt', async () => {
    let loads = 0;
    const r = createEntryResolver({ neu: STUB }, async () => { loads += 1; return { agentEntry: REAL }; });
    assertEqual(await r.resolve('neu'), REAL);
    assertEqual(await r.resolve('neu'), REAL);
    assertEqual(loads, 1);
    assertEqual(r.view().neu, REAL);
  });

  test('scheitert das Laden, ist das Modul nicht verfügbar (und wird später neu versucht)', async () => {
    let fail = true;
    const warn = console.warn; console.warn = () => {};
    try {
      const r = createEntryResolver({ neu: STUB }, async () => { if (fail) throw new Error('chunk'); return { agentEntry: REAL }; });
      assertEqual((await r.resolve('neu')).available, false);
      fail = false;
      assertEqual(await r.resolve('neu'), REAL);
    } finally { console.warn = warn; }
  });

  test('ohne loadModule: nicht verfügbar', async () => {
    const r = createEntryResolver({ neu: STUB });
    assertEqual((await r.resolve('neu')).available, false);
  });

  test('view() ohne Auflösung ist das Registry selbst', () => {
    const reg = { old: LEGACY };
    assertEqual(createEntryResolver(reg).view(), reg);
  });
});

suite('referencedModules', () => {
  test('Modul-Literale und Instanz-Ids', () => {
    const instances = [{ id: 'i1', module: 'sipoc' }, { id: 'i2', module: 'kano' }];
    assertDeepEqual(referencedModules([
      { op: 'module.describe', module: 'fmea' },
      { op: 'instance.call', instance: 'i2', method: 'read' },
      { op: 'instance.call', instance: { $from: 'a', path: 'instanceId' }, method: 'read' },
      { op: 'instance.set', instance: 'nope', values: {} },
    ], instances), ['fmea', 'kano']);
    assertDeepEqual(referencedModules({ op: 'module.add', module: 'sipoc' }, instances), ['sipoc']);
  });
});
