/**
 * Tests for core/agent/agent-schema.js — die Agentenfläche eines
 * Schema-Moduls in der Form von AGENT_REGISTRY.
 */
import { suite, test, assertEqual, assertDeepEqual, assertThrows, assertTrue } from '../../test-utils.js';
import { defineModel, command, text, number, oneOf, index, list, record, map, object, image, boolean, date, time, phase, columnRef, datasets } from '../../../js/core/model.js';
import { asyncTask } from '../../../js/core/async-task.js';
import { schemaAgentEntry, readSchemaModel, omitPathsOf, writableByAgent } from '../../../js/core/agent/agent-schema.js';
import { describeModule } from '../../../js/core/agent/agent-catalog.js';

const COLS = ['a', 'b'];
const Board = defineModel({
  fields: {
    title: text(),
    alpha: number({ exclusiveMin: 0, exclusiveMax: 1, nullable: true, default: null }),
    columns: record(COLS, list(text())),
    rows: list(text(), { bulk: true }),
  },
  view: { mode: oneOf(['month', 'week']) },
  commands: {
    moveItem: command({
      params: { from: oneOf(COLS), idx: index('columns[from]', { existing: true }), note: text({ optional: true }) },
      returns: boolean(),
      run() { return true; },
    }),
  },
});
const VM_COMMANDS = { buildCsv: command({ params: { sep: oneOf([',', ';']) }, returns: text(), run() { return ''; } }) };

suite('schemaAgentEntry', () => {
  const entry = schemaAgentEntry(Board, VM_COMMANDS);

  test('Kopf des Eintrags', () => {
    assertEqual(entry.available, true);
    assertEqual(entry.tagged, true);
    assertEqual(entry.schema, true);
    assertDeepEqual(entry.violations, []);
    assertDeepEqual(entry.viewFields, ['mode']);
    assertDeepEqual(entry.settable, ['title', 'alpha', 'columns', 'rows']);
  });

  test('Felder: Typ und Massenmerkmal, keine Ansichtsfelder', () => {
    assertDeepEqual(Object.keys(entry.fields), ['title', 'alpha', 'columns', 'rows']);
    assertDeepEqual(entry.fields.alpha, { type: 'number|null', help: '', bulk: false });
    assertDeepEqual(entry.fields.rows, { type: 'string[]', help: '', bulk: true });
  });

  test('read steht vorn, dann Model-, dann Viewmodel-Kommandos', () => {
    assertDeepEqual(Object.keys(entry.actions), ['read', 'moveItem', 'buildCsv']);
    assertEqual(entry.actions.read.params[0].name, 'options');
    assertEqual(entry.actions.read.target, undefined);
  });

  test('Kommando: ein Parameter command, Schlüssel in keys', () => {
    const a = entry.actions.moveItem;
    assertEqual(a.target, 'model');
    assertEqual(a.returns, 'boolean');
    assertDeepEqual(a.params.map(p => [p.name, p.type, p.optional]), [['command', 'object', false]]);
    assertEqual(a.keysOf, 'moveItem');
    assertEqual(a.keysHelp, 'actions.moveItem.params');
    assertDeepEqual(a.keys, {
      from: { type: "'a'|'b'", help: '' },
      idx: { type: 'number', help: '' },
      note: { type: 'string', help: '', optional: true },
    });
    assertEqual(entry.actions.buildCsv.target, 'viewmodel');
  });

  test('Modul ohne Schema wirft', () => {
    assertThrows(() => schemaAgentEntry(class {}), /schema/);
  });
});

suite('readSchemaModel', () => {
  const entry = schemaAgentEntry(Board);

  test('Massenfeld als Deskriptor, Rest als Wert', () => {
    const m = Board.fromJSON({ title: 'T', rows: ['x', 'y'] });
    const out = readSchemaModel(entry, m);
    assertEqual(out.title, 'T');
    assertEqual(out.rows.$bulk, true);
  });

  test('kaputter Bereich wirft', () => {
    const m = new Board();
    assertThrows(() => readSchemaModel(entry, m, { fields: ['rows'], rows: { from: 5, to: 2 } }), /rows/);
  });
});

suite('describeModule mit Schema-Eintrag (keysHelp)', () => {
  test('Schlüsselhilfe kommt aus actions.<name>.params.<param>', async () => {
    const entry = schemaAgentEntry(Board);
    const table = { 'modules.board.actions.moveItem.params.from': 'Quellspalte' };
    const i18n = {
      getLanguage: () => 'de',
      exists: (k) => Object.hasOwn(table, k),
      t: (k) => table[k] ?? k,
    };
    const moduleRegistry = {
      get: (id) => (id === 'board' ? { id: 'board', phase: 'define', cycles: { dmaic: { phase: 'define' } } } : undefined),
      getAll: () => [],
      getActiveCycle: () => 'dmaic',
    };
    const out = await describeModule({ moduleRegistry, i18n, registry: { board: entry }, getHelp: async () => null }, 'board');
    const move = out.actions.find(a => a.name === 'moveItem');
    assertEqual(move.keys.find(k => k.name === 'from').help, 'Quellspalte');
    assertEqual(move.keys.find(k => k.name === 'note').optional, true);
  });
});

