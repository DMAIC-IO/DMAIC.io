/**
 * Tests for modules/triz-contradiction-matrix/domain/model.js — Schema und
 * Vorgaben (zwei nullbare Parameter 1 bis 39, eine Notiz, ein Ansichtsfeld),
 * Stände ohne `_schema` über '0→1.0', gespeicherte Stände '1.0' ohne
 * Migrationsschritt, Versionsprüfung, Reparatur, die Kommandos `swapParams`
 * und `pickCell`, Schreiben der Felder, `hasContent` und die Ableitung
 * `recommendation`.
 */
import { suite, test, assertEqual, assertDeepEqual, assertThrows, assertTrue } from '../../test-utils.js';
import { State } from '../../../js/modules/triz-contradiction-matrix/domain/model.js';
import { MATRIX, PARAMETER_COUNT } from '../../../js/modules/triz-contradiction-matrix/domain/matrix.js';
import { setModelName } from '../../../js/core/model.js';
import { loadModel } from '../../../js/core/initial-model.js';
import { evaluateDerived } from '../../../js/core/derived.js';

setModelName(State, 'triz-contradiction-matrix');

const SCHEMA = { _schema: { name: 'triz-contradiction-matrix', version: '1.0' } };
const EMPTY = { ...SCHEMA, improving: null, worsening: null, problemNote: '', showMatrix: false };

/** Zustand der Instanz aus der Fixture „Altprojekt“ (`legacy-project.json`), ohne `_schema` wie die Altform. */
const LEGACY_STATE = {
  improving: 21,
  worsening: 33,
  problemNote: 'Mehr Leistung des Rührwerks & schnellere Charge <Ziel "30 min">.\nDie Bedienung wird dabei schwerer — Bediener müssen öfter nachregeln (> 5 Eingriffe).',
  showMatrix: true,
};
/** Derselbe Stand in der Zielform. */
const LEGACY = { ...SCHEMA, ...LEGACY_STATE };

const plain = (v) => JSON.parse(JSON.stringify(v));
/** Die gespeicherten Felder ohne `_schema`. @param {object} m */
const fieldsOf = (m) => { const { _schema, ...rest } = plain(m.toJSON()); return rest; };

/** Stub-Übersetzer: macht den Schlüssel sichtbar. @param {string} key */
const T = (key) => `T:${key}`;
/** @param {object} m */
const recommendation = (m) => evaluateDerived(m, /** @type {any} */ (undefined), undefined, T).recommendation;

/** @param {() => any} fn @returns {any} der geworfene Fehler oder null */
function thrown(fn) {
  try { fn(); } catch (e) { return e; }
  return null;
}

/** Laden mit Reparatur; meldet die reparierten Felder. @param {object} json */
function repaired(json) {
  const fields = [];
  const m = State.fromJSON(json, { repair: true, onRepair: (f) => fields.push(f) });
  return { m, fields };
}

suite('triz-contradiction-matrix Model — Schema und Vorgaben', () => {
  test('drei Felder in gespeicherter Reihenfolge, ein Ansichtsfeld, zwei Kommandos, eine Ableitung', () => {
    assertDeepEqual(Object.keys(State.schema.fields), ['improving', 'worsening', 'problemNote']);
    for (const f of ['improving', 'worsening']) {
      const s = State.schema.fields[f];
      assertEqual(s.kind, 'number', f);
      assertEqual(s.integer, true, f);
      assertEqual(s.nullable, true, f);
    }
    assertEqual(State.schema.fields.problemNote.kind, 'text');
    assertDeepEqual(Object.keys(State.schema.view), ['showMatrix']);
    assertEqual(State.schema.view.showMatrix.kind, 'boolean');
    assertDeepEqual(Object.keys(State.schema.commands), ['swapParams', 'pickCell']);
    assertDeepEqual(Object.keys(State.schema.commands.swapParams.params), []);
    assertDeepEqual(Object.keys(State.schema.commands.pickCell.params), ['improving', 'worsening']);
    assertDeepEqual(Object.keys(State.schema.derived), ['recommendation']);
  });
  test('Grenzen 1 und 39 in Feldern und Kommandoparametern gleichen der Tabelle', () => {
    const specs = [
      State.schema.fields.improving, State.schema.fields.worsening,
      State.schema.commands.pickCell.params.improving, State.schema.commands.pickCell.params.worsening,
    ];
    for (const s of specs) {
      assertEqual(s.min, 1);
      assertEqual(s.max, MATRIX.length);
      assertEqual(s.max, PARAMETER_COUNT);
      assertEqual(s.integer, true);
    }
    assertEqual(State.schema.commands.pickCell.params.improving.nullable, undefined);
  });
  test('Vorgaben: keine Wahl, leere Notiz, Matrix verborgen, kein Inhalt', () => {
    const m = new State();
    assertEqual(m.improving, null);
    assertEqual(m.worsening, null);
    assertEqual(m.problemNote, '');
    assertEqual(m.showMatrix, false);
    assertEqual(m.hasContent(), false);
  });
  test('toJSON eines neuen Models: _schema, Felder, Ansichtsfeld in Reihenfolge der Altform', () => {
    assertEqual(JSON.stringify(new State().toJSON()), JSON.stringify(EMPTY));
  });
});

