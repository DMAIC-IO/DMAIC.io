/**
 * Tests for core/model.js — Kommandos, execute, Beobachter, setFields, replaceFields.
 */
import { suite, test, assertEqual, assertDeepEqual, assertThrows, assertTrue } from '../test-utils.js';
import {
  defineModel, command, text, oneOf, index, boolean, record, list,
  runCommand, setCommandObserver, setFields, replaceFields,
  recordInverse, setHistoryMode, collectInverses, table, markTableChanged,
} from '../../js/core/model.js';

const COL_KEYS = ['suppliers', 'inputs', 'process'];

const Board = defineModel({
  fields: {
    title: text(),
    columns: record(COL_KEYS, list(text())),
    selected: index('columns.process', { existing: true, nullable: true, default: null }),
  },
  view: { mode: oneOf(['month', 'week']) },
  commands: {
    moveItem: command({
      params: {
        sourceCol: oneOf(COL_KEYS),
        sourceIdx: index('columns[sourceCol]', { existing: true }),
        targetCol: oneOf(COL_KEYS),
        dropIdx: index('columns[targetCol]'),
      },
      returns: boolean(),
      run({ sourceCol, sourceIdx, targetCol, dropIdx }) {
        const [moved] = this.columns[sourceCol].splice(sourceIdx, 1);
        const idx = sourceCol === targetCol && dropIdx > sourceIdx ? dropIdx - 1 : dropIdx;
        this.columns[targetCol].splice(idx, 0, moved);
        return true;
      },
    }),
    clear: command({ run() { this.title = ''; } }),
  },
});

function filled() {
  return Board.fromJSON({ columns: { suppliers: ['a', 'b'], inputs: [], process: ['x'] } });
}

suite('Kommandos — Prüfung und Ausführung', () => {
  test('gültiges Kommando läuft und liefert das Ergebnis', () => {
    const m = filled();
    assertEqual(m.moveItem({ sourceCol: 'suppliers', sourceIdx: 0, targetCol: 'process', dropIdx: 1 }), true);
    assertDeepEqual(m.columns.process, ['x', 'a']);
  });

  test('Pfadgrenze liest den bereits geprüften Parameter', () => {
    const m = filled();
    assertThrows(() => m.moveItem({ sourceCol: 'inputs', sourceIdx: 0, targetCol: 'process', dropIdx: 0 }),
      /^invalid sourceIdx 0; allowed: none, the collection is empty$/);
    assertThrows(() => m.moveItem({ sourceCol: 'suppliers', sourceIdx: 0, targetCol: 'process', dropIdx: 5 }),
      /^invalid dropIdx 5; allowed: 0\.\.1$/);
  });

  test('fehlender Parameter: requireArity-Form', () => {
    assertThrows(() => filled().moveItem({ sourceCol: 'suppliers', sourceIdx: 0, targetCol: 'process' }),
      /^missing argument "dropIdx" of moveItem; expected: sourceCol, sourceIdx, targetCol, dropIdx$/);
  });

  test('unbekannter Parameter', () => {
    assertThrows(() => filled().moveItem({ sourceCol: 'suppliers', sourceIdx: 0, targetCol: 'process', dropIdx: 0, x: 1 }),
      /^unknown moveItem param "x"; available: sourceCol, sourceIdx, targetCol, dropIdx$/);
  });

  test('kein Objekt', () => {
    assertThrows(() => filled().moveItem('suppliers'), /^invalid moveItem "suppliers"; allowed: an object with sourceCol/);
  });

  test('Kommando ohne Parameter darf ohne Argument laufen', () => {
    const m = Board.fromJSON({ title: 'T' });
    m.clear();
    assertEqual(m.title, '');
  });

  test('abgelehntes Kommando ändert nichts', () => {
    const m = filled();
    const before = JSON.stringify(m.toJSON());
    try { m.moveItem({ sourceCol: 'suppliers', sourceIdx: 9, targetCol: 'process', dropIdx: 0 }); } catch { /* erwartet */ }
    assertEqual(JSON.stringify(m.toJSON()), before);
  });

  test('execute verteilt nach type', () => {
    const m = filled();
    assertEqual(m.execute({ type: 'moveItem', sourceCol: 'suppliers', sourceIdx: 1, targetCol: 'inputs', dropIdx: 0 }), true);
    assertDeepEqual(m.columns.inputs, ['b']);
    assertThrows(() => m.execute({ type: 'nope' }), /^unknown command "nope"; available: moveItem, clear$/);
  });

  test('Kommandoname darf kein Feld sein', () => {
    assertThrows(() => defineModel({ fields: { a: text() }, commands: { a: command({ run() {} }) } }), /a/);
  });
});

