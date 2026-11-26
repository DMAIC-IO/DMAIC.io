/**
 * D.Mike — Lessons Learned: Migrationen des gespeicherten Zustands.
 *
 * Reine Funktionen; jede beschreibt einen FESTEN Formatstand und importiert
 * darum nichts aus model.js (das Schema darf sich ändern, die Migration
 * nicht). Jeder Schritt liefert ein einfaches Objekt.
 */
import { getPhaseIds, DEFAULT_CYCLE } from '../../../core/cycles/cycles.js';

/** @param {unknown} v @returns {v is Record<string, any>} */
const isObject = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);

/** @param {unknown} v @returns {string} */
const textOr = (v) => (typeof v === 'string' ? v : '');

/** @param {unknown} v @returns {number} */
const stamp = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

const CATEGORIES = ['success', 'problem', 'improve'];
const IMPACTS = ['high', 'medium', 'low'];

/**
 * '0→1.0': jeder Stand ohne `_schema` (Altform, Beispiele, alte Exporte),
 * Erfahrung für Erfahrung wie das alte `Lesson.fromJSON`: Texte bleiben,
 * sonst leer; eine unbekannte Kategorie wird `success`, eine unbekannte
 * Wirkung `medium`; die Phase bleibt als jeder Text, sonst die letzte Phase
 * des Standardzyklus; Zeitstempel als endliche Zahl, sonst 0; je Maßnahme
 * nur Text und Haken (`id`, `owner`, `dueDate` entfallen). Die Vorform der
 * frühen Exporte (`text` statt `title`) gibt ihren Text als Titel weiter,
 * `date` entfällt. Was kein Objekt ist, entfällt. Vorhandene nichtleere
 * Text-ids bleiben; fehlt die id oder ist sie leer oder kein Text, wird sie
 * fest `l<Position>` (ab 1), damit ein nie gespeicherter Stand bei jedem
 * Lesen dieselbe id zeigt; eine spätere doppelte id und eine Ersatz-id, die
 * schon vergeben ist, bekommen `_` angehängt, bis sie frei sind.
 * @param {unknown} old gespeicherter Zustand ohne `_schema`
 * @returns {{ lessons: object[] }}
 */
export function from0(old) {
  const o = isObject(old) ? old : {};
  const list = Array.isArray(o.lessons) ? o.lessons : [];
  const fallbackPhase = getPhaseIds(DEFAULT_CYCLE).at(-1);
  const taken = new Set(list.filter(isObject).map((d) => d.id).filter((id) => typeof id === 'string' && id !== ''));
  const used = new Set();
  const lessons = [];
  list.forEach((d, i) => {
    if (!isObject(d)) return;
    const own = typeof d.id === 'string' && d.id !== '' ? d.id : null;
    let id = own;
    if (id === null || used.has(id)) {
      id = own ?? `l${i + 1}`;
      while (used.has(id) || taken.has(id)) id += '_';
      taken.add(id);
    }
    used.add(id);
    lessons.push({
      id,
      title: typeof d.title === 'string' ? d.title : textOr(d.text),
      category: CATEGORIES.includes(d.category) ? d.category : 'success',
      phase: typeof d.phase === 'string' ? d.phase : fallbackPhase,
      impact: IMPACTS.includes(d.impact) ? d.impact : 'medium',
      owner: textOr(d.owner),
      description: textOr(d.description),
      rootCause: textOr(d.rootCause),
      recommendation: textOr(d.recommendation),
      actions: Array.isArray(d.actions) ? d.actions.map((a) => ({
        text: isObject(a) ? textOr(a.text) : '',
        done: isObject(a) && typeof a.done === 'boolean' ? a.done : false,
      })) : [],
      createdAt: stamp(d.createdAt),
      updatedAt: stamp(d.updatedAt),
    });
  });
  return { lessons };
}
