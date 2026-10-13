/**
 * D.Mike — Physikalischer Widerspruch (TRIZ) (triz-physical-contradiction.js)
 *
 * @agent  Vollständig über das Viewmodel steuerbar: Parameter, die beiden
 *   gegensätzlichen Anforderungen, die Problemnotiz, die vier
 *   Trennungsprinzipien mit je einer Notiz, die Prinzipienwahl und die
 *   Lösungsnotiz. Der Oberfläche bleibt nichts Zustandstragendes vorbehalten.
 */
import { createModule } from '../../core/template-module.js';
import { agentReadMixin } from '../../core/agent/agent-read-mixin.js';
import { requireKnownId, requireText } from '../../core/agent/agent-argcheck.js';
import { State, PRINCIPLES } from './triz-physical-contradiction-model.js';

const PRINCIPLE_NUM = { time: 1, space: 2, condition: 3, system: 4 };

/** @type {Record<string, string>} */
const PRINCIPLE_ICONS = {
  time: 'domain.time',
  space: 'domain.space',
  condition: 'domain.condition',
  system: 'domain.system',
};

export default createModule({
  config: {
    id: 'triz-physical-contradiction',
    engine: 'alpine',
    phase: 'improve',
    icon: 'module.triz-physical-contradiction',
    version: '0.1.0',
    meta: import.meta,
  },
  Model: State,

  data(module, _t) {
    return {
      ...agentReadMixin(module),

      // unique IDs for label/input pairing (per instance)
      paramId: `triz-pc-param-${  module._context.instanceId}`,
      reqAId: `triz-pc-a-${  module._context.instanceId}`,
      reqBId: `triz-pc-b-${  module._context.instanceId}`,
      problemNoteId: `triz-pc-note-${  module._context.instanceId}`,
      radioName: `triz-pc-selected-${  module._context.instanceId}`,

      // Principle helpers (i18n for dynamic keys — cannot use string concatenation in template)
      /** @noagent view transform */
      principleNum: (key) => PRINCIPLE_NUM[key] || '',
      /** @noagent view transform */
      principleIcon: (key) => PRINCIPLE_ICONS[key] ?? 'status.info',
      /** @noagent view transform */
      principleName: (key) => _t(`principles.${  key  }.name`),
      /** @noagent view transform */
      principleQuestion: (key) => _t(`principles.${  key  }.question`),
      /** @noagent view transform */
      principleExample: (key) => _t(`principles.${  key  }.example`),

      // CSS class for selected principle
      /** @noagent view transform */
      principleSelectedClass: (key, selected) =>
        key === selected ? 'is-selected' : '',

      // Pipe filter for chosen principle name in solution section
      /** @noagent view transform */
      chosenPrincipleName: (key) =>
        key ? _t(`principles.${  key  }.name`) : '',

      // Radio checked state helper (needed because template engine can't evaluate expressions in x-bind:)
      /** @noagent view transform */
      isChecked: (key, selected) => key === selected,

      /**
       * Tauscht die beiden gegensätzlichen Anforderungen gegeneinander.
       * @agent
       * @returns {void}
       */
      swap() {
        this.model.swap();
      },

      // `null` nimmt die Wahl zurück und wirft nicht: die Feldhilfe von
      // `selectedPrinciple` liefert `null` als Leerwert aus, also muss diese
      // Senke ihn erreichen können (Ruling 52). Jeder ANDERE unbekannte Wert
      // wirft weiter.
      /**
       * Wählt das Trennungsprinzip, mit dem der Widerspruch aufgelöst wird.
       * @agent
       * @param {string|null} key Schlüssel des Trennungsprinzips; `null`
       *   nimmt die Wahl zurück
       * @returns {void}
       * @throws {Error} wenn kein Trennungsprinzip diesen Schlüssel trägt
       */
      selectPrinciple(key) {
        if (key === null || key === undefined) { this.model.selectedPrinciple = null; return; }
        requireKnownId('principleKey', key, PRINCIPLES);
        this.model.selectedPrinciple = key;
      },

      /**
       * @noagent packt ein Eingabeereignis aus; der Wert geht durch
       *   `setPrincipleNote`.
       */
      principleNoteChanged(key, event) {
        this.setPrincipleNote(key, event.target.value);
      },

      // ── Zustands-Sinks: ein Setter je Feld (Plan E2, E7) ───────────
      // Bewusst benannte Setter statt eines generischen `setField(name,
      // text)`: nur so trägt jeder Parameter in `module.describe` seinen
      // eigenen Hilfesatz.

      /**
       * Setzt den technischen Parameter, der die beiden gegensätzlichen
       * Anforderungen trägt.
       * @agent
       * @param {string} text Name des Parameters
       * @returns {void}
       * @throws {Error} wenn `text` keine Zeichenkette ist
       */
      setParameter(text) { this.model.parameter = requireText('text', text); },

      /**
       * Setzt die Anforderung A — die eine Seite des Widerspruchs.
       * @agent
       * @param {string} text die Anforderung A
       * @returns {void}
       * @throws {Error} wenn `text` keine Zeichenkette ist
       */
      setRequirementA(text) { this.model.requirementA = requireText('text', text); },

      /**
       * Setzt die Anforderung Nicht-A — die entgegengesetzte Seite des
       * Widerspruchs.
       * @agent
       * @param {string} text die Anforderung Nicht-A
       * @returns {void}
       * @throws {Error} wenn `text` keine Zeichenkette ist
       */
      setRequirementNotA(text) { this.model.requirementNotA = requireText('text', text); },

      /**
       * Setzt die Problemnotiz zum Widerspruch.
       * @agent
       * @param {string} text die Problemnotiz
       * @returns {void}
       * @throws {Error} wenn `text` keine Zeichenkette ist
       */
      setProblemNote(text) { this.model.problemNote = requireText('text', text); },

      /**
       * Setzt die Lösungsnotiz zum gewählten Trennungsprinzip.
       * @agent
       * @param {string} text die Lösungsnotiz
       * @returns {void}
       * @throws {Error} wenn `text` keine Zeichenkette ist
       */
      setSolutionNote(text) { this.model.solutionNote = requireText('text', text); },

      /**
       * Setzt die Notiz zu einem der vier Trennungsprinzipien.
       * @agent
       * @param {string} key Schlüssel des Trennungsprinzips
       * @param {string} text die Notiz zu diesem Prinzip
       * @returns {void}
       * @throws {Error} wenn kein Trennungsprinzip diesen Schlüssel trägt
       *   oder `text` keine Zeichenkette ist
       */
      setPrincipleNote(key, text) {
        requireKnownId('principleKey', key, PRINCIPLES);
        this.model.principleNotes[key] = requireText('text', text);
      },
    };
  },
});
