/**
 * D.Mike — Kano: Auswertung mit Merker. Rein.
 *
 * `evaluation(m)` ruft die Engine (`engines/kano-engine.js`) über Merkmale,
 * Befragte, Antworten und Optionen des Models. Der Merker hält je Model das
 * letzte Ergebnis samt Signatur dieser vier Felder; Modul, Kachel und Export
 * lesen dasselbe Ergebnis, die Engine läuft je Änderung einmal.
 */
import { evaluate } from '../../../engines/kano-engine.js';

/**
 * Die drei Antworten einer Befragten zu einem Merkmal.
 * @typedef {object} AnswerField
 * @property {number|null} f  funktionale Frage, 1–5
 * @property {number|null} d  dysfunktionale Frage, 1–5
 * @property {number|null} w  Wichtigkeit, 1–9
 */

/**
 * Die Auswertung: je Merkmal eine Zeile und die Kennzahlen insgesamt.
 * @typedef {object} KanoEvaluation
 * @property {KanoRow[]} rows  je Merkmal eine Zeile, nach Kategorie sortiert
 * @property {KanoTotals} totals  Kennzahlen über alle Merkmale
 */

/**
 * @typedef {object} KanoRow
 * @property {string} itemId  Merkmal
 * @property {string} label  Name des Merkmals
 * @property {string} path  Herkunft im Baum
 * @property {boolean} missing  im Quellbaum nicht mehr vorhanden
 * @property {KanoCounts} counts  Antworten je Kategorie
 * @property {number} n  klassifizierte Antworten
 * @property {number} unanswered  nicht klassifizierbare Antworten
 * @property {'M'|'O'|'A'|'I'|'R'|'Q'|null} category  häufigste Kategorie
 * @property {boolean} tie  Gleichstand an der Spitze
 * @property {number|null} cs  Zufriedenheitskoeffizient (Better)
 * @property {number|null} ds  Unzufriedenheitskoeffizient (Worse)
 * @property {number|null} importanceMean  mittlere Wichtigkeit
 * @property {number} importanceN  Zahl der Wichtigkeitsangaben
 */

/**
 * @typedef {object} KanoCounts
 * @property {number} M  Muss
 * @property {number} O  Leistung
 * @property {number} A  Begeisterung
 * @property {number} I  indifferent
 * @property {number} R  umgekehrt
 * @property {number} Q  widersprüchlich
 */

/**
 * @typedef {object} KanoTotals
 * @property {number} items  Zahl der Merkmale
 * @property {number} respondents  Zahl der Befragten
 * @property {number} completeness  Anteil klassifizierter Antworten, 0–1
 * @property {number} qShare  Anteil widersprüchlicher Antworten, 0–1
 */

/**
 * @typedef {{ items: ReadonlyArray<any>, respondents: ReadonlyArray<any>,
 *   answers: Readonly<Record<string, any>>, options: { importance: boolean } }} EvalInput
 */

/** Model → { sig, result } des letzten Aufrufs. @type {WeakMap<object, { sig: string, result: KanoEvaluation }>} */
const memo = new WeakMap();

/** Zahl der Engine-Läufe (für Tests des Merkers). */
let runs = 0;

/** @returns {number} Engine-Läufe seit dem Laden */
export function evaluationRuns() { return runs; }

/**
 * Die Auswertung des Models; gleiche Eingaben liefern dasselbe Objekt.
 * @param {EvalInput} m
 * @returns {KanoEvaluation}
 */
export function evaluation(m) {
  const input = { items: m.items, respondents: m.respondents, answers: m.answers, options: m.options };
  const sig = JSON.stringify(input);
  const hit = memo.get(m);
  if (hit && hit.sig === sig) return hit.result;
  runs += 1;
  const result = /** @type {KanoEvaluation} */ (evaluate(
    /** @type {any} */ (m.items), /** @type {any} */ (m.respondents), m.answers, m.options,
  ));
  memo.set(m, { sig, result });
  return result;
}