suite('triz-contradiction-matrix Model — Stand ohne _schema (Altform)', () => {
  test('Altprojekt lädt über 0→1.0 ohne Reparatur, toJSON = _schema + Altstand', () => {
    assertEqual(thrown(() => State.fromJSON(plain(LEGACY_STATE))), null);
    const { m, fields } = repaired(plain(LEGACY_STATE));
    assertDeepEqual(fields, []);
    assertEqual(JSON.stringify(m.toJSON()), JSON.stringify(LEGACY));
  });
  test('Laden wie beim Einhängen ergibt denselben Stand', () => {
    assertEqual(JSON.stringify(loadModel(State, plain(LEGACY_STATE)).toJSON()), JSON.stringify(LEGACY));
  });
  test('Zahltexte werden Zahlen, Werte außerhalb 1 bis 39 null, Fremdes entfällt', () => {
    const m = State.fromJSON({ improving: '9', worsening: 40, problemNote: 7, showMatrix: 'ja', extra: 1 });
    assertEqual(JSON.stringify(m.toJSON()), JSON.stringify({ ...EMPTY, improving: 9, showMatrix: true }));
  });
  test('{} lädt als leeres Model', () => {
    const m = State.fromJSON({});
    assertEqual(JSON.stringify(m.toJSON()), JSON.stringify(EMPTY));
    assertEqual(m.hasContent(), false);
  });
});

suite('triz-contradiction-matrix Model — gespeicherter Stand 1.0', () => {
  test('lädt streng und ohne Reparatur, toJSON zeichengleich', () => {
    assertEqual(thrown(() => State.fromJSON(plain(LEGACY))), null);
    const { m, fields } = repaired(plain(LEGACY));
    assertDeepEqual(fields, []);
    assertEqual(JSON.stringify(m.toJSON()), JSON.stringify(LEGACY));
    assertEqual(JSON.stringify(loadModel(State, plain(LEGACY)).toJSON()), JSON.stringify(LEGACY));
  });
  test('läuft ohne Migrationsschritt: 40 bleibt ungültig statt von 0→1.0 auf null gesetzt zu werden', () => {
    assertTrue(thrown(() => State.fromJSON({ ...plain(LEGACY), improving: 40 })) instanceof Error);
  });
  test('Zahltext "9" nimmt die Feldart an und speichert die Zahl 9', () => {
    const m = State.fromJSON({ ...plain(LEGACY), improving: '9' });
    assertEqual(m.improving, 9);
    assertEqual(JSON.stringify(m.toJSON()), JSON.stringify({ ...LEGACY, improving: 9 }));
  });
  test('Schlüssel in fremder Reihenfolge kommen in Schema-Reihenfolge heraus', () => {
    const j = Object.fromEntries(Object.entries(plain(LEGACY)).reverse());
    assertEqual(JSON.stringify(State.fromJSON(j).toJSON()), JSON.stringify(LEGACY));
  });
  test('Rundweg toJSON → fromJSON ist verlustfrei, auch mit leerer Wahl', () => {
    for (const j of [LEGACY, { ...LEGACY, improving: null, worsening: null }]) {
      assertEqual(JSON.stringify(State.fromJSON(plain(State.fromJSON(plain(j)).toJSON())).toJSON()), JSON.stringify(j));
    }
  });
  test('improving 40 wirft streng; mit Reparatur wird nur dieses Feld null', () => {
    const j = { ...plain(LEGACY), improving: 40 };
    assertTrue(thrown(() => State.fromJSON(plain(j))) instanceof Error);
    const { m, fields } = repaired(j);
    assertDeepEqual(fields, ['improving']);
    assertDeepEqual(fieldsOf(m), { ...LEGACY_STATE, improving: null });
  });
  test('worsening 2.5 und Notiz 42: mit Reparatur nur diese Felder auf Vorgabe', () => {
    const { m, fields } = repaired({ ...plain(LEGACY), worsening: 2.5, problemNote: 42 });
    assertDeepEqual(fields, ['worsening', 'problemNote']);
    assertDeepEqual(fieldsOf(m), { ...LEGACY_STATE, worsening: null, problemNote: '' });
  });
});

