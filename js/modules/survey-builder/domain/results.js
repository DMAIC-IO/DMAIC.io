/**
 * D.Mike — Survey builder: die Auswertung als Zahlen (`derived.results`).
 *
 * Dieselben Kennzahlen wie der Reiter „Auswertung“ unter dem aktiven Filter
 * und der aktiven Gruppierung — ohne Texte der Oberfläche, ohne `t`. Ein
 * Filter oder eine Gruppierung, die nicht (mehr) passt, gilt als nicht
 * gesetzt. Die reinen Module (`stats.js`) lesen die Antworten in der früheren
 * Form (`legacyResponses`).
 */
import { documentOrder, findQuestion } from './conditions.js';
import {
  filterResponses, questionStats, responseRate, ratingRanking, kanoOverview, freeTextSummary, groupComparison,
} from './stats.js';
import { legacyResponses } from './answers.js';

/**
 * Rücklaufquote. Sätze je Eigenschaft unter `types.ResponseRate.<name>`.
 *
 * @typedef {object} ResponseRate
 * @property {number} sent  Empfänger, die ihre Datei bekommen haben
 * @property {number} answered  davon beantwortet
 * @property {number|null} rate  beantwortet geteilt durch verschickt, null ohne Versand
 * @property {number} withoutRecipient  Antworten ohne bekannten Empfänger
 * @property {Array<{group: string, sent: number, answered: number, rate: number|null}>} groups  dasselbe je Empfängergruppe
 */

/**
 * Eine Antwortoption mit ihrer Häufigkeit. Sätze unter `types.OptionStat.<name>`.
 *
 * @typedef {object} OptionStat
 * @property {string} id  Id der Option
 * @property {string} text  Text der Option
 * @property {number} count  wie oft gewählt
 * @property {number|null} share  Anteil an den Antworten auf die Frage
 */

/**
 * Eine Bewertungszeile. Sätze unter `types.RatingStatRow.<name>`.
 *
 * @typedef {object} RatingStatRow
 * @property {string} id  Id der Zeile
 * @property {string} text  Text der Zeile
 * @property {number} n  Antworten mit einer Bewertung von 1 bis 5
 * @property {number|null} mean  Mittelwert
 * @property {number|null} median  Median
 * @property {number[]} dist  Häufigkeit der Stufen 1 bis 5
 * @property {number} na  Antworten mit keine Angabe
 * @property {number|null} topShare  Anteil der Bewertungen 4 und 5
 */

/**
 * Eine Kano-Zeile. Sätze unter `types.KanoStatRow.<name>`.
 *
 * @typedef {object} KanoStatRow
 * @property {string} id  Id der Zeile
 * @property {string} text  Text der Zeile
 * @property {Record<string, number>} counts  Antworten je Kano-Kategorie M, O, A, I, R, Q
 * @property {number} n  eingeordnete Antworten
 * @property {number} unanswered  Antworten ohne Einordnung
 * @property {string|null} category  häufigste Kategorie
 * @property {boolean} tie  ob mehrere Kategorien gleich häufig sind
 * @property {number|null} cs  Zufriedenheitskoeffizient von 0 bis 1
 * @property {number|null} ds  Unzufriedenheitskoeffizient von -1 bis 0
 * @property {number|null} importanceMean  mittlere Wichtigkeit von 1 bis 9
 * @property {number} importanceN  Antworten mit Wichtigkeit
 */

/**
 * Ein Freitext. Sätze unter `types.TextEntry.<name>`.
 *
 * @typedef {object} TextEntry
 * @property {string} responseId  Id der Antwort
 * @property {string|null} recipientId  Empfänger, falls bekannt
 * @property {string} text  der Text
 */

/**
 * Kennzahlen einer Frage unter dem aktiven Filter. Welche Teile vorkommen,
 * hängt vom Typ ab. Sätze unter `types.QuestionStat.<name>`.
 *
 * @typedef {object} QuestionStat
 * @property {'single'|'multi'|'rating'|'kano'|'text'} type  Fragetyp
 * @property {string} questionId  Id der Frage
 * @property {number} n  Antworten, in denen die Frage sichtbar war
 * @property {number} [answered]  davon beantwortet (single, multi)
 * @property {OptionStat[]} [options]  Optionen mit Häufigkeit (single, multi)
 * @property {number} [otherCount]  Antworten mit Sonstige-Text (single, multi)
 * @property {TextEntry[]} [otherTexts]  die Sonstige-Texte (single, multi)
 * @property {Array<RatingStatRow|KanoStatRow>} [rows]  Zeilen (rating, kano)
 * @property {TextEntry[]} [answers]  die Freitexte (text)
 */

/**
 * Eine Zeile der Rangfolge aller Bewertungsfragen. Sätze unter `types.RankingRow.<name>`.
 *
 * @typedef {object} RankingRow
 * @property {string} questionId  Id der Frage
 * @property {string} questionText  Text der Frage
 * @property {string} rowId  Id der Zeile
 * @property {string} text  Text der Zeile
 * @property {number} n  Bewertungen
 * @property {number|null} mean  Mittelwert
 * @property {number|null} topShare  Anteil der Bewertungen 4 und 5
 */

