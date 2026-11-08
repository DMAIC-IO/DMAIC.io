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

/** Wie `loadT`, aber mit den echten Modultexten (resources/i18n/ui.en.json): Hinweise lassen sich dann im Wortlaut prüfen. */
export async function loadRealT() {
  const [core, ui] = await Promise.all([
    fetch(new URL('../../i18n/en.json', import.meta.url)).then((r) => r.json()),
    fetch(new URL('../../js/modules/hypothesis-test/resources/i18n/ui.en.json', import.meta.url)).then((r) => r.json()),
  ]);
  const i18n = new I18n('en');
  i18n._cache.set('en', core);
  i18n.mergeModule('hypothesis-test', 'en', ui);
  return i18n.tf('modules.hypothesis-test');
}

/** Bonett-Verhältnis: n = 150 gegen n = 6, rechtsschief — das Konfidenzgebiet zerfällt, es gibt kein Intervall. */
export const BONETT_SPLIT_LARGE = [
  0.923, 0.139, 1.062, 0.169, 1.055, 14.721, 6.623, 0.364, 4.793, 2.176, 0.423, 2.493, 4.166, 1.023, 1.272,
  3.076, 1.564, 0.213, 5.506, 0.336, 0.047, 0.493, 0.18, 16.061, 0.859, 2.497, 0.278, 3.275, 12.349, 0.078,
  0.094, 0.431, 2.512, 12.64, 1.121, 4.876, 0.09, 2.265, 13.551, 4.864, 2.491, 8.681, 2.303, 30.33, 0.498,
  0.606, 0.208, 0.936, 2.126, 0.146, 0.086, 0.924, 0.5, 0.187, 0.508, 0.192, 0.023, 1.198, 0.413, 0.105,
  1.042, 28.11, 0.229, 0.394, 3.102, 0.103, 7.072, 0.083, 18.908, 0.068, 16.097, 2.368, 1.306, 0.143, 2.183,
  1.627, 0.566, 2.223, 0.766, 0.208, 2.075, 0.38, 2.383, 0.333, 0.206, 11.386, 0.414, 0.957, 0.299, 2.932,
  0.09, 1.289, 1.687, 4.47, 0.71, 0.139, 0.539, 4.006, 0.322, 0.901, 0.839, 0.156, 0.166, 0.107, 3.035,
  1.029, 2.973, 1.342, 6.504, 9.548, 0.124, 0.311, 3.044, 0.059, 0.963, 0.291, 1.099, 3.997, 1.309, 6.465,
  0.099, 1.199, 1.688, 1.757, 2.311, 0.282, 1.002, 0.16, 0.383, 0.965, 0.146, 3.079, 0.578, 2.919, 1.405,
  1.548, 3.026, 0.178, 1.521, 0.187, 12.73, 0.352, 1.579, 0.196, 0.999, 5.808, 0.542, 1.888, 0.347, 0.709,
];
export const BONETT_SPLIT_SMALL = [1.504, 2.182, 0.531, 2.827, 0.07, 0.178];
