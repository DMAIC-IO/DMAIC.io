/**
 * Tests for modules/triz-ifr/domain/migrations.js — Schritt '0→1.0' für
 * Stände ohne `_schema`: Texte bleiben, Nicht-Text wird leer, fremde
 * Schlüssel entfallen.
 */
import { suite, test, assertEqual, assertDeepEqual } from '../../test-utils.js';
import { from0 } from '../../../js/modules/triz-ifr/domain/migrations.js';

const FULL = {
  system: 'Bandförderer',
  usefulFunction: ' fördert Schüttgut ',
  harmfulEffect: 'Partikel verklemmen',
  ifr1: 'Der Förderer hält sich selbst frei.',
  ifr2: 'Es gibt nichts, was verklemmt.',
  ifr3: 'Die Schwerkraft löst die Brücke.',
  obstacles: '• Winkel < Schüttwinkel\n• Korn zu breit',
};
const EMPTY = { system: '', usefulFunction: '', harmfulEffect: '', ifr1: '', ifr2: '', ifr3: '', obstacles: '' };

suite('triz-ifr Migration 0→1.0', () => {
  test('vollständiger Stand bleibt zeichengleich, in gespeicherter Reihenfolge', () => {
    const out = from0(JSON.parse(JSON.stringify(FULL)));
    assertDeepEqual(out, FULL);
    assertDeepEqual(Object.keys(out), Object.keys(FULL));
  });
  test('Zahl, null, Objekt, Liste, Wahrheitswert → leerer Text', () => {
    const out = from0({ ...FULL, system: 42, usefulFunction: null, ifr1: { a: 1 }, ifr2: ['x'], obstacles: true });
    assertDeepEqual(out, { ...FULL, system: '', usefulFunction: '', ifr1: '', ifr2: '', obstacles: '' });
  });
  test('fremder Schlüssel entfällt', () => {
    const out = from0({ ...FULL, extra: 'weg', notes: 1 });
    assertDeepEqual(out, FULL);
  });
  test('leeres Objekt und Nicht-Objekt → alle Felder leer', () => {
    for (const v of [{}, null, 'x', 7, []]) assertDeepEqual(from0(v), EMPTY);
  });
  test('Ergebnis ist ein einfaches Objekt', () => {
    assertEqual(Object.getPrototypeOf(from0({})), Object.prototype);
  });
});
