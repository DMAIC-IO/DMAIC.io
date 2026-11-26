/**
 * D.Mike — Stoff-Feld-Analyse (TRIZ): Viewmodel.
 *
 * Stoffe, Feldart, Verknüpfung, Problemnotiz und die Notizen je
 * Standardlösung liegen im Model (domain/model.js) und binden im Template
 * über `x-model` bzw. `x-field`, der Listenfilter über `x-set`. Die Diagnose
 * und die Tabelle der Standardlösungen sind Ableitungen bzw. feste Daten aus
 * `domain/`. Hier bleiben die Anzeige (Texte, Klassen und Strichart des
 * Dreiecks, ids je Instanz), das Kästchen der Vormerkung, das über
 * `setStandardSelected` schreibt, und der Aufklappstand der Klassen: eine
 * Instanz ohne gespeicherten Stand zeigt die empfohlenen Klassen offen, ohne
 * zu speichern; das erste Auf- oder Zuklappen schreibt den sichtbaren Stand
 * über `setExpandedClasses`, jede andere Änderung des Stands verwirft die
 * Vorbelegung.
 */
import { createModule } from '../../../core/template-module.js';
import descriptor from '../module.js';
import { State } from '../domain/model.js';
import { FIELD_TYPES, LINK_TYPES } from '../domain/diagnosis.js';
import { STANDARD_CLASSES } from '../domain/standards.js';
import { UiState } from './state.js';

/** Länge der Stoffnamen im Dreieck, danach gekürzt mit „…“. */
const DIAGRAM_TEXT_MAX = 22;

/** Strichart der Grundkante je Verknüpfung; ohne Eintrag durchgezogen. @type {Record<string, string>} */
const EDGE_DASH = { insufficient: '6 4', harmful: '2 4', missing: '2 6' };

/**
 * Text auf `n` Zeichen gekürzt, der letzte wird „…“.
 * @param {string} s @param {number} n @returns {string}
 */
const truncate = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/**
 * Eine Standardlösung der Tabelle (`domain/standards.js`).
 * @typedef {import('../domain/standards.js').Standard} Standard
 */