/**
 * Eine Zeile der Kano-Übersicht. Sätze unter `types.KanoRow.<name>`.
 *
 * @typedef {object} KanoRow
 * @property {string} questionId  Id der Frage
 * @property {string} questionText  Text der Frage
 * @property {string} rowId  Id der Zeile
 * @property {string} text  Text der Zeile
 * @property {string|null} category  häufigste Kano-Kategorie
 * @property {number|null} cs  Zufriedenheitskoeffizient
 * @property {number|null} ds  Unzufriedenheitskoeffizient
 * @property {number|null} importanceMean  mittlere Wichtigkeit
 * @property {number} n  eingeordnete Antworten
 */

/**
 * Freitexte insgesamt und davon in den VoC-Baum übernommen. Sätze unter `types.FreeTextSummary.<name>`.
 *
 * @typedef {object} FreeTextSummary
 * @property {number} total  alle Freitexte und Sonstige-Texte
 * @property {number} taken  davon übernommen
 */

/**
 * Gruppenvergleich nach einer Einfachauswahl-Frage. Sätze unter `types.GroupComparison.<name>`.
 *
 * @typedef {object} GroupComparison
 * @property {string} questionId  die Gruppierungsfrage
 * @property {Array<{id: string, text: string, n: number, few: boolean}>} groups  die Gruppen, few bei wenig Antworten
 * @property {object[]} questions  je verglichener Frage die Anteile, Mittelwerte oder Kategorien je Gruppe
 */

/**
 * Die Auswertung, wie der Reiter sie zeigt. Sätze unter `types.SurveyResults.<name>`.
 *
 * @typedef {object} SurveyResults
 * @property {{questionId: string, optionId: string}|null} filter  der aktive Filter
 * @property {string|null} groupBy  die aktive Gruppierungsfrage
 * @property {number} n  Antworten nach dem Filter
 * @property {ResponseRate} responseRate  Rücklaufquote, vom Filter unberührt
 * @property {QuestionStat[]} questions  Kennzahlen je Frage in Reihenfolge des Fragebogens
 * @property {RankingRow[]} ratingRanking  alle Bewertungszeilen nach Mittelwert
 * @property {KanoRow[]} kanoOverview  alle Kano-Zeilen
 * @property {FreeTextSummary} freeText  Freitexte und Übernahme
 * @property {GroupComparison|null} groupComparison  Vergleich je Gruppe, null ohne Gruppierung
 */

/** @template T @param {T} v @returns {T} schlichte Kopie */
const plain = (v) => JSON.parse(JSON.stringify(v));

/**
 * Kano-Zeile mit genau den erklärten Schlüsseln.
 * @param {KanoStatRow & Record<string, any>} row @returns {KanoStatRow}
 */
function kanoRow(row) {
  const { id, text, counts, n, unanswered, category, tie, cs, ds, importanceMean, importanceN } = row;
  return { id, text, counts, n, unanswered, category, tie, cs, ds, importanceMean, importanceN };
}

/**
 * Der Filter, wenn seine Frage und Option bestehen, sonst null.
 * @param {object} survey @param {{ questionId: string, optionId: string }|null} filter
 * @returns {{ questionId: string, optionId: string }|null}
 */
export function activeFilter(survey, filter) {
  if (!filter) return null;
  const q = findQuestion(survey, filter.questionId);
  return q && Array.isArray(q.options) && q.options.some((o) => o.id === filter.optionId) ? filter : null;
}

/**
 * Die Gruppierungsfrage, wenn sie eine Einfachauswahl ist, sonst null.
 * @param {object} survey @param {string|null} groupBy @returns {string|null}
 */
export function activeGroupBy(survey, groupBy) {
  if (!groupBy) return null;
  const q = findQuestion(survey, groupBy);
  return q && q.type === 'single' ? groupBy : null;
}

/**
 * Die Auswertung, wie der Reiter sie zeigt, als Zahlen.
 * @param {{ survey: object, recipients: ReadonlyArray<object>, responses: ReadonlyArray<object>,
 *   answeredRecipientIds: ReadonlyArray<string>, transfers: { vocTree: { responseKeys: ReadonlyArray<string> } },
 *   ui: { filter: { questionId: string, optionId: string }|null, groupBy: string|null } }} model
 * @returns {SurveyResults}
 */
export function resultsSnapshot(model) {
  const survey = plain(model.survey);
  const all = legacyResponses(model);
  const filter = activeFilter(survey, model.ui.filter);
  const groupBy = activeGroupBy(survey, model.ui.groupBy);
  const responses = filterResponses(survey, all, filter);
  /** @type {QuestionStat[]} */
  const questions = [];
  for (const { question } of documentOrder(survey)) {
    const stats = questionStats(survey, question, responses);
    if (stats) questions.push(plain(stats.type === 'kano' ? { ...stats, rows: stats.rows.map(kanoRow) } : stats));
  }
  return {
    filter: filter ? { questionId: filter.questionId, optionId: filter.optionId } : null,
    groupBy,
    n: responses.length,
    responseRate: plain(responseRate({
      recipients: plain([...model.recipients]), responses: all, answeredRecipientIds: [...model.answeredRecipientIds],
    })),
    questions,
    ratingRanking: plain(ratingRanking(survey, responses)),
    kanoOverview: plain(kanoOverview(survey, responses)),
    freeText: plain(freeTextSummary(survey, responses, [...model.transfers.vocTree.responseKeys])),
    groupComparison: groupBy ? plain(groupComparison(survey, responses, groupBy)) : null,
  };
}
