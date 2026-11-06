/**
 * Gemeinsame Testdaten der Hypothesentest-Suiten (Analyse und Anzeige).
 */
import { I18n } from '../../js/core/i18n.js';

const SHAPE = [-1.5, -0.9, -0.4, -0.1, 0.1, 0.4, 0.9, 1.5];
/** Drei normale Gruppen (AD p ≈ 0.99) mit deutlich verschiedenen Varianzen. */
export const NORMAL_GROUPS = [SHAPE.map(x => 10 + x), SHAPE.map(x => 12 + 2 * x), SHAPE.map(x => 15 + 0.5 * x)];
/** Drei rechtsschiefe Gruppen mit n = 8 (AD lehnt ab) → Rangweg. */
export const SKEWED_GROUPS = [
  [1, 1.1, 1.2, 1.3, 1.4, 1.5, 9, 10],
  [2, 2.1, 2.2, 2.3, 2.4, 2.5, 11, 12],
  [3, 3.1, 3.2, 3.3, 3.4, 3.5, 13, 14],
];

/** Die Gruppen des Buchfalls Abb. 4.7 aus den ANOVA-Fixtures. */
export async function bookGroups() {
  const res = await fetch(new URL('../fixtures/hypothesis/one-way-anova.fixtures.json', import.meta.url));
  const json = await res.json();
  return json.test_cases.find(c => c.id === 'book_abb_4_7').inputs.groups;
}

/** Englischer Modul-Übersetzer aus dem echten en.json. */
export async function loadT() {
  const res = await fetch(new URL('../../i18n/en.json', import.meta.url));
  const i18n = new I18n('en');
  i18n._cache.set('en', await res.json());
  return i18n.tf('modules.hypothesis-test');
}