export default createModule({
  descriptor,
  Model: State,
  State: UiState,
  history: true,
  /** @type {import('./state.types.js').TrizSufieldViewFn} */
  view(ctx) {
    /** @type {((e: { instanceId?: string, command?: string }) => void)|null} */
    let onCommand = null;
    return {
      /** Die Feldarten (Optionen der Auswahlliste). @returns {ReadonlyArray<string>} */
      get fieldTypes() { return FIELD_TYPES; },

      /** Die Verknüpfungen (Optionen der Auswahlliste). @returns {ReadonlyArray<string>} */
      get linkTypes() { return LINK_TYPES; },

      /** Die Standardlösungen je Klasse. @returns {typeof STANDARD_CLASSES} */
      get standardClasses() { return STANDARD_CLASSES; },

      /** Name einer Feldart. @param {string} f @returns {string} */
      fieldOptionLabel(f) { return this.t(`field.${f}`); },

      /** Name einer Verknüpfung. @param {string} l @returns {string} */
      linkOptionLabel(l) { return this.t(`link.${l}`); },

      /** Satz zur Lage des Modells. @returns {string} */
      get situationText() { return this.t(`situation.${this.diagnosis.situation}`); },

      /** „Empfohlene Klassen:“ @returns {string} */
      get suggestedClassesLabel() { return `${this.t('suggestedClasses')}:`; },

      /** Die empfohlenen Klassen der Diagnose. @returns {number[]} */
      get suggestedClassList() { return this.diagnosis.suggestedClasses; },

      /** Klasse des Dreiecks nach der Verknüpfung (Farbe der Grundkante). @returns {string} */
      get edgeClass() {
        const link = this.model.link;
        return link ? `triz-sf__edge--${link}` : 'triz-sf__edge--empty';
      },

      /** Strichart der Grundkante; durchgezogen ohne Wert. @returns {string|null} */
      get dashArray() { return EDGE_DASH[this.model.link] ?? null; },

      /** Pfeilspitze der Grundkante; keine bei „fehlend“. @returns {string|null} */
      get markerEnd() { return this.model.link === 'missing' ? null : `url(#${this.fieldId('arrow')})`; },

      /** Strichart der Seitenkanten: gestrichelt ohne Feldart. @returns {string} */
      get sideDash() { return this.model.field ? '0' : '2 4'; },

      /** Beschriftung des Feldknotens. @returns {string} */
      get fieldLabel() {
        const field = this.model.field;
        return field ? this.t(`field.${field}`) : this.t('fieldEmpty');
      },

      /** Beschriftung von S1 im Dreieck, ohne Eingabe der Platzhalter. @returns {string} */
      get s1Text() { return truncate(this.model.s1 || this.t('s1Placeholder'), DIAGRAM_TEXT_MAX); },

      /** Beschriftung von S2 im Dreieck, ohne Eingabe der Platzhalter. @returns {string} */
      get s2Text() { return truncate(this.model.s2 || this.t('s2Placeholder'), DIAGRAM_TEXT_MAX); },

      /** Name einer Standardklasse. @param {number} c @returns {string} */
      className(c) { return this.t(`class.${c}.name`); },

      /** Beschreibung einer Standardklasse. @param {number} c @returns {string} */
      classDesc(c) { return this.t(`class.${c}.description`); },

      /** Anzahl der Lösungen einer Klasse: „(13)“. @param {{ standards: ReadonlyArray<Standard> }} group @returns {string} */
      classCountText(group) { return `(${group.standards.length})`; },

      /** Titel einer Standardlösung. @param {Standard} s @returns {string} */
      stdTitle(s) { return this.t(`standards.${s.id}.title`); },

      /** Beschreibung einer Standardlösung. @param {Standard} s @returns {string} */
      stdDesc(s) { return this.t(`standards.${s.id}.description`); },

      /** Auslöser einer Standardlösung. @param {Standard} s @returns {string} */
      stdTrigger(s) { return this.t(`standards.${s.id}.trigger`); },

      /** Beispiel einer Standardlösung. @param {Standard} s @returns {string} */
      stdExample(s) { return this.t(`standards.${s.id}.example`); },

      /** Ist die Standardlösung vorgemerkt? @param {Standard} s @returns {boolean} */
      isSelected(s) { return this.model.selected[s.id] === true; },

      /** Klasse eines Eintrags: hervorgehoben, wenn vorgemerkt. @param {Standard} s @returns {string} */
      standardClass(s) { return this.isSelected(s) ? 'is-selected' : ''; },

      /** Sichtbar bei „Alle anzeigen“ oder wenn die Diagnose die Klasse empfiehlt. @param {number} c @returns {boolean} */
      isClassVisible(c) { return this.model.filterMode === 'all' || this.diagnosis.suggestedClasses.includes(c); },

      /**
       * Ist die Klasse offen? Gespeichert offen oder, solange die Instanz
       * keinen Aufklappstand hat, beim Einhängen empfohlen.
       * @param {number} c @returns {boolean}
       */
      isClassOpen(c) { return this.model.expandedClasses.includes(c) || this.state.autoOpen.includes(c); },

      /** Pfeil im Klassenkopf. @param {number} c @returns {string} */
      classIcon(c) { return this.isClassOpen(c) ? 'nav.expand-down' : 'nav.expand-right'; },

      /**
       * id eines Elements, eindeutig je Instanz: `<label for>`, die
       * Pfeilspitze und `aria-labelledby` zeigen so auch bei mehreren offenen
       * Instanzen ins eigene Modul.
       * @param {string} name Kurzname des Elements
       * @returns {string}
       */
      fieldId(name) { return `triz-sf-${name}-${ctx.instanceId}`; },

      /** id des Titels einer Standardlösung (Beschriftung ihrer Notiz). @param {Standard} s @returns {string} */
      stdTitleId(s) { return this.fieldId(`std-${s.id}`); },

      /**
       * Hat die Instanz keinen gespeicherten Aufklappstand, zeigt sie die
       * empfohlenen Klassen offen. Nur UI-State: gespeichert wird erst durch
       * das Auf- oder Zuklappen. Ändert sich der gespeicherte Stand auf
       * anderem Weg (Agent, Rückgängig, Stand von außen), entfällt die
       * Vorbelegung bis zum nächsten Einhängen (Neuladen, Sprachwechsel,
       * Laden): die Anzeige zeigt dann genau
       * den gespeicherten Stand, auch wenn er leer wird. Ein Aufruf von
       * `setExpandedClasses` zählt auch, wenn er den Stand nicht ändert.
       */
      init() {
        this.state.autoOpen = this.model.expandedClasses.length ? [] : [...this.diagnosis.suggestedClasses];
        const drop = () => { if (this.state.autoOpen.length) this.state.autoOpen = []; };
        this.$watch(() => this.model.expandedClasses.join(','), drop);
        onCommand = (e) => {
          if (e?.instanceId === ctx.instanceId && e.command === 'setExpandedClasses') drop();
        };
        ctx.eventBus?.on?.('command:executed', onCommand);
      },

      /** Meldet den Beobachter der Kommandos ab. */
      destroy() {
        if (onCommand) ctx.eventBus?.off?.('command:executed', onCommand);
        onCommand = null;
      },

      /**
       * Ziel von `toggle` am Kasten einer Klasse. Den Offen-Zustand liest es
       * am Kasten; gilt er schon (das Setzen von `open` beim Zeichnen löst
       * `toggle` ebenfalls aus), geschieht nichts. Sonst schreibt es den
       * ganzen sichtbaren Stand mit der Änderung in einem Schritt.
       * @param {number} cls Nummer der Klasse
       * @param {Event} event
       */
      classToggled(cls, event) {
        const open = Boolean(/** @type {HTMLDetailsElement|null} */ (event.currentTarget)?.open);
        if (open === this.isClassOpen(cls)) return;
        const saved = this.model.expandedClasses;
        const shown = [...saved, ...this.state.autoOpen.filter((c) => !saved.includes(c))];
        const classes = open ? [...shown, cls] : shown.filter((c) => c !== cls);
        this.state.autoOpen = [];
        this.model.setExpandedClasses({ classes });
      },

      /**
       * Ziel von `change` am Kästchen einer Standardlösung: merkt sie vor
       * oder nimmt die Vormerkung zurück.
       * @param {Standard} s
       * @param {Event} event
       */
      selectChanged(s, event) {
        const selected = Boolean(/** @type {HTMLInputElement|null} */ (event.target)?.checked);
        try {
          this.model.setStandardSelected({ stdId: s.id, selected });
        } catch (err) {
          console.warn('triz-sufield: Vormerkung nicht übernommen', err);
          ctx.notify(this.t('selectFailed'), 'error');
        }
      },
    };
  },
});