suite('schemaAgentEntry — text-Regeln', () => {
  test('text-Optionen erscheinen als rules am Schlüssel', () => {
    const M = defineModel({
      fields: { t: text() },
      commands: {
        add: command({
          params: { col: oneOf(['a']), text: text({ trim: true, nonEmpty: true }) },
          run() {},
        }),
      },
    });
    const { keys } = schemaAgentEntry(M).actions.add;
    assertDeepEqual(keys.text, { type: 'string', help: '', rules: ['trim', 'nonEmpty'] });
    assertEqual('rules' in keys.col, false);
  });
});

suite('agent-schema: Regeln der Datums-, Zeit- und Phasenfelder', () => {
  const M = defineModel({
    fields: {},
    commands: {
      plan: command({
        params: { d: date(), t: time({ step: 5, optional: true }), p: phase({ optional: true }), u: time({ optional: true }) },
        run() {},
      }),
    },
  });
  test('rules nennen Art und Raster', () => {
    const { keys } = schemaAgentEntry(M).actions.plan;
    assertDeepEqual(keys.d.rules, ['date']);
    assertDeepEqual(keys.t.rules, ['time', 'step:5']);
    assertDeepEqual(keys.p.rules, ['phase']);
    assertDeepEqual(keys.u.rules, ['time']);
    assertEqual(keys.d.type, 'string');
  });
});

suite('schemaAgentEntry: derived', () => {
  test('ohne derived gibt es keine Lesefelder; die Option computed gibt es nicht mehr', () => {
    const M = defineModel({ fields: { title: text() } });
    const entry = schemaAgentEntry(M, {}, { computed: ['result'] });
    assertEqual(entry.fields.result, undefined);
    assertEqual(entry.fields.title.derived, undefined);
    assertDeepEqual(entry.settable, ['title']);
  });

  test('derived aus dem Model werden Lesefelder, derivedBulk als Tabelle', () => {
    const M = defineModel({
      fields: { title: text() },
      derived: { stats() { return 1; }, rows() { return []; } },
      derivedBulk: ['rows'],
    });
    const entry = schemaAgentEntry(M);
    assertDeepEqual(entry.fields.stats, { type: 'object|null', help: '', bulk: false, derived: true });
    assertDeepEqual(entry.fields.rows, { type: 'object[]', help: '', bulk: true, bulkKind: 'table', derived: true });
    assertDeepEqual(Object.keys(entry.fields), ['title', 'stats', 'rows']);
    assertDeepEqual(entry.settable, ['title']);
  });

  test('Felder tragen rules, wenn ihre Feldart Tokens hat; text ohne Optionen und Listen davon nicht', () => {
    const M = defineModel({ fields: {
      title: text({ trim: true }), day: date(), c: columnRef({ types: ['numeric'], minCount: 2 }),
      cs: list(columnRef({ nullable: false })), names: list(text()),
    } });
    const f = schemaAgentEntry(M).fields;
    assertDeepEqual(f.title.rules, ['trim']);
    assertDeepEqual(f.day.rules, ['date']);
    assertEqual(f.names.rules, undefined);
    assertDeepEqual(f.c.rules, ['columnRef', 'types:numeric', 'minCount:2']);
    assertDeepEqual(f.cs.rules, ['columnRef']);
  });

  test('columnRef maxCount erscheint als Token maxCount:<n>', () => {
    const M = defineModel({ fields: { c: columnRef({ types: ['numeric'], minCount: 1, maxCount: 4 }), d: columnRef({ maxCount: 0 }) } });
    const f = schemaAgentEntry(M).fields;
    assertDeepEqual(f.c.rules, ['columnRef', 'types:numeric', 'minCount:1', 'maxCount:4']);
    assertDeepEqual(f.d.rules, ['columnRef', 'maxCount:0']);
  });

  test('list unique/sorted erscheint als rules am Feld', () => {
    const M = defineModel({ fields: {
      ids: list(oneOf([1, 2, 3]), { unique: true, sorted: true, default: [] }),
      onlyU: list(text(), { unique: true, default: [] }),
      plain: list(text()),
    } });
    const f = schemaAgentEntry(M).fields;
    assertDeepEqual(f.ids.rules, ['unique', 'sorted']);
    assertDeepEqual(f.onlyU.rules, ['unique']);
    assertEqual(f.plain.rules, undefined);
  });

  test('datasets: Regeln je Slot', () => {
    const M = defineModel({ fields: { datasets: datasets({
      valueRef: columnRef({ types: ['numeric'], minCount: 1, required: true }),
      groupRef: columnRef({ group: true }),
    }, { multi: true }) } });
    const f = schemaAgentEntry(M).fields.datasets;
    assertDeepEqual(f.rules, ['datasets', 'multi']);
    assertDeepEqual(f.slots, {
      valueRef: ['columnRef', 'types:numeric', 'minCount:1', 'required'],
      groupRef: ['columnRef', 'group'],
    });
  });
});