suite('Kommandos — synchron', () => {
  test('run liefert ein Promise → wirft, Beobachter bleibt still', () => {
    const M = defineModel({ name: 'A', version: '1.0', fields: {}, commands: { go: command({ params: {}, run() { return Promise.resolve(1); } }) } });
    const m = new M();
    let calls = 0;
    setCommandObserver(m, () => { calls += 1; });
    assertThrows(() => m.go({}), /^command go: run must be synchronous — use asyncTask$/);
    assertEqual(calls, 0);
  });
});

suite('Kommandos — Beobachter', () => {
  test('meldet Name, geprüfte Argumente und Ergebnis', () => {
    const m = filled();
    const seen = [];
    setCommandObserver(m, (cmd, args, result) => seen.push({ cmd, args, result }));
    m.moveItem({ sourceCol: 'suppliers', sourceIdx: 0, targetCol: 'process', dropIdx: 0 });
    assertDeepEqual(seen, [{ cmd: 'moveItem',
      args: { sourceCol: 'suppliers', sourceIdx: 0, targetCol: 'process', dropIdx: 0 }, result: true }]);
  });

  test('Beobachter ist nicht aufzählbar und nicht in toJSON', () => {
    const m = filled();
    setCommandObserver(m, () => {});
    assertDeepEqual(Object.keys(m), ['_v']);
    assertTrue(!('_obs' in m.toJSON()));
  });

  test('abgelehntes Kommando meldet nichts', () => {
    const m = filled();
    let calls = 0;
    setCommandObserver(m, () => { calls += 1; });
    try { m.moveItem({}); } catch { /* erwartet */ }
    assertEqual(calls, 0);
  });

  test('runCommand mit fremdem this (Viewmodel-Kommando), Wurzel = Model', () => {
    const m = filled();
    const seen = [];
    setCommandObserver(m, (cmd) => seen.push(cmd));
    const vm = { model: m, prefix: '>' };
    const def = command({
      params: { idx: index('columns.suppliers', { existing: true }) },
      returns: text(),
      run({ idx }) { return this.prefix + this.model.columns.suppliers[idx]; },
    });
    assertEqual(runCommand('label', def, vm, m, { idx: 1 }), '>b');
    assertDeepEqual(seen, ['label']);
  });
});

suite('setFields / replaceFields', () => {
  test('setzt mehrere Felder, gibt normalisierte Werte zurück', () => {
    const m = filled();
    const out = setFields(m, { title: 'Neu', selected: 0 });
    assertDeepEqual(out, { title: 'Neu', selected: 0 });
    assertEqual(m.title, 'Neu');
  });

  test('prüft alles, bevor etwas geschrieben wird', () => {
    const m = filled();
    assertThrows(() => setFields(m, { title: 'Neu', selected: 7 }), /^invalid selected 7; allowed: 0\.\.0$/);
    assertEqual(m.title, '', 'nichts geschrieben');
  });

  test('Grenze sieht den neuen Wert eines früher erklärten Feldes', () => {
    const m = filled();
    setFields(m, { columns: { suppliers: [], inputs: [], process: ['p', 'q'] }, selected: 1 });
    assertEqual(m.selected, 1);
  });

  test('Ansichtsfeld und unbekannter Name sind nicht setzbar', () => {
    const m = filled();
    assertThrows(() => setFields(m, { mode: 'week' }), /^unknown field "mode"; available: title, columns, selected$/);
    assertThrows(() => setFields(m, 'x'), /^invalid values "x"; allowed: an object with any of title, columns, selected$/);
  });

  test('replaceFields übernimmt Inhalt und Ansicht, Beobachter bleibt', () => {
    const live = filled();
    let calls = 0;
    setCommandObserver(live, () => { calls += 1; });
    replaceFields(live, Board.fromJSON({ title: 'R', mode: 'week', columns: { suppliers: ['z'], inputs: [], process: [] } }));
    assertEqual(live.title, 'R');
    assertEqual(live.mode, 'week');
    live.moveItem({ sourceCol: 'suppliers', sourceIdx: 0, targetCol: 'inputs', dropIdx: 0 });
    assertEqual(calls, 1);
  });
});

