/**
 * Tests für die Erweiterung der Feldart `datasets` (`extension`) und die
 * Option `variantKey` an `object` — Anlegen, Vorgabe, Prüfung, Typtext,
 * Umhängen von Spaltenbezügen und die Agentenfläche.
 */
import { suite, test, assertEqual, assertDeepEqual, assertThrows, assertTrue } from '../test-utils.js';
import {
  defineModel, datasets, object, oneOf, number, columnRef, text, list, checkValue, defaultOf, describeType,
  rewriteColumnRefs, emptyDatasetRow,
} from '../../js/core/model.js';
import { schemaAgentEntry } from '../../js/core/agent/agent-schema.js';
import { describeModule } from '../../js/core/agent/agent-catalog.js';

const KEYS = ['xPlus', 'xMinus', 'yPlus', 'yMinus'];
const amount = number({ nullable: true, optional: true });
const column = columnRef({ types: ['numeric'], minCount: 1, optional: true });
const Bars = object({
  mode: oneOf(['none', 'constant', 'columns']),
  constant: object(Object.fromEntries(KEYS.map((k) => [k, amount])), { optional: true }),
  columns: object(Object.fromEntries(KEYS.map((k) => [k, column])), { optional: true }),
}, { variantKey: 'mode' });

const SLOTS = { x: columnRef({ required: true }), group: columnRef({ group: true }) };
const ds = datasets(SLOTS, { multi: true, extension: object({ errorBars: Bars }) });
const plain = datasets(SLOTS, { multi: true });
const ref = (c, i = 'ws-1') => ({ instanceId: i, columnId: c });

suite('object({ variantKey })', () => {
  test('variantKey muss ein oneOf-Schlüssel sein', () => {
    assertThrows(() => object({ mode: text() }, { variantKey: 'mode' }), /invalid object variantKey mode; allowed: a key of the shape whose spec is oneOf/);
    assertThrows(() => object({ a: oneOf(['x']) }, { variantKey: 'mode' }), /invalid object variantKey mode/);
  });

  test('Variantenschlüssel müssen optional sein', () => {
    assertThrows(() => object({ mode: oneOf(['a', 'b']), a: number() }, { variantKey: 'mode' }),
      /invalid object variant a without optional; allowed: optional variants/);
  });

  test('Vorgabe: erster Wert und dessen Variante', () => {
    assertDeepEqual(defaultOf(Bars), { mode: 'none' });
    const first = object({ mode: oneOf(['constant', 'none']), constant: object({ v: number(), w: number({ optional: true }) }, { optional: true }) }, { variantKey: 'mode' });
    assertDeepEqual(defaultOf(first), { mode: 'constant', constant: { v: 0 } });
  });

  test('nimmt die eigene Variante an, lehnt eine fremde ab', () => {
    assertDeepEqual(checkValue(Bars, 'eb', { mode: 'constant', constant: { yPlus: 1 } }), { mode: 'constant', constant: { yPlus: 1 } });
    assertDeepEqual(checkValue(Bars, 'eb', { mode: 'columns', columns: { yPlus: ref('a') } }), { mode: 'columns', columns: { yPlus: ref('a') } });
    assertThrows(() => checkValue(Bars, 'eb', { mode: 'columns', constant: {} }),
      /invalid eb key "constant"; allowed: columns \(mode columns\)/);
    assertThrows(() => checkValue(Bars, 'eb', { mode: 'none', constant: {} }),
      /invalid eb key "constant"; allowed: no variant \(mode none\)/);
  });

  test('ein unbekannter Modus nennt allowed:, vor der Variantenprüfung', () => {
    assertThrows(() => checkValue(Bars, 'eb', { mode: 'band', constant: {} }), /invalid eb\.mode "band"; allowed: none, constant, columns/);
  });

  test('eine falsche Zahl nennt den Pfad', () => {
    assertThrows(() => checkValue(Bars, 'eb', { mode: 'constant', constant: { yPlus: 'x' } }), /invalid eb\.constant\.yPlus "x"/);
  });

  test('Typtext: Union der Varianten', () => {
    assertEqual(describeType(Bars),
      "{ mode: 'none' }|{ mode: 'constant', constant?: { xPlus?: number|null, xMinus?: number|null, yPlus?: number|null, yMinus?: number|null } }"
      + "|{ mode: 'columns', columns?: { xPlus?: { instanceId: string, sheetId?: string, columnId: string }|null, xMinus?: { instanceId: string, sheetId?: string, columnId: string }|null, yPlus?: { instanceId: string, sheetId?: string, columnId: string }|null, yMinus?: { instanceId: string, sheetId?: string, columnId: string }|null } }");
  });

  test('Typtext eines object ohne variantKey bleibt', () => {
    assertEqual(describeType(object({ a: number(), b: text({ optional: true }) })), '{ a: number, b?: string }');
  });
});