suite('schemaAgentEntry: asyncTasks', () => {
  const Doc = defineModel({ fields: { a: number() } });
  const tasks = {
    compute: asyncTask({ params: { n: number({ min: 0 }) }, run() { return 1; } }),
    live: asyncTask({ auto: true, run() { return 2; } }),
  };
  const entry = schemaAgentEntry(Doc, {}, { asyncTasks: tasks });
  test('manuelle Tasks: <name> und <name>.cancel; auto ohne Aktion', () => {
    assertDeepEqual(Object.keys(entry.actions), ['read', 'compute', 'compute.cancel']);
    assertEqual(entry.actions.compute.target, 'asyncTask');
    assertEqual(entry.actions.compute.op, 'start');
    assertEqual(entry.actions.compute.helpKey, 'asyncTasks.compute.help');
    assertEqual(entry.actions.compute.keysHelp, 'asyncTasks.compute.params');
    assertEqual(entry.actions.compute.keys.n.type, 'number');
    assertEqual(entry.actions['compute.cancel'].op, 'cancel');
    assertDeepEqual(entry.actions['compute.cancel'].params, []);
    assertEqual(entry.actions['compute.cancel'].helpKey, 'asyncTasks.compute.cancel.help');
  });
  test('Liste der Tasks und Lesefeld', () => {
    assertDeepEqual(entry.asyncTasks, [{ name: 'compute', auto: false, params: ['n'] }, { name: 'live', auto: true, params: [] }]);
    assertEqual(entry.fields.asyncTasks.derived, true);
  });
});

suite('schemaAgentEntry — Invarianten', () => {
  test('nennt die Namen der Invarianten in Deklarationsreihenfolge; ohne Invarianten leer', () => {
    const Range = defineModel({
      fields: { lo: number({ default: 0 }), hi: number({ default: 1 }) },
      view: {},
      commands: {},
      invariants: {
        b: { fields: ['lo', 'hi'], test(m) { return m.lo < m.hi; } },
        a: { fields: ['hi'], test(m) { return m.hi > -100; } },
      },
    });
    assertDeepEqual(schemaAgentEntry(Range).invariants, ['b', 'a']);
    assertDeepEqual(schemaAgentEntry(Board).invariants, []);
  });
});

const URL_ = 'data:image/png;base64,AAAA';

suite('omitPathsOf — nur das Merkmal omitOnRead zählt', () => {
  test('Pfade je Form', () => {
    assertDeepEqual(omitPathsOf(image()), ['']);
    assertDeepEqual(omitPathsOf(list(object({ dataUrl: image() }))), ['[].dataUrl']);
    assertDeepEqual(omitPathsOf(object({ in: list(object({ u: image() })) })), ['.in[].u']);
    assertDeepEqual(omitPathsOf(record(['a'], image())), ['.a']);
    assertDeepEqual(omitPathsOf(map(text(), image())), ['{}']);
    assertDeepEqual(omitPathsOf(list(object({ data: text(), n: number() }, { omitOnRead: true }))), ['[]']);
    assertDeepEqual(omitPathsOf(list(object({ a: text() }))), []);
  });
  test('ein Feld mit Merkmal zählt als Ganzes, auch ohne image()', () => {
    assertDeepEqual(omitPathsOf(list(object({ data: object({ x: image() }, { omitOnRead: true }) }))), ['[].data']);
  });
});

