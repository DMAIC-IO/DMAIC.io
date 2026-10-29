/**
 * D.Mike — Survey builder module (survey-builder.js)
 *
 * Author a VoC questionnaire, send it as a self-contained HTML file per
 * recipient, import the answer files and evaluate them. Phase: Define.
 *
 * The model (survey-builder-model.js) owns the persisted state; the pure
 * modules next to it own conditions, export, import, statistics, report and
 * the hand-over to kano / voc-ctx-tree. The UI lives in five encapsulated
 * sub-viewmodels under viewmodel/ (draft, recipients, responses, results,
 * handover) that know neither each other nor this shell; the template
 * addresses them by namespace (`draft.addSection()`). This file keeps
 * config, tabs, lifecycle and the wiring: it creates the sub-viewmodels,
 * binds them to the component's model in init() and forwards the instance
 * events to the hand-over.
 *
 * @agent  Über die Teil-Viewmodels steuerbar: Kopf, Abschnitte, Fragen,
 *   Optionen und Zeilen samt Bedingungen anlegen, ändern, verschieben und
 *   löschen (draft.*); Empfänger pflegen (recipients.*); Antwortdateien
 *   einlesen und löschen (responses.*); Filter, Gruppierung und Namen im
 *   Bericht setzen (results.*); Freitexte an den VoC-Baum, Kano-Fragen an
 *   Kano und alle Antworten an ein Worksheet übergeben (handover.*). Der
 *   Oberfläche bleiben die Rückfragen vor dem Löschen, der Bedingungseditor
 *   mit seinem Entwurf, der Dateiwähler und die drei Downloads (Fragebogen,
 *   Empfängerdatei, Bericht).
 */

import { createModule } from '../../core/template-module.js';
import { State } from './survey-builder-model.js';
import * as labels from './survey-labels.js';
import { DraftViewModel } from './viewmodel/draft.js';
import { RecipientsViewModel } from './viewmodel/recipients.js';
import { ResponsesViewModel } from './viewmodel/responses.js';
import { ResultsViewModel } from './viewmodel/results.js';
import { HandoverViewModel } from './viewmodel/handover.js';
import { uid } from '../../core/uid.js';
import { readAgentState } from '../../core/agent/agent-read-mixin.js';
import { requireEnum } from '../../core/agent/agent-argcheck.js';

/** Tabs of the module (State.ui.tab). */
const TABS = ['draft', 'recipients', 'results'];

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

/**
 * @typedef {object} AgentRead
 * @property {any} survey  der Fragebogen
 * @property {Array<{id, name, organisation, group, email, note, sentAt: string|null, sentVersion: number|null}>} recipients  die Empfänger
 * @property {Array<{id, surveyVersion, recipientId: string|null, viaRecipient: boolean, submittedAt, answers: object}>} responses  die eingelesenen Antworten
 * @property {string[]} answeredRecipientIds  Empfänger, die geantwortet haben
 * @property {any} transfers  was schon übergeben wurde
 * @property {any} ui  Stand der Oberfläche
 * @property {any} dirtyStructure  Aufbau seit dem letzten Export geändert
 * @property {any} exportedOnce  schon einmal exportiert
 * @property {SurveyResults} results  die Auswertung unter dem aktiven Filter und der aktiven Gruppierung
 */
