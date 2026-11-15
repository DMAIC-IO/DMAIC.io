/**
 * D.Mike — Survey builder: gespeicherte Form der Antworten.
 *
 * Das Model kennt keine Vereinigungstypen. Gespeichert ist darum jede Antwort
 * als ein Objekt mit festen, optionalen Schlüsseln:
 *
 *   { option }        Einfachauswahl: id der gewählten Option
 *   { other }         Einfachauswahl: nur „Sonstige“-Text
 *   { ids, other? }   Mehrfachauswahl: ids und „Sonstige“-Text (auch null)
 *   { ratings }       Bewertung: Zeilen-id → 1–5 oder 'na'
 *   { kano }          Kano: Zeilen-id → { f, d, w }
 *   { text }          Freitext
 *
 * Die reinen Module (Bedingungen, Statistik, Bericht, Übergaben) lesen die
 * frühere Form — Text, `{ other }`, `{ ids, other }` oder eine Map über die
 * Zeilen-ids. `toStored`/`toLegacy` wandeln verlustfrei hin und zurück. Die
 * Rückrichtung folgt der gespeicherten Form, nicht dem Fragetyp: eine Antwort
 * aus der Zeit vor einem Typwechsel kommt unverändert zurück. Der Fragetyp
 * entscheidet nur, ob ein Text eine Option (`single`) oder ein Freitext ist.
 * Zeilenwerte werden nach ihrer Form verteilt (Zahl/'na' → `ratings`, Objekt
 * → `kano`), unbekannte Zeilen-ids bleiben erhalten.
 *
 * Werte, die keine Antwortform fassen kann (Zahl, Liste, `null`, ein
 * Zeilenwert außerhalb der Skala), entfallen — die Einleseprüfung
 * (`import.js`) erzeugt sie nie.
 */
import { findQuestion } from './conditions.js';

/** Bewertungsstufen einer gespeicherten Bewertung. */
const RATING_VALUES = Object.freeze([1, 2, 3, 4, 5, 'na']);

/** @param {unknown} v @returns {v is Record<string, any>} */
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** @param {unknown} v @param {number} max @returns {number|null} ganze Zahl in 1..max, sonst null */
const scale = (v, max) => (Number.isInteger(v) && /** @type {number} */ (v) >= 1 && /** @type {number} */ (v) <= max
  ? /** @type {number} */ (v) : null);

/**
 * Eine Kano-Zelle in fester Form; fehlende oder ungültige Werte werden null.
 * @param {Record<string, any>} v @returns {{ f: number|null, d: number|null, w: number|null }}
 */
function kanoCell(v) {
  return { f: scale(v.f, 5), d: scale(v.d, 5), w: scale(v.w, 9) };
}

/**
 * Eine Antwort in die gespeicherte Form.
 * @param {{ type: string }|null|undefined} q die Frage, undefined für eine unbekannte
 * @param {any} legacy Antwort in der früheren Form
 * @returns {Record<string, any>|undefined} gespeicherte Form, undefined, wenn keine Form sie fasst
 */
export function toStored(q, legacy) {
  if (typeof legacy === 'string') return q?.type === 'single' ? { option: legacy } : { text: legacy };
  if (!isObj(legacy)) return undefined;
  if (Array.isArray(legacy.ids)) {
    const out = { ids: legacy.ids.filter((id) => typeof id === 'string') };
    if (Object.hasOwn(legacy, 'other')) out.other = typeof legacy.other === 'string' ? legacy.other : null;
    return out;
  }
  const keys = Object.keys(legacy);
  if (keys.length === 1 && keys[0] === 'other' && (typeof legacy.other === 'string' || legacy.other === null)) {
    return { other: legacy.other };
  }
  const ratings = {};
  const kano = {};
  for (const [rowId, v] of Object.entries(legacy)) {
    if (rowId === '__proto__') continue;
    if (isObj(v)) kano[rowId] = kanoCell(v);
    else if (RATING_VALUES.includes(v)) ratings[rowId] = v;
  }
  return {
    ...(Object.keys(ratings).length ? { ratings } : {}),
    ...(Object.keys(kano).length ? { kano } : {}),
  };
}

/**
 * Eine gespeicherte Antwort in der früheren Form.
 * @param {{ type: string }|null|undefined} q die Frage; ohne Frage gibt es keine Antwort
 * @param {Record<string, any>} stored gespeicherte Form
 * @returns {any} Antwort in der früheren Form, undefined ohne Frage
 */
export function toLegacy(q, stored) {
  if (!q || !isObj(stored)) return undefined;
  if (stored.option !== undefined) return stored.option;
  if (stored.text !== undefined) return stored.text;
  if (stored.ids !== undefined) return stored.other !== undefined ? { ids: [...stored.ids], other: stored.other } : { ids: [...stored.ids] };
  if (stored.other !== undefined) return { other: stored.other };
  const out = { ...(stored.ratings ?? {}) };
  for (const [rowId, cell] of Object.entries(stored.kano ?? {})) out[rowId] = { ...cell };
  return out;
}

/**
 * Alle Antworten einer Antwortdatei in die gespeicherte Form; auch die
 * Antworten unbekannter Fragen bleiben.
 * @param {object} survey der Fragebogen
 * @param {Record<string, any>} legacyAnswers Frage-id → Antwort in der früheren Form
 * @returns {Record<string, Record<string, any>>}
 */
export function storedAnswers(survey, legacyAnswers) {
  /** @type {Record<string, Record<string, any>>} */
  const out = {};
  for (const [questionId, a] of Object.entries(isObj(legacyAnswers) ? legacyAnswers : {})) {
    if (questionId === '__proto__') continue;
    const stored = toStored(findQuestion(survey, questionId), a);
    if (stored !== undefined) out[questionId] = stored;
  }
  return out;
}

/**
 * Die Antworten einer Antwort in der früheren Form; Antworten auf Fragen, die
 * es nicht mehr gibt, entfallen.
 * @param {object} survey der Fragebogen
 * @param {Record<string, Record<string, any>>} stored Frage-id → gespeicherte Form
 * @returns {Record<string, any>}
 */
export function legacyAnswers(survey, stored) {
  const out = {};
  for (const [questionId, s] of Object.entries(stored ?? {})) {
    const a = toLegacy(findQuestion(survey, questionId), s);
    if (a !== undefined) out[questionId] = a;
  }
  return out;
}

/**
 * Die Antworten des Models mit den Antworten in der früheren Form — die
 * Eingabe der reinen Module. Schlichte Kopien.
 * @param {{ survey: object, responses: ReadonlyArray<Record<string, any>> }} model
 * @returns {Array<{ id: string, surveyVersion: number, recipientId: string|null, viaRecipient: boolean,
 *   submittedAt: string, answers: Record<string, any> }>}
 */
export function legacyResponses(model) {
  return model.responses.map((r) => ({
    id: r.id,
    surveyVersion: r.surveyVersion,
    recipientId: r.recipientId,
    viaRecipient: r.viaRecipient,
    submittedAt: r.submittedAt,
    answers: legacyAnswers(model.survey, r.answers),
  }));
}