suite('read() lässt Felder mit omitOnRead aus', () => {
  const Doc = defineModel({
    fields: {
      cover: image({ nullable: true }),
      shots: list(object({ id: text(), dataUrl: image() })),
      byKey: map(text(), image()),
      snaps: list(object({ id: text(), data: object({ a: text() }, { omitOnRead: true }) })),
      note: text(),
    },
  });
  const entry = schemaAgentEntry(Doc);

  test('omit steht nur am Feld mit Auslassung', () => {
    assertDeepEqual(entry.fields.cover.omit, ['']);
    assertDeepEqual(entry.fields.shots.omit, ['[].dataUrl']);
    assertDeepEqual(entry.fields.byKey.omit, ['{}']);
    assertDeepEqual(entry.fields.snaps.omit, ['[].data']);
    assertEqual('omit' in entry.fields.note, false);
  });

  test('bytes ist die JSON-Länge, an jeder Stelle', () => {
    const m = Doc.fromJSON({
      cover: URL_, shots: [{ id: 'a', dataUrl: URL_ }], byKey: { k: URL_ },
      snaps: [{ id: 's', data: { a: 'zz' } }], note: 'n',
    });
    const out = readSchemaModel(entry, m);
    assertDeepEqual(out.cover, { $omitted: true, bytes: JSON.stringify(URL_).length });
    assertDeepEqual(out.shots[0], { id: 'a', dataUrl: { $omitted: true, bytes: JSON.stringify(URL_).length } });
    assertDeepEqual(out.byKey.k, { $omitted: true, bytes: JSON.stringify(URL_).length });
    assertDeepEqual(out.snaps[0].data, { $omitted: true, bytes: JSON.stringify({ a: 'zz' }).length });
    assertEqual(out.note, 'n');
  });

  test('null bleibt null', () => {
    assertEqual(readSchemaModel(entry, Doc.fromJSON({})).cover, null);
  });

  test('1,2 MB Daten-URL: die Antwort bleibt unter 1 KB', () => {
    const big = 'data:image/png;base64,' + 'A'.repeat(1_200_000);
    const out = readSchemaModel(entry, Doc.fromJSON({ cover: big, shots: [{ id: 'a', dataUrl: big }] }));
    assertEqual(out.cover.$omitted, true);
    assertEqual(out.cover.bytes, JSON.stringify(big).length);
    assertTrue(JSON.stringify(out).length < 1024);
  });
});

suite('agentWrite: false sperrt Felder und Kommandos', () => {
  const URL_ = 'data:image/png;base64,AAAA';
  const Doc = defineModel({
    fields: {
      note: text(),
      cover: image({ nullable: true }),
      shots: list(object({ id: text(), dataUrl: image() })),
      byKey: map(text(), image()),
      locked: text({ agentWrite: false }),
      fixed: object({ a: text(), b: text({ agentWrite: false }) }),
    },
    commands: {
      rename: command({ params: { to: text() }, returns: boolean(), run() { return true; } }),
      upload: command({ params: { name: text(), pic: image() }, returns: boolean(), run() { return true; } }),
      uploadMany: command({ params: { pics: list(image()) }, returns: boolean(), run() { return true; } }),
    },
  });
  const VM = {
    pick: command({ params: { pic: image() }, returns: boolean(), run() { return true; } }),
    plain: command({ params: { x: text() }, returns: boolean(), run() { return true; } }),
  };
  const TASKS = {
    manual: asyncTask({ params: { pic: image() }, run() { return 1; } }),
    open: asyncTask({ params: { x: text() }, run() { return 1; } }),
  };
  const entry = schemaAgentEntry(Doc, VM, { asyncTasks: TASKS });

  test('writableByAgent folgt dem Merkmal, nie der Feldart', () => {
    assertEqual(writableByAgent(text()), true);
    assertEqual(writableByAgent(image()), false);
    assertEqual(writableByAgent(text({ agentWrite: false })), false);
    assertEqual(writableByAgent(list(object({ u: image() }))), false);
    assertEqual(writableByAgent(object({ a: text(), b: map(text(), image()) })), false);
    assertEqual(writableByAgent(record(['a'], text({ agentWrite: false }))), false);
    assertEqual(writableByAgent(list(text())), true);
    assertEqual(writableByAgent(image({ agentWrite: true })), true);
  });

  test('settable lässt Felder mit oder über agentWrite: false aus, auch verschachtelt', () => {
    assertDeepEqual(entry.settable, ['note']);
  });

  test('die Felder bleiben lesbar', () => {
    assertDeepEqual(Object.keys(entry.fields).filter((k) => !['asyncTasks'].includes(k)),
      ['note', 'cover', 'shots', 'byKey', 'locked', 'fixed']);
  });

  test('Kommandos mit gesperrtem Parameter fehlen in actions, auch verschachtelt', () => {
    assertTrue('rename' in entry.actions);
    assertTrue('plain' in entry.actions);
    assertEqual('upload' in entry.actions, false);
    assertEqual('uploadMany' in entry.actions, false);
    assertEqual('pick' in entry.actions, false);
  });

  test('manueller Ablauf mit gesperrtem Parameter fehlt samt Abbrechen', () => {
    assertEqual('manual' in entry.actions, false);
    assertEqual('manual.cancel' in entry.actions, false);
    assertTrue('open' in entry.actions);
    assertTrue('open.cancel' in entry.actions);
  });
});