export default createModule({
  config: {
    id: 'survey-builder',
    engine: 'alpine',
    phase: 'define',
    icon: 'module.survey-builder',
    version: '1.0.0',
    meta: import.meta,
  },
  Model: State,

  /**
   * Every load of the example gets its own survey id. Response files are
   * matched to a survey by that id, so two instances loaded from the same
   * example would otherwise accept each other's responses as "ok".
   * @param {object} data the example's module state
   * @returns {object} a copy with a fresh `survey.id`
   */
  beforeLoadExample(data) {
    const copy = JSON.parse(JSON.stringify(data));
    if (copy.survey && typeof copy.survey === 'object') copy.survey.id = uid();
    return copy;
  },

  /**
   * Alpine data function of the module.
   * @param {object} module the module instance (`_context`, `_container`)
   * @param {function(string, object=): string} _t translation function of the module
   * @returns {object} Alpine component state and methods
   */
  data(module, _t) {
    const deps = { t: _t, context: module._context, container: () => module._container };
    return {
      draft: new DraftViewModel(deps),
      recipients: new RecipientsViewModel(deps),
      responses: new ResponsesViewModel(deps),
      results: new ResultsViewModel(deps),
      handover: new HandoverViewModel(deps),
      _t,
      _unsubs: [],

      /**
       * Den vollständigen Lesezustand liefern, dazu die Auswertung als Zahlen.
       * @agent
       * @param {object} [options] `{ fields?: string[], rows?: { from: number, to: number } }`
       * @returns {AgentRead} Fragebogen, Empfänger, Antworten und die Auswertung
       */
      read(options) {
        return readAgentState('survey-builder', {
          ...this.model.toJSON(),
          results: this.results.agentSnapshot(),
        }, options);
      },

      /** @noagent lifecycle — Alpine hook: binds the sub-viewmodels to the component's model. */
      init() {
        this._unsubs = [];
        const binding = {
          model: this.model,
          watch: (getter, callback) => this.$watch(getter, callback),
          nextTick: (callback) => this.$nextTick(callback),
        };
        for (const vm of this._subViewModels()) vm.attach(binding);
        // The only wiring between the parts: kano instances may have changed.
        const eb = module._context.eventBus;
        const onInstances = () => this.handover.onInstancesChanged();
        for (const evt of ['module:added', 'module:removed']) {
          eb.on(evt, onInstances);
          this._unsubs.push(() => eb.off(evt, onInstances));
        }
      },

      /** @noagent lifecycle — Alpine hook: subscriptions, then every sub-viewmodel. */
      destroy() {
        (this._unsubs || []).forEach((off) => off());
        this._unsubs = [];
        for (const vm of this._subViewModels()) vm.detach();
      },

      /** @returns {object[]} the sub-viewmodels, in attach order */
      _subViewModels() { return [this.draft, this.recipients, this.responses, this.results, this.handover]; },

      // ── Tabs ──────────────────────────────────────────────────

      /**
       * @noagent view transform
       * @param {'draft'|'recipients'|'results'} tab
       * @returns {boolean} whether the tab is the active one
       */
      isTab(tab) { return this.model.ui.tab === tab; },

      /**
       * @noagent view transform
       * @param {'draft'|'recipients'|'results'} tab
       * @returns {object} class map for the tab button
       */
      tabClass(tab) { return { 'dmike-tab--active': this.isTab(tab) }; },

      /**
       * Open a tab. The results tab draws its charts when it opens.
       * @agent
       * @param {'draft'|'recipients'|'results'} tab the tab to open
       * @returns {void}
       * @throws {Error} if `tab` is not one of the three tabs
       */
      setTab(tab) {
        requireEnum('tab', tab, TABS);
        this.model.ui.tab = tab;
      },

      // ── Template-wide labels (pure functions in survey-labels.js) ──

      /** @noagent view transform @param {string} type @returns {string} translated question type */
      typeLabel(type) { return labels.typeLabel(type, _t); },

      /** @noagent view transform @param {object} q @returns {string} question text or "Frage <n>" */
      questionLabel(q) { return labels.questionLabel(this.model.survey, q, _t); },

      /** @noagent view transform @param {number} index 0-based @returns {string} placeholder of an untitled section */
      sectionPlaceholder(index) { return labels.sectionPlaceholder(index, _t); },

      /** @noagent view transform @param {object} opt option @returns {string} its text or a placeholder */
      optionText(opt) { return labels.optionText(opt, _t); },

      /** @noagent view transform @param {{when: Array|null}} node @returns {boolean} whether the node has conditions */
      hasCondition(node) { return Array.isArray(node.when) && node.when.length > 0; },

      /** @noagent view transform @param {string|null} code @returns {string} Kano category label */
      catLabel(code) { return labels.catLabel(code, module._context.i18n); },

      /** @noagent view transform @param {number|null} share 0..1 @returns {string} "42 %", '—' without a base */
      fmtPct(share) { return labels.fmtPct(share); },

      /** @noagent view transform @param {number|null} value @param {number} decimals @returns {string} localised number */
      fmtNum(value, decimals) { return labels.fmtNum(value, decimals, labels.localeOf(module._context.i18n)); },
    };
  },
});
