/**
 * Tests for core/interaction/machine.js — Zustandsautomat einer Geste
 * (Spec C §4.1): Schwelle, Klick, Abbruchpfade, eine aktive Geste.
 */
import { suite, test, assertEqual, assertTrue } from '../../test-utils.js';
import { THRESHOLD, IDLE, next, claim, release } from '../../../js/core/interaction/machine.js';

const press = (x = 0, y = 0, pointerId = 1) => next(IDLE, { type: 'press', pointerId, x, y });

suite('interaction/machine — Zeiger', () => {
  test('Schwelle ist 4 px', () => assertEqual(THRESHOLD, 4));

  test('press → pressed mit Ursprung', () => {
    const s = press(10, 20);
    assertEqual(s.phase, 'pressed');
    assertEqual(s.source, 'pointer');
    assertEqual(s.origin.x, 10);
    assertEqual(s.origin.y, 20);
  });

  test('unter der Schwelle bleibt pressed', () => {
    const s = next(press(), { type: 'move', pointerId: 1, x: 2, y: 3 });
    assertEqual(s.phase, 'pressed');
  });

  test('ab 4 px → dragging', () => {
    const s = next(press(), { type: 'move', pointerId: 1, x: 4, y: 0 });
    assertEqual(s.phase, 'dragging');
  });

  test('Loslassen ohne Schwelle ist ein Klick → idle', () => {
    const s = next(press(), { type: 'release', pointerId: 1 });
    assertEqual(s, IDLE);
  });

  test('Loslassen nach Schwelle → dropped, reset → idle', () => {
    let s = next(press(), { type: 'move', pointerId: 1, x: 10, y: 0 });
    s = next(s, { type: 'release', pointerId: 1 });
    assertEqual(s.phase, 'dropped');
    assertEqual(next(s, { type: 'reset' }), IDLE);
  });

  test('pointercancel während dragging → cancelled', () => {
    let s = next(press(), { type: 'move', pointerId: 1, x: 10, y: 0 });
    s = next(s, { type: 'cancel', source: 'pointer' });
    assertEqual(s.phase, 'cancelled');
    assertEqual(next(s, { type: 'reset' }), IDLE);
  });

  test('pointercancel während pressed → idle', () => {
    assertEqual(next(press(), { type: 'cancel', source: 'pointer' }), IDLE);
  });

  test('fremder Zeiger wird ignoriert', () => {
    const s = press();
    assertEqual(next(s, { type: 'move', pointerId: 2, x: 50, y: 50 }), s);
    assertEqual(next(s, { type: 'release', pointerId: 2 }), s);
  });

  test('zweiter Druck während einer Geste wird ignoriert', () => {
    const s = press();
    assertEqual(next(s, { type: 'press', pointerId: 2, x: 9, y: 9 }), s);
  });

  test('Tastatur während einer Zeiger-Geste wird ignoriert', () => {
    const s = next(press(), { type: 'move', pointerId: 1, x: 10, y: 0 });
    assertEqual(next(s, { type: 'pick' }), s);
    assertEqual(next(s, { type: 'drop' }), s);
    assertEqual(next(s, { type: 'cancel', source: 'keyboard' }), s);
  });
});

suite('interaction/machine — Tastatur', () => {
  test('pick → dragging sofort', () => {
    const s = next(IDLE, { type: 'pick' });
    assertEqual(s.phase, 'dragging');
    assertEqual(s.source, 'keyboard');
  });

  test('drop → dropped', () => {
    const s = next(next(IDLE, { type: 'pick' }), { type: 'drop' });
    assertEqual(s.phase, 'dropped');
  });

  test('cancel (Esc/Tab/Fokusverlust) → cancelled', () => {
    const s = next(next(IDLE, { type: 'pick' }), { type: 'cancel', source: 'keyboard' });
    assertEqual(s.phase, 'cancelled');
  });

  test('Zeiger-Druck während Tastatur-Aufnahme wird ignoriert', () => {
    const s = next(IDLE, { type: 'pick' });
    assertEqual(next(s, { type: 'press', pointerId: 1, x: 0, y: 0 }), s);
  });

  test('reset aus idle/dragging ändert nichts', () => {
    assertEqual(next(IDLE, { type: 'reset' }), IDLE);
    const s = next(IDLE, { type: 'pick' });
    assertEqual(next(s, { type: 'reset' }), s);
  });
});

suite('interaction/machine — eine Geste je Dokument', () => {
  test('claim/release', () => {
    const doc = {}; const a = {}; const b = {};
    assertTrue(claim(doc, a));
    assertTrue(claim(doc, a), 'derselbe Besitzer darf erneut');
    assertTrue(!claim(doc, b), 'ein zweiter Besitzer nicht');
    release(doc, b);
    assertTrue(!claim(doc, b), 'release eines Fremden löst nichts');
    release(doc, a);
    assertTrue(claim(doc, b));
    release(doc, b);
  });
});
