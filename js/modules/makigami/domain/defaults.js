/**
 * D.Mike — Makigami: die mitgelieferten Verschwendungsarten und Zeiteinheiten.
 *
 * Für Migration, Reparatur und „Auf Standard zurücksetzen“. Das Schema in
 * `model.js` trägt dieselben Werte als Literal (`default`); die Gleichheit
 * sichert ein Unit-Test. Die Hexfarben der Arten sind Daten, keine
 * Themenfarben.
 */

/** Die Textschlüssel der mitgelieferten Arten (relativ zu `modules.makigami.`). */
export const MUDA_LABEL_KEYS = Object.freeze([
  'muda.transport', 'muda.inventory', 'muda.motion', 'muda.waiting',
  'muda.overproduction', 'muda.overprocessing', 'muda.defects', 'muda.skills',
]);

/**
 * Die acht Arten von TIMWOODS+S; `label` leer heißt, es gilt der Text zu
 * `labelKey`.
 * @returns {Array<{ id: string, code: string, labelKey: string, label: string, color: string }>}
 */
export function createDefaultMudaCategories() {
  return [
    { id: 'muda-transport', code: 'T', labelKey: 'muda.transport', label: '', color: '#4a90e2' },
    { id: 'muda-inventory', code: 'I', labelKey: 'muda.inventory', label: '', color: '#f5a623' },
    { id: 'muda-motion', code: 'M', labelKey: 'muda.motion', label: '', color: '#9b59b6' },
    { id: 'muda-waiting', code: 'W', labelKey: 'muda.waiting', label: '', color: '#d0021b' },
    { id: 'muda-overproduction', code: 'O', labelKey: 'muda.overproduction', label: '', color: '#50e3c2' },
    { id: 'muda-overprocessing', code: 'O+', labelKey: 'muda.overprocessing', label: '', color: '#f8a01c' },
    { id: 'muda-defects', code: 'D', labelKey: 'muda.defects', label: '', color: '#bd10e0' },
    { id: 'muda-skills', code: 'S', labelKey: 'muda.skills', label: '', color: '#7ed321' },
  ];
}

/**
 * Die vier Zeiteinheiten; ein Arbeitstag zählt 8 h = 28800 s.
 * @returns {Array<{ id: string, label: string, factorSeconds: number }>}
 */
export function createDefaultTimeUnits() {
  return [
    { id: 'unit-s', label: 's', factorSeconds: 1 },
    { id: 'unit-min', label: 'min', factorSeconds: 60 },
    { id: 'unit-h', label: 'h', factorSeconds: 3600 },
    { id: 'unit-d', label: 'd', factorSeconds: 28800 },
  ];
}