suite('datasets({ extension }) — Anlegen', () => {
  test('ein Erweiterungsschlüssel darf nicht wie ein Slot heißen', () => {
    assertThrows(() => datasets(SLOTS, { extension: object({ x: number() }) }),
      /invalid datasets extension key x; allowed: names other than the slots/);
  });

  test('ein Erweiterungsschlüssel darf nicht optional sein', () => {
    assertThrows(() => datasets(SLOTS, { extension: object({ e: number({ optional: true }) }) }),
      /invalid datasets extension key e optional/);
  });

  test('nur object, oneOf, number, columnRef sind zugelassen, auch verschachtelt', () => {
    assertThrows(() => datasets(SLOTS, { extension: object({ e: text() }) }),
      /invalid datasets extension kind text at e; allowed: object, oneOf, number, columnRef/);
    assertThrows(() => datasets(SLOTS, { extension: object({ e: object({ l: list(number()) }) }) }),
      /kind list at e\.l; allowed: object, oneOf, number, columnRef/);
    assertThrows(() => datasets(SLOTS, { extension: number() }), /invalid datasets extension; allowed: object/);
  });

  test('ohne extension trägt die Spec keinen Schlüssel extension', () => {
    assertEqual(Object.hasOwn(plain, 'extension'), false);
    assertEqual(ds.extension.kind, 'object');
  });
});

suite('datasets({ extension }) — Vorgabe und Prüfung', () => {
  test('Vorgabe der Zeile trägt die Erweiterung', () => {
    assertDeepEqual(defaultOf(ds), [{ x: null, group: null, errorBars: { mode: 'none' } }]);
    assertDeepEqual(emptyDatasetRow(ds), { x: null, group: null, errorBars: { mode: 'none' } });
    assertDeepEqual(defaultOf(plain), [{ x: null, group: null }]);
  });

  test('ein fehlender Erweiterungsschlüssel ergibt die Vorgabe', () => {
    assertDeepEqual(checkValue(ds, 'datasets', [{ x: ref('a') }]),
      [{ x: ref('a'), group: null, errorBars: { mode: 'none' } }]);
  });

  test('vorhandene Erweiterung wird geprüft und kopiert', () => {
    const eb = { mode: 'constant', constant: { yPlus: 2 } };
    const out = checkValue(ds, 'datasets', [{ x: null, errorBars: eb }]);
    assertDeepEqual(out[0].errorBars, eb);
    assertTrue(out[0].errorBars !== eb);
  });

  test('ein unbekannter Schlüssel nennt Slots und Erweiterung', () => {
    assertThrows(() => checkValue(ds, 'datasets', [{ other: 1 }]),
      /unknown datasets\[0\] key "other"; available: x, group, errorBars/);
  });

  test('fremde Variante und falsche Zahl mit Pfad', () => {
    assertThrows(() => checkValue(ds, 'datasets', [{ errorBars: { mode: 'columns', constant: {} } }]),
      /invalid datasets\[0\]\.errorBars key "constant"; allowed: columns \(mode columns\)/);
    assertThrows(() => checkValue(ds, 'datasets', [{ errorBars: { mode: 'constant', constant: { yPlus: 'x' } } }]),
      /invalid datasets\[0\]\.errorBars\.constant\.yPlus "x"/);
  });

  test('ohne extension bleiben die Meldungen', () => {
    assertThrows(() => checkValue(plain, 'datasets', [{ errorBars: {} }]),
      /unknown datasets\[0\] key "errorBars"; available: x, group$/);
    assertDeepEqual(checkValue(plain, 'datasets', [{ x: ref('a') }]), [{ x: ref('a'), group: null }]);
  });

  test('Rundlauf über das Model', () => {
    const M = defineModel({ fields: { datasets: ds } });
    const m = new M();
    assertDeepEqual(m.datasets, [{ x: null, group: null, errorBars: { mode: 'none' } }]);
    m.datasets = [{ x: ref('a'), group: null, errorBars: { mode: 'columns', columns: { yMinus: ref('e') } } }];
    assertDeepEqual(M.fromJSON(m.toJSON()).datasets, m.datasets);
  });
});