suite('triz-contradiction-matrix Model — Versionsprüfung', () => {
  test('höhere Version 2.0 wird abgewiesen, auch mit Reparatur und beim Einhängen', () => {
    const v2 = { ...plain(LEGACY), _schema: { name: 'triz-contradiction-matrix', version: '2.0' } };
    assertThrows(() => State.fromJSON(v2), /_schema\.version/);
    assertThrows(() => State.fromJSON(v2, { repair: true }), /_schema\.version/);
    assertThrows(() => loadModel(State, v2), /_schema\.version/);
  });
  test('unlesbare Version wird abgewiesen, auch mit Reparatur', () => {
    const bad = { ...plain(LEGACY), _schema: { version: 'x' } };
    assertThrows(() => State.fromJSON(bad), /_schema\.version/);
    assertThrows(() => State.fromJSON(bad, { repair: true }), /_schema\.version/);
  });
});

suite('triz-contradiction-matrix Model — swapParams', () => {
  test('tauscht beide Parameter, Notiz und Ansicht bleiben; zweimal stellt her', () => {
    const m = State.fromJSON(plain(LEGACY));
    m.swapParams({});
    assertDeepEqual(fieldsOf(m), { ...LEGACY_STATE, improving: 33, worsening: 21 });
    m.swapParams({});
    assertDeepEqual(fieldsOf(m), LEGACY_STATE);
  });
  test('ein Wert leer: der andere wandert', () => {
    const m = new State();
    m.improving = 9;
    m.swapParams({});
    assertEqual(m.improving, null);
    assertEqual(m.worsening, 9);
  });
  test('gleiche Werte und leerer Stand: nichts ändert sich', () => {
    const m = new State();
    m.swapParams({});
    assertEqual(JSON.stringify(m.toJSON()), JSON.stringify(EMPTY));
    m.improving = 5;
    m.worsening = 5;
    m.swapParams({});
    assertEqual(m.improving, 5);
    assertEqual(m.worsening, 5);
  });
  test('über execute', () => {
    const m = new State();
    m.improving = 1;
    m.worsening = 3;
    m.execute({ type: 'swapParams' });
    assertEqual(m.improving, 3);
    assertEqual(m.worsening, 1);
  });
  test('unbekannter Parameter wird abgelehnt, Zustand unverändert', () => {
    const m = State.fromJSON(plain(LEGACY));
    assertTrue(thrown(() => m.swapParams(/** @type {any} */ ({ x: 1 }))) instanceof Error);
    assertDeepEqual(fieldsOf(m), LEGACY_STATE);
  });
});

suite('triz-contradiction-matrix Model — pickCell', () => {
  test('setzt beide Parameter, Notiz und Ansicht bleiben', () => {
    const m = State.fromJSON(plain(LEGACY));
    m.pickCell({ improving: 9, worsening: 14 });
    assertDeepEqual(fieldsOf(m), { ...LEGACY_STATE, improving: 9, worsening: 14 });
  });
  test('gleiches Paar wird angenommen', () => {
    const m = new State();
    m.pickCell({ improving: 5, worsening: 5 });
    assertEqual(m.improving, 5);
    assertEqual(m.worsening, 5);
  });
  test('über execute', () => {
    const m = new State();
    m.execute({ type: 'pickCell', improving: 1, worsening: 39 });
    assertEqual(m.improving, 1);
    assertEqual(m.worsening, 39);
  });
  const bad = [
    ['improving 0', { improving: 0, worsening: 3 }, 'improving'],
    ['improving 40', { improving: 40, worsening: 3 }, 'improving'],
    ['worsening 1.5', { improving: 1, worsening: 1.5 }, 'worsening'],
    ['worsening null', { improving: 1, worsening: null }, 'worsening'],
    ['improving true', { improving: true, worsening: 3 }, 'improving'],
  ];
  for (const [name, cmd, param] of bad) {
    test(`${name}: abgelehnt mit param ${param}, Zustand unverändert`, () => {
      const m = State.fromJSON(plain(LEGACY));
      const err = thrown(() => m.pickCell(/** @type {any} */ (cmd)));
      assertTrue(err instanceof Error);
      assertEqual(err.param, param);
      assertDeepEqual(fieldsOf(m), LEGACY_STATE);
    });
  }
  test('fehlender Parameter wird abgelehnt', () => {
    const m = new State();
    assertTrue(thrown(() => m.pickCell(/** @type {any} */ ({ improving: 1 }))) instanceof Error);
    assertEqual(m.improving, null);
  });
});

