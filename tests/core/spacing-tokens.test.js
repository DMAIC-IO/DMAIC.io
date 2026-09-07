/**
 * Abstands-Token — die Skala ist der Vertrag, auf den jedes Modul-CSS baut.
 * Hauptreihe s/m/l = 6/12/24 (Verdopplung),
 * sm/ml als Zwischenschritte, x/2x als Erweiterung nach außen.
 */
import { suite, test, assertEqual } from '../test-utils.js';

/** Liest ein Custom Property vom :root und gibt es getrimmt zurück. */
function token(name) {
  return getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
}

suite('Abstands-Token', () => {
  test('die neun Stufen haben die festgelegten Pixelwerte', () => {
    assertEqual(token('--spacing-2xs'), '2px');
    assertEqual(token('--spacing-xs'), '4px');
    assertEqual(token('--spacing-s'), '6px');
    assertEqual(token('--spacing-sm'), '8px');
    assertEqual(token('--spacing-m'), '12px');
    assertEqual(token('--spacing-ml'), '16px');
    assertEqual(token('--spacing-l'), '24px');
    assertEqual(token('--spacing-xl'), '32px');
    assertEqual(token('--spacing-2xl'), '48px');
  });

  test('die Hauptreihe s/m/l verdoppelt sich', () => {
    const px = (n) => parseInt(token(n), 10);
    assertEqual(px('--spacing-m'), px('--spacing-s') * 2);
    assertEqual(px('--spacing-l'), px('--spacing-m') * 2);
  });

  test('die Zwischenschritte liegen zwischen ihren Nachbarn', () => {
    const px = (n) => parseInt(token(n), 10);
    assertEqual(px('--spacing-sm') > px('--spacing-s'), true);
    assertEqual(px('--spacing-sm') < px('--spacing-m'), true);
    assertEqual(px('--spacing-ml') > px('--spacing-m'), true);
    assertEqual(px('--spacing-ml') < px('--spacing-l'), true);
  });

  test('die deprecated Alias liefern denselben Wert wie ihr Nachfolger', () => {
    // md und lg bleiben funktionsfähig, damit Welle 1 und die Modul-Migration
    // entkoppelt bleiben. Ihr Aufräumen ist bewusst nicht Teil dieser Arbeit.
    assertEqual(token('--spacing-md'), token('--spacing-ml'));
    assertEqual(token('--spacing-lg'), token('--spacing-l'));
  });

  test('kein bestehender Wert hat sich verschoben', () => {
    // Regressionsschutz: die Skala wurde rein additiv ergänzt.
    assertEqual(token('--spacing-xs'), '4px');
    assertEqual(token('--spacing-sm'), '8px');
    assertEqual(token('--spacing-md'), '16px');
    assertEqual(token('--spacing-lg'), '24px');
    assertEqual(token('--spacing-xl'), '32px');
  });
});
