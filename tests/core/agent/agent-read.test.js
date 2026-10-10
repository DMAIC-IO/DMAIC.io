/**
 * Tests for core/agent/agent-read.js — the read() projection from Spec §7
 * ("der Agent bekommt Umfang statt Masse, bis er gezielt nachfragt").
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../../test-utils.js';
import { projectReadState } from '../../../js/core/agent/agent-read.js';

const SCHEMA = {
  title:   { type: 'string',   help: 'Titel der Sammlung', bulk: false },
  columns: { type: 'object[]', help: 'Spaltendefinitionen', bulk: false },
  rows:    { type: 'any[][]',  help: 'Datenzeilen',         bulk: true  },
};

function makeState(rowCount = 5) {
  return {
    title: 'Messreihe',
    columns: [{ name: 'A' }, { name: 'B' }, { name: 'C' }],
    rows: Array.from({ length: rowCount }, (_, i) => [i, i * 2, i * 3]),
    _cursor: 4,
  };
}

suite('agent read projection', () => {
  test('without options the bulk field is replaced by a descriptor', () => {
    const out = projectReadState(makeState(5000), SCHEMA);
    assertEqual(out.title, 'Messreihe');
    assertEqual(out.rows.$bulk, true);
    assertEqual(out.rows.kind, 'table');
    assertEqual(out.rows.rowCount, 5000);
    assertDeepEqual(out.rows.columns, ['A', 'B', 'C']);
  });

  test('non-bulk fields always come through in full', () => {
    const out = projectReadState(makeState(), SCHEMA);
    assertEqual(out.columns.length, 3);
  });

  test('underscore-prefixed fields never appear', () => {
    const schemaWithPrivate = {
      ...SCHEMA,
      _cursor: { type: 'number', help: 'private', bulk: false },
    };
    const out = projectReadState(makeState(), schemaWithPrivate);
    assertEqual(Object.prototype.hasOwnProperty.call(out, '_cursor'), false);
  });

  /* ── Driftfreiheit: erklärt, aber nicht geliefert ─────────────────────
     Der Vergleich „Schlüssel von read() == erklärte Felder" ist die eine
     mechanische Zusicherung, dass eine erklärte Lesefläche nicht von der
     Momentaufnahme abdriftet. Legte die Projektion den Schlüssel unbedingt
     an, wäre dieser Vergleich per Konstruktion immer wahr — und ein aus der
     Momentaufnahme gefallenes Feld käme still als `undefined` beim Agenten
     an. */

  test('ein erklärtes Feld, das die Momentaufnahme nicht führt, FEHLT in der Projektion', () => {
    const out = projectReadState({ title: 'Messreihe' }, {
      title: { type: 'string', help: '', bulk: false },
      activeSheetId: { type: 'string', help: '', bulk: false },
    });
    assertDeepEqual(Object.keys(out), ['title']);
    assertEqual(Object.prototype.hasOwnProperty.call(out, 'activeSheetId'), false);
    assertEqual('activeSheetId' in out, false);
  });

  test('ein erklärtes Massenfeld, das die Momentaufnahme nicht führt, bekommt KEINEN Deskriptor', () => {
    const out = projectReadState({ title: 'x' }, SCHEMA);
    assertEqual(Object.prototype.hasOwnProperty.call(out, 'rows'), false);
  });

  test('ein vorhandenes null bleibt legal und kommt als null durch', () => {
    // `result`, `colRef1`, `alpha`: ein null ist der dokumentierte
    // Leerzustand und muss von „fehlt" unterscheidbar bleiben.
    const out = projectReadState({ result: null, colRef1: null }, {
      result: { type: 'object', help: '', bulk: false },
      colRef1: { type: 'object', help: '', bulk: false },
      colRef2: { type: 'object', help: '', bulk: false },
    });
    assertDeepEqual(Object.keys(out), ['result', 'colRef1']);
    assertEqual(out.result, null);
    assertEqual(out.colRef1, null);
  });

  test('ein vorhandenes undefined bleibt vorhanden — „fehlt" ist etwas anderes', () => {
    const out = projectReadState({ result: undefined }, {
      result: { type: 'object', help: '', bulk: false },
    });
    assertDeepEqual(Object.keys(out), ['result']);
    assertEqual(out.result, undefined);
  });

  test('a field absent from the schema never appears', () => {
    const out = projectReadState({ ...makeState(), secret: 1 }, SCHEMA);
    assertEqual(Object.prototype.hasOwnProperty.call(out, 'secret'), false);
  });

  test('fields: [bulk field] delivers the data in full', () => {
    const out = projectReadState(makeState(4), SCHEMA, { fields: ['rows'] });
    assertEqual(out.rows.length, 4);
    assertDeepEqual(out.rows[0], [0, 0, 0]);
  });

  test('rows narrows the requested bulk field and reports the range', () => {
    const out = projectReadState(makeState(10), SCHEMA, { fields: ['rows'], rows: { from: 2, to: 5 } });
    assertEqual(out.rows.length, 3);
    assertDeepEqual(out.rows[0], [2, 4, 6]);
    assertDeepEqual(out.rows$range, { from: 2, to: 5, rowCount: 10 });
  });

  test('a range beyond the data is clamped, not an error', () => {
    const out = projectReadState(makeState(3), SCHEMA, { fields: ['rows'], rows: { from: 1, to: 99 } });
    assertEqual(out.rows.length, 2);
    assertDeepEqual(out.rows$range, { from: 1, to: 3, rowCount: 3 });
  });

  test('rows without fields does not force bulk data out', () => {
    const out = projectReadState(makeState(10), SCHEMA, { rows: { from: 0, to: 2 } });
    assertEqual(out.rows.$bulk, true);
  });

  test('fields naming a non-bulk field is harmless', () => {
    const out = projectReadState(makeState(10), SCHEMA, { fields: ['title'] });
    assertEqual(out.title, 'Messreihe');
    assertEqual(out.rows.$bulk, true);
  });

  test('a bulk field that is not an array gets rowCount 0 and no columns', () => {
    const out = projectReadState({ rows: null }, { rows: { type: 'any[][]', help: '', bulk: true } });
    assertEqual(out.rows.rowCount, 0);
    assertDeepEqual(out.rows.columns, []);
  });

  test('without schema columns field remains empty', () => {
    const schema = { grid: { type: 'any[][]', help: '', bulk: true } };
    const out = projectReadState({ grid: [['x', 'y'], [1, 2]] }, schema);
    assertDeepEqual(out.grid.columns, []);
    assertEqual(out.grid.rowCount, 2);
  });

  test('the projection is a fresh object — mutating it does not touch the state', () => {
    const state = makeState(2);
    const out = projectReadState(state, SCHEMA, { fields: ['rows'] });
    out.rows.push([9, 9, 9]);
    assertEqual(state.rows.length, 2);
  });

  /* ── Die drei Stufen von clone() ──────────────────────────────────────
     Ein stilles `null` wäre für den Agenten von „noch nicht gerechnet"
     nicht zu unterscheiden — und genau das ist bei einem rechnenden Modul
     der dokumentierte Leerzustand. */

  const ONE = { value: { type: 'object', help: '', bulk: false } };

  test('clone Stufe 1: ein gewöhnliches Objekt kommt verlustfrei durch', () => {
    const out = projectReadState({ value: { a: 1, b: ['x'] } }, ONE);
    assertDeepEqual(out.value, { a: 1, b: ['x'] });
  });

  test('clone Stufe 2: ein Proxy scheitert an structuredClone und kommt über JSON durch', () => {
    // Genau die Form, die ein reaktives Viewmodel liefert (Alpine): reine
    // Daten hinter einem Proxy. structuredClone wirft DataCloneError.
    const proxy = new Proxy({ route: { name: 'Welch t-Test' }, p: 0.0003 }, {});
    let threw = false;
    try { structuredClone(proxy); } catch { threw = true; }
    assertTrue(threw, 'Voraussetzung: structuredClone scheitert am Proxy');
    const out = projectReadState({ value: proxy }, ONE);
    assertEqual(out.value.route.name, 'Welch t-Test');
    assertEqual(out.value.p, 0.0003);
  });

  test('clone Stufe 3: ein zyklischer Wert wird SICHTBAR unübertragbar, nicht null', () => {
    const cyclic = { name: 'x' };
    cyclic.self = cyclic;
    // structuredClone kann Zyklen; eine Funktion darin kann es nicht, und
    // JSON kann den Zyklus nicht — damit greift Stufe 3.
    const out = projectReadState({ value: { fn() {}, cyclic } }, ONE);
    assertEqual(out.value.$unserializable, true);
    assertTrue(typeof out.value.reason === 'string' && out.value.reason.length > 0);
    assertTrue(out.value !== null);
  });

  /* ── Deskriptoren gehören zum FELD, nicht zum Modul (Task 6) ──────────
     Spalten aus einem Schwesterfeld statt aus dem globalen `columns`, ein
     Massenfeld kann ein Baum sein, und `from > to` ist ein kaputter Aufruf
     statt eines leeren Ausschnitts. */

  test('zwei Massenfelder bekommen NICHT beide die globalen Spalten', () => {
    // `columnNames` las das globale `source.columns` und hängte es an jedes
    // Massenfeld. Ein Modul mit zwei Tabellen bekam zweimal dieselben
    // Spalten — eine Information, die für das zweite Feld schlicht falsch
    // ist. Die Konvention ist jetzt ein Schwesterfeld JE Feld.
    const schema = {
      rows:      { type: 'any[][]', help: '', bulk: true, bulkKind: 'table' },
      extraRows: { type: 'any[][]', help: '', bulk: true, bulkKind: 'table' },
    };
    const source = {
      rows: [[1], [2]],
      rowsColumns: [{ name: 'A' }],
      extraRows: [[3]],
      extraRowsColumns: [{ name: 'B' }, { name: 'C' }],
    };

    const out = projectReadState(source, schema, {});

    assertEqual(out.rows.columns.join(','), 'A');
    assertEqual(out.extraRows.columns.join(','), 'B,C');
  });

  test('ein einziges Massenfeld nimmt weiter das globale columns — der Worksheet-Fall', () => {
    const schema = { rows: { type: 'any[][]', help: '', bulk: true, bulkKind: 'table' } };
    const source = { rows: [[1], [2], [3]], columns: [{ name: 'Durchmesser' }, { name: 'Charge' }] };

    const out = projectReadState(source, schema, {});

    assertEqual(out.rows.$bulk, true);
    assertEqual(out.rows.kind, 'table');
    assertEqual(out.rows.rowCount, 3);
    assertEqual(out.rows.columns.join(','), 'Durchmesser,Charge');
  });

  test('zwei Massenfelder ohne Schwesterfeld bekommen eine leere Spaltenliste, nicht die falsche', () => {
    const schema = {
      rows:      { type: 'any[][]', help: '', bulk: true, bulkKind: 'table' },
      extraRows: { type: 'any[][]', help: '', bulk: true, bulkKind: 'table' },
    };
    const source = { rows: [[1]], extraRows: [[2]], columns: [{ name: 'A' }] };

    const out = projectReadState(source, schema, {});

    assertEqual(out.rows.columns.length, 0);
    assertEqual(out.extraRows.columns.length, 0);
  });

  test('ein Massenfeld der Art tree beschreibt Knotenzahl und Tiefe, nicht Zeilen', () => {
    const schema = { nodes: { type: 'object[]', help: '', bulk: true, bulkKind: 'tree' } };
    const source = { nodes: [
      { id: 1, children: [{ id: 2, children: [{ id: 3, children: [] }] }] },
      { id: 4, children: [] },
    ] };

    const out = projectReadState(source, schema, {});

    assertEqual(out.nodes.$bulk, true);
    assertEqual(out.nodes.kind, 'tree');
    assertEqual(out.nodes.nodeCount, 4);
    assertEqual(out.nodes.depth, 3);
    assertEqual(out.nodes.rowCount, undefined, 'ein Baum hat keine Zeilen');
    assertEqual(out.nodes.columns, undefined, 'ein Baum hat keine Spalten');
  });

  test('ein angefordertes tree-Massenfeld kommt vollständig, wie ein table-Feld', () => {
    const schema = { nodes: { type: 'object[]', help: '', bulk: true, bulkKind: 'tree' } };
    const source = { nodes: [{ id: 1, children: [] }] };

    const out = projectReadState(source, schema, { fields: ['nodes'] });

    assertEqual(Array.isArray(out.nodes), true);
    assertEqual(out.nodes.length, 1);
  });

  test('ein tree-Massenfeld zählt auch eine Form ohne children — gröber, aber wahr', () => {
    const schema = { nodes: { type: 'object[]', help: '', bulk: true, bulkKind: 'tree' } };
    const out = projectReadState({ nodes: [{ id: 1 }, { id: 2 }] }, schema, {});
    assertEqual(out.nodes.nodeCount, 2);
    assertEqual(out.nodes.depth, 1);
  });

  test('from größer als to ist ein Fehler, kein leeres Array', () => {
    // Bisher: `rows.slice(5, 2)` ist `[]`, und `$range` meldete
    // `{ from: 5, to: 2, rowCount: 3 }` — ein Umfang, den es nicht gibt.
    // Ein Agent sah „keine Zeilen" und hielt das für eine Aussage über die
    // Daten statt über seinen Aufruf.
    const schema = { rows: { type: 'any[][]', help: '', bulk: true, bulkKind: 'table' } };
    const source = { rows: [[1], [2], [3]] };

    const out = projectReadState(source, schema, { fields: ['rows'], rows: { from: 5, to: 2 } });

    assertEqual(out.$error, 'wrong_type');
    assertTrue(/from/.test(out.$message) && /to/.test(out.$message), out.$message);
  });

  test('from gleich to ist kein Fehler, sondern ein leerer Ausschnitt', () => {
    const schema = { rows: { type: 'any[][]', help: '', bulk: true, bulkKind: 'table' } };
    const out = projectReadState({ rows: [[1], [2]] }, schema, { fields: ['rows'], rows: { from: 1, to: 1 } });
    assertEqual(out.rows.length, 0);
    assertEqual(out.rows$range.from, 1);
    assertEqual(out.rows$range.to, 1);
  });

  test('ein nicht übertragbarer Wert bekommt einen sichtbaren Marker, kein stilles null', () => {
    // Ergänzt `clone Stufe 3` oben um die Gegenprobe im SELBEN Lauf: ein
    // Zyklus allein übersteht Stufe 1, erst die Funktion daneben schiebt den
    // Wert auf Stufe 3 durch. Ohne das Paar wäre nicht gezeigt, dass der
    // Marker den schuldigen Wert trifft und nicht jeden Zyklus.
    const cyclic = { name: 'a' };
    cyclic.self = cyclic;                 // structuredClone kann das, JSON nicht
    const withFn = { f() {} };            // structuredClone kann das NICHT
    withFn.self = withFn;                 // ... und JSON auch nicht

    const schema = {
      a: { type: 'object', help: '', bulk: false },
      b: { type: 'object', help: '', bulk: false },
    };
    const out = projectReadState({ a: cyclic, b: withFn }, schema, {});

    // `a` übersteht Stufe 1 (structuredClone kann Zyklen).
    assertEqual(out.a.name, 'a');
    // `b` scheitert an Stufe 1 (Funktion) UND an Stufe 2 (Zyklus) → Marker.
    assertEqual(out.b.$unserializable, true);
    assertEqual(typeof out.b.reason, 'string');
  });
});