const Cells = defineModel({
  fields: { vals: list(text()), grid: table() },
  view: { mode: oneOf(['month', 'week']) },
  commands: {
    set: command({
      params: { i: index('vals', { existing: true }), v: text() },
      returns: text(),
      run({ i, v }) {
        const old = this.vals[i];
        recordInverse(this, { type: 'set', i, v: old });
        const next = [...this.vals];
        next[i] = v;
        this.vals = next;
        return old;
      },
    }),
    setTwo: command({
      params: { v: text() },
      run({ v }) { this.set({ i: 0, v }); this.set({ i: 1, v }); },
    }),
    sneak: command({ run() { this.vals = ['x', 'x']; } }),
    sneakTable: command({ run() { markTableChanged(this, this.grid); } }),
    look: command({ params: { mode: oneOf(['month', 'week']) }, run({ mode }) { this.mode = mode; } }),
  },
});

const cells = () => Cells.fromJSON({ vals: ['a', 'b'] });

suite('Kommandos — Umkehrung (recordInverse)', () => {
  test('Rückgabewert bleibt, der Beobachter bekommt die Umkehrungen', () => {
    const m = cells();
    const seen = [];
    setCommandObserver(m, (cmd, args, result, inverses) => seen.push({ cmd, result, inverses }));
    assertEqual(m.set({ i: 1, v: 'z' }), 'b');
    assertDeepEqual(seen, [{ cmd: 'set', result: 'b', inverses: [{ type: 'set', i: 1, v: 'b' }] }]);
  });

  test('geschachtelte Kommandos sammeln in einen Sammler', () => {
    const m = cells();
    const top = [];
    setCommandObserver(m, (cmd, args, result, inverses) => { if (inverses) top.push({ cmd, inverses }); });
    m.setTwo({ v: 'q' });
    assertDeepEqual(top, [{ cmd: 'setTwo', inverses: [{ type: 'set', i: 0, v: 'a' }, { type: 'set', i: 1, v: 'b' }] }]);
  });

  test('recordInverse außerhalb eines Kommandos wirft', () => {
    assertThrows(() => recordInverse(cells(), { type: 'set', i: 0, v: 'a' }), /recordInverse outside a command/);
  });

  test('collectInverses öffnet den Sammler für mehrere Kommandos', () => {
    const m = cells();
    const seen = [];
    setCommandObserver(m, (cmd, args, result, inverses) => seen.push(inverses));
    const got = collectInverses(m, () => { m.set({ i: 0, v: 'x' }); m.set({ i: 1, v: 'y' }); });
    assertDeepEqual(got, [{ type: 'set', i: 0, v: 'a' }, { type: 'set', i: 1, v: 'b' }]);
    assertDeepEqual(seen, [null, null], 'Kommandos im offenen Sammler gelten als geschachtelt');
  });

  test('Modus inverse: Inhalt ohne Umkehrung wirft', () => {
    const m = cells();
    setHistoryMode(m, 'inverse');
    assertThrows(() => m.sneak({}), /^command sneak changed content without recordInverse$/);
    assertThrows(() => m.sneakTable({}), /^command sneakTable changed content without recordInverse$/);
  });

  test('Modus inverse: nur Ansichtsfelder wirft nicht', () => {
    const m = cells();
    setHistoryMode(m, 'inverse');
    m.look({ mode: 'week' });
    assertEqual(m.mode, 'week');
    m.set({ i: 0, v: 'n' });
    assertEqual(m.vals[0], 'n');
  });

  test('Modus inverse: direkter Schreibzugriff auf ein Inhaltsfeld außerhalb eines Kommandos wirft', () => {
    const m = cells();
    setHistoryMode(m, 'inverse');
    assertThrows(() => { m.vals = ['q', 'q']; }, /vals.*command/);
    m.mode = 'week';
    assertEqual(m.mode, 'week');
  });

  test('ohne Modus: Inhalt ohne Umkehrung bleibt erlaubt, Zähler und Sammler sind nicht aufzählbar', () => {
    const m = cells();
    m.sneak({});
    assertDeepEqual(m.vals, ['x', 'x']);
    assertDeepEqual(Object.keys(m), ['_v']);
    assertTrue(!('$contentWrites' in m.toJSON()));
  });
});