suite('triz-contradiction-matrix Model — Schreiben der Felder', () => {
  test('Werte 1 bis 39 und null werden angenommen', () => {
    const m = new State();
    for (const f of ['improving', 'worsening']) {
      m[f] = 1;
      assertEqual(m[f], 1);
      m[f] = 39;
      assertEqual(m[f], 39);
      m[f] = null;
      assertEqual(m[f], null);
    }
  });
  test('Zahltext "14" nimmt die Feldart an (wie jedes Zahlfeld) und speichert die Zahl 14', () => {
    for (const f of ['improving', 'worsening']) {
      const m = new State();
      m[f] = /** @type {any} */ ('14');
      assertEqual(m[f], 14, f);
    }
    const m = new State();
    m.pickCell(/** @type {any} */ ({ improving: '9', worsening: '14' }));
    assertEqual(m.improving, 9);
    assertEqual(m.worsening, 14);
  });
  for (const v of [40, 0, 1.5, true, '1,5', 'abc']) {
    test(`${JSON.stringify(v)} wird mit dem Feldnamen abgelehnt, Zustand unverändert`, () => {
      for (const f of ['improving', 'worsening']) {
        const m = State.fromJSON(plain(LEGACY));
        const err = thrown(() => { m[f] = v; });
        assertTrue(err instanceof Error, f);
        assertEqual(err.param, f);
        assertDeepEqual(fieldsOf(m), LEGACY_STATE);
      }
    });
  }
  test('Notiz nimmt jeden Text, auch leer; kein Text wird abgelehnt', () => {
    const m = new State();
    m.problemNote = '  a & <b>\n';
    assertEqual(m.problemNote, '  a & <b>\n');
    m.problemNote = '';
    assertEqual(m.problemNote, '');
    const err = thrown(() => { m.problemNote = /** @type {any} */ (7); });
    assertTrue(err instanceof Error);
    assertEqual(err.param, 'problemNote');
  });
});

suite('triz-contradiction-matrix Model — hasContent', () => {
  test('ein Parameter → true, zurückgenommen → false', () => {
    for (const f of ['improving', 'worsening']) {
      const m = new State();
      m[f] = 9;
      assertEqual(m.hasContent(), true, f);
      m[f] = null;
      assertEqual(m.hasContent(), false, f);
    }
  });
  test('Notiz → true', () => {
    const m = new State();
    m.problemNote = 'x';
    assertEqual(m.hasContent(), true);
  });
  test('showMatrix allein zählt nicht', () => {
    const m = new State();
    m.showMatrix = true;
    assertEqual(m.hasContent(), false);
  });
  test('Altprojekt → true', () => {
    assertEqual(State.fromJSON(plain(LEGACY_STATE)).hasContent(), true);
  });
});

suite('triz-contradiction-matrix Model — recommendation', () => {
  test('incomplete ohne Wahl und mit nur einem Parameter', () => {
    const m = new State();
    assertDeepEqual(recommendation(m), { status: 'incomplete', principles: [] });
    m.improving = 9;
    assertDeepEqual(recommendation(m), { status: 'incomplete', principles: [] });
  });
  test('sameParameter bei gleichem Paar, auch auf einer Diagonalzelle mit Liste', () => {
    const m = new State();
    m.pickCell({ improving: 32, worsening: 32 });
    assertDeepEqual(recommendation(m), { status: 'sameParameter', principles: [] });
  });
  test('noEntry bei leerer Zelle (Beispielpaar 9/39)', () => {
    const m = new State();
    m.pickCell({ improving: 9, worsening: 39 });
    assertDeepEqual(recommendation(m), { status: 'noEntry', principles: [] });
  });
  test('found: Prinzipien mit Namen und Beschreibung aus t, in Zellreihenfolge', () => {
    const m = State.fromJSON(plain(LEGACY_STATE));
    assertDeepEqual(recommendation(m), {
      status: 'found',
      principles: [26, 35, 10].map((id) => ({
        id, name: `T:principles.${id}.name`, description: `T:principles.${id}.description`,
      })),
    });
  });
  test('folgt dem Stand: nach swapParams die andere Zelle', () => {
    const m = new State();
    m.pickCell({ improving: 9, worsening: 14 });
    assertDeepEqual(recommendation(m).principles.map((p) => p.id), [8, 3, 26, 14]);
    m.pickCell({ improving: 14, worsening: 1 });
    assertDeepEqual(recommendation(m).principles.map((p) => p.id), [1, 8, 40, 15]);
  });
  test('ohne t wird ein Fehlereintrag statt zu werfen (nur bei found gebraucht)', () => {
    const m = new State();
    assertDeepEqual(evaluateDerived(m, /** @type {any} */ (undefined)).recommendation, { status: 'incomplete', principles: [] });
    m.pickCell({ improving: 1, worsening: 3 });
    assertTrue(typeof evaluateDerived(m, /** @type {any} */ (undefined)).recommendation.error === 'string');
  });
});
