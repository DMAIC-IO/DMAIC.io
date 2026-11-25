/**
 * Tests for modules/triz-physical-contradiction/domain/migrations.js —
 * Schritt '0→1.0' für Stände ohne `_schema`: wie das alte `State.fromJSON`
 * (jeder Text Text oder leer; je Trennungsprinzip die Notiz Text oder leer;
 * Wahl aus der Liste oder `null`; Fremdes entfällt).
 */
import { suite, test, assertEqual, assertDeepEqual } from '../../test-utils.js';
import { from0 } from '../../../js/modules/triz-physical-contradiction/domain/migrations.js';

const PRINC = ['time', 'space', 'condition', 'system'];
const TEXTS = ['parameter', 'requirementA', 'requirementNotA', 'problemNote', 'solutionNote'];
const EMPTY_NOTES = { time: '', space: '', condition: '', system: '' };
const EMPTY = {
  parameter: '', requirementA: '', requirementNotA: '', problemNote: '',
  principleNotes: EMPTY_NOTES, selectedPrinciple: null, solutionNote: '',
};

/** Vollständiger Stand in gespeicherter Reihenfolge, mit Mehrzeiligem. */
const FULL = {
  parameter: 'Länge des Tragflügels',
  requirementA: 'lang & "hoch"',
  requirementNotA: 'kurz <niedrig>',
  problemNote: 'Lehrbeispiel\nzweite Zeile',
  principleNotes: { time: 'Schwenkflügel', space: '', condition: 'Klappen\nnur langsam', system: 'Vorflügel' },
  selectedPrinciple: 'time',
  solutionNote: 'Mechanik\nund Klappen',
};

const plain = (v) => JSON.parse(JSON.stringify(v));

suite('triz-physical-contradiction Migration 0→1.0', () => {
  test('vollständiger Stand bleibt zeichengleich, in gespeicherter Reihenfolge', () => {
    assertEqual(JSON.stringify(from0(plain(FULL))), JSON.stringify(FULL));
  });
  test('Schlüssel in fremder Reihenfolge kommen geordnet heraus', () => {
    const reversed = Object.fromEntries(Object.entries(plain(FULL)).reverse());
    reversed.principleNotes = Object.fromEntries(Object.entries(FULL.principleNotes).reverse());
    assertEqual(JSON.stringify(from0(reversed)), JSON.stringify(FULL));
  });
  test('jeder Text, der kein Text ist, wird leer; die übrigen bleiben', () => {
    for (const name of TEXTS) {
      for (const v of [42, null, { a: 1 }, ['x'], true, undefined]) {
        const out = from0({ ...plain(FULL), [name]: v });
        assertDeepEqual(out, { ...FULL, [name]: '' }, `${name} ${JSON.stringify(v)}`);
      }
    }
  });
  test('Notiz eines Prinzips kein Text → leer, die anderen Notizen bleiben', () => {
    for (const v of [42, null, { a: 1 }, ['x'], true, undefined]) {
      const j = plain(FULL);
      j.principleNotes.condition = v;
      assertDeepEqual(from0(j).principleNotes, { ...FULL.principleNotes, condition: '' }, JSON.stringify(v));
    }
  });
  test('fehlendes Prinzip → leere Notiz', () => {
    const j = plain(FULL);
    delete j.principleNotes.system;
    assertDeepEqual(from0(j).principleNotes, { ...FULL.principleNotes, system: '' });
  });
  test('principleNotes kein Objekt (auch Liste) → vier leere Notizen', () => {
    for (const pn of [null, undefined, 'x', 7, true, ['a', 'b'], []]) {
      assertDeepEqual(from0({ ...plain(FULL), principleNotes: pn }).principleNotes, EMPTY_NOTES, JSON.stringify(pn));
    }
  });
  test('fremde Prinzipien und fremde Schlüssel entfallen', () => {
    const j = plain(FULL);
    j.principleNotes.energy = 'weg';
    j.extra = 1;
    j._version = '0.0';
    assertEqual(JSON.stringify(from0(j)), JSON.stringify(FULL));
  });
  test('jede gültige Wahl bleibt', () => {
    for (const k of PRINC) assertEqual(from0({ selectedPrinciple: k }).selectedPrinciple, k);
  });
  test('Wahl außerhalb der Liste → null', () => {
    for (const v of ['zeit', 'TIME', '', 0, 1, true, null, undefined, ['time'], { time: 1 }]) {
      assertEqual(from0({ ...plain(FULL), selectedPrinciple: v }).selectedPrinciple, null, JSON.stringify(v));
    }
  });
  test('leeres Objekt und Nicht-Objekt → Vorgabe', () => {
    for (const v of [{}, null, undefined, 'x', 7, true, []]) assertDeepEqual(from0(v), EMPTY, JSON.stringify(v));
  });
  test('Ergebnis ist ein einfaches Objekt in Schlüsselreihenfolge', () => {
    const out = from0({});
    assertDeepEqual(Object.keys(out), [
      'parameter', 'requirementA', 'requirementNotA', 'problemNote', 'principleNotes', 'selectedPrinciple', 'solutionNote',
    ]);
    assertDeepEqual(Object.keys(out.principleNotes), PRINC);
    assertEqual(Object.getPrototypeOf(out), Object.prototype);
    assertEqual(Object.getPrototypeOf(out.principleNotes), Object.prototype);
  });
});
