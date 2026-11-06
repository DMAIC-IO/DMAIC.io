/**
 * Tests for core/agent/agent-schema.js — die Agentenfläche eines
 * Schema-Moduls in der Form von AGENT_REGISTRY.
 */
import { suite, test, assertEqual, assertDeepEqual, assertThrows } from '../../test-utils.js';
import { defineModel, command, text, number, oneOf, index, list, record, boolean, date, time, phase } from '../../../js/core/model.js';
import { schemaAgentEntry, readSchemaModel } from '../../../js/core/agent/agent-schema.js';
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
