/**
 * D.Mike — Project charter: view-Teil Ziele.
 *
 * Farbstufe und Balken der Zielerreichung, Markierung vergangener Zieldaten,
 * das Klemmen der Zielerreichung auf 0..100 beim Verlassen des Felds, Löschen
 * mit zwei Klicks und die Vorschau beim Umsortieren. Anlegen läuft im
 * Template über `x-command`, Texte über `x-model`.
 */
import { setFields } from '../../../core/model.js';
import { parseNumber } from '../../../core/number-format.js';
import { zegLevel, isDateInPast } from '../domain/goals.js';

/** @typedef {import('../domain/model.types.js').StateModel['goals'][number]} Goal */

/**
 * Wert eines Eingabefelds als Zielerreichung: ganze Zahl in 0..100; was keine
 * Zahl ist, wird 0.
 * @param {string} raw @returns {number}
 */
function clampPercent(raw) {
  const n = parseNumber(raw);
  const v = typeof n === 'number' && Number.isFinite(n) ? Math.trunc(n) : 0;
  return Math.max(0, Math.min(100, v));
}

/** @type {import('./state.types.js').ProjectCharterViewFn} */
export const goalsView = (_ctx) => ({
  /** Klasse der Farbstufe (Balken, Häkchen). @param {Goal} g @returns {string} */
  zegClass(g) { return `pc__zeg-level--${zegLevel(g.achievementLevel)}`; },

  /** Breite des Balkens. @param {Goal} g @returns {string} */
  zegWidth(g) { return `width: ${Math.max(0, Math.min(100, g.achievementLevel))}%`; },

  /** Ist das Ziel vollständig erreicht? @param {Goal} g @returns {boolean} */
  isDone(g) { return zegLevel(g.achievementLevel) === 'done'; },

  /** Liegt das Zieldatum vor heute? @param {Goal} g @returns {boolean} */
  isPast(g) { return isDateInPast(g.targetDate); },

  /**
   * Zielerreichung beim Verlassen des Felds auf 0..100 klemmen (150 → 100).
   * Läuft vor `x-field`, das danach den geklemmten Wert im Feld vorfindet.
   * @param {Goal} g @param {Event} ev
   */
  clampLevel(g, ev) {
    const input = /** @type {HTMLInputElement} */ (ev.target);
    const level = clampPercent(input.value);
    input.value = String(level);
    if (level === g.achievementLevel) return;
    const goals = this.model.goals.map((x) => ({ ...x, achievementLevel: x.id === g.id ? level : x.achievementLevel }));
    setFields(this.model, { goals });
  },

  /** Wartet das Ziel auf den zweiten Klick zum Löschen? @param {string} id @returns {boolean} */
  isConfirming(id) { return this.state.confirmGoalId === id; },

  /**
   * Löschen mit zwei Klicks: der erste fragt nach, der zweite löscht.
   * @param {string} id
   */
  askRemoveGoal(id) {
    if (this.state.confirmGoalId === id) {
      this.state.confirmGoalId = null;
      this.model.removeGoal({ id });
    } else {
      this.state.confirmGoalId = id;
    }
  },

  /** Ein Klick außerhalb der Zeile nimmt die Nachfrage zurück. @param {string} id */
  cancelRemoveGoal(id) {
    if (this.state.confirmGoalId === id) this.state.confirmGoalId = null;
  },

  /**
   * Vorschau der Zeilen-Geste: gezogene Zeile oder Zeile, vor der sie landet.
   * @param {string} id @returns {string}
   */
  goalPreviewClass(id) {
    const p = this.state.goalDragPreview;
    if (!p) return '';
    if (p.id === id) return 'dmike-table__row--dragging';
    const rest = this.model.goals.map((x) => x.id).filter((x) => x !== p.id);
    return rest[p.index] === id ? 'dmike-table__row--drop-target' : '';
  },
});