suite('datasets({ extension }) — Typtext', () => {
  test('ohne extension byte-gleich zur bisherigen Form', () => {
    const r = '{ instanceId: string, sheetId?: string, columnId: string }|null';
    assertEqual(describeType(plain), `Array<{ x: ${r}, group: ${r} }>`);
  });

  test('mit extension hängen die Schlüssel am Zeilentyp', () => {
    const t = describeType(ds);
    assertTrue(t.startsWith('Array<{ x: '), t);
    assertTrue(t.includes(", errorBars: { mode: 'none' }|{ mode: 'constant', constant?: {"), t);
  });
});

suite('datasets({ extension }) — rewriteColumnRefs', () => {
  test('hängt Bezüge in errorBars.columns.* um', () => {
    const M = defineModel({ fields: { datasets: ds } });
    const json = { datasets: [{
      x: ref('a', '__source__'), group: null,
      errorBars: { mode: 'columns', columns: { yPlus: ref('e', '__source__'), yMinus: ref('f', 'other') } },
    }] };
    const out = rewriteColumnRefs(M, json, '__source__', 'ws-9');
    assertEqual(out.datasets[0].x.instanceId, 'ws-9');
    assertEqual(out.datasets[0].errorBars.columns.yPlus.instanceId, 'ws-9');
    assertEqual(out.datasets[0].errorBars.columns.yMinus.instanceId, 'other');
  });
});

suite('datasets({ extension }) — Agentenfläche', () => {
  const M = defineModel({ fields: { datasets: ds } });
  const P = defineModel({ fields: { datasets: plain } });

  test('Regeln der Erweiterung je Schlüssel', () => {
    const f = schemaAgentEntry(M).fields.datasets;
    assertDeepEqual(Object.keys(f.extension), ['errorBars']);
    assertEqual(f.extension.errorBars[0], 'variantKey:mode');
    assertTrue(f.extension.errorBars.includes('columns.yPlus: columnRef, types:numeric, minCount:1'), f.extension.errorBars.join(' | '));
  });

  test('ohne Erweiterung kein Schlüssel extension und kein Schlüsselbaum', () => {
    const f = schemaAgentEntry(P).fields.datasets;
    assertEqual(Object.hasOwn(f, 'extension'), false);
    assertEqual(Object.hasOwn(f, 'keys'), false);
    assertEqual(Object.hasOwn(f, 'keysOf'), false);
  });

  test('describe liefert extension und den Schlüsselbaum mit Hilfe', async () => {
    const table = {
      'modules.board.fields.datasets.errorBars.help': 'Fehlerbalken der Reihe',
      'modules.board.fields.datasets.errorBars.constant.yPlus.help': 'Abstand nach oben',
    };
    const i18n = { getLanguage: () => 'de', exists: (k) => Object.hasOwn(table, k), t: (k) => table[k] ?? k };
    const moduleRegistry = {
      get: (id) => (id === 'board' ? { id: 'board', phase: 'define', cycles: { dmaic: { phase: 'define' } } } : undefined),
      getAll: () => [],
      getActiveCycle: () => 'dmaic',
    };
    const out = await describeModule({ moduleRegistry, i18n, registry: { board: schemaAgentEntry(M) }, getHelp: async () => null }, 'board');
    const f = out.fields.find((x) => x.name === 'datasets');
    assertDeepEqual(Object.keys(f.extension), ['errorBars']);
    const eb = f.keys.find((k) => k.name === 'errorBars');
    assertEqual(eb.help, 'Fehlerbalken der Reihe');
    const yPlus = eb.keys.find((k) => k.name === 'constant').keys.find((k) => k.name === 'yPlus');
    assertEqual(yPlus.help, 'Abstand nach oben');
    assertEqual(yPlus.optional, true);
  });
});
