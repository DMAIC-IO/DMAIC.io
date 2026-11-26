/**
 * D.Mike — Taschenrechner: Viewmodel.
 *
 * Inhalt, Kommandos und Rechnungen liegen im Model (domain/); die
 * Agentenfläche entsteht aus dessen Schema. Jede Taste ist ein `x-command`,
 * die Winkeleinheit ein `x-set`, die Grenzen ein `x-field`. Hier bleiben die
 * Anzeige, die jedem Kommando der eigenen Instanz folgt (auch vom Agenten),
 * die Tastenbeschriftungen, das Zahlformat und die Tastatur.
 */
import { createModule } from '../../../core/template-module.js';
import descriptor from '../module.js';
import { State } from '../domain/model.js';
import { UiState } from './state.js';
import {
  nextDisplay, currentDisplay, snapOf, topText, mainText, isError, mainIcon, keyLabel, formatValue,
} from './present.js';

/** Tasten, die die Tastatur in die Eingabezeile schreibt (`*` und `/` als × und ÷). */
const TYPED = /^[0-9.+\-*/()^]$/;

/** @type {Record<string, string>} */
const TYPED_MAP = { '*': '×', '/': '÷' };

/** @param {any} m @returns {string} Schlüssel des Stands, zu dem eine Anzeige gehört */
const snapKey = (m) => JSON.stringify(snapOf(m));

/**
 * Die letzte Anzeige je Instanz. Ein Sprachwechsel baut den Alpine-Baum und
 * damit den UI-State neu auf; passt die Anzeige noch zum Stand, steht sie
 * danach übersetzt wieder da.
 * @type {Map<string, any>}
 */
const LAST_DISPLAY = new Map();

/** Ziele, in denen getippt wird; die Tastatur des Rechners schweigt dort. */
const TEXT_TARGETS = 'input, textarea, select, [contenteditable]:not([contenteditable="false"])';

export default createModule({
  descriptor,
  Model: State,
  State: UiState,
  history: true,
  /** @type {import('./state.types.js').CalculatorViewFn} */
  view(ctx) {
    /** @type {((e: { instanceId?: string, command?: string, args?: any, result?: any }) => void)|null} */
    let onCommand = null;
    const lang = () => ctx.i18n.getLanguage();
    return {
      /**
       * Folgt jedem Kommando der eigenen Instanz mit der Anzeige der Altform —
       * auch einem Aufruf des Agenten.
       */
      init() {
        /** @param {any} d */
        const show = (d) => {
          this.state.display = d;
          if (d) LAST_DISPLAY.set(ctx.instanceId, d);
          else LAST_DISPLAY.delete(ctx.instanceId);
        };
        const saved = currentDisplay(LAST_DISPLAY.get(ctx.instanceId) ?? null, this.model);
        if (saved) this.state.display = saved;
        onCommand = (e) => {
          if (e?.instanceId !== ctx.instanceId || !e.command) return;
          const next = nextDisplay(/** @type {any} */ (this.state.display), e.command, e.args, e.result, this.model);
          if (next) show(next);
        };
        ctx.eventBus?.on?.('command:executed', onCommand);
        // Ändert sich der Stand ohne Kommando (Rückgängig, Schreiben von
        // außen), verfällt die Anzeige: auch ihre Zeile darüber.
        this.$watch(() => snapKey(this.model), () => {
          if (this.state.display && !currentDisplay(/** @type {any} */ (this.state.display), this.model)) show(null);
        });
      },

      /** Meldet den Beobachter der Kommandos ab. */
      destroy() {
        if (onCommand) ctx.eventBus?.off?.('command:executed', onCommand);
        onCommand = null;
      },

      // ─── Anzeige ──────────────────────────────────────────
      /** Die gültige Anzeige oder null. @returns {any} */
      get display() { return currentDisplay(/** @type {any} */ (this.state.display), this.model); },
      /** Zeile über der Anzeige. @returns {string} */
      get topLine() { return topText(this.display, (k) => this.t(k)); },
      /** Hauptzeile der Anzeige. @returns {string} */
      get mainLine() { return mainText(this.display, this.model, (k) => this.t(k), lang()); },
      /** @returns {string} Klasse der Hauptzeile */
      get resultClass() { return isError(this.display) ? 'module-calculator__result--error' : ''; },
      /** @returns {string|null} Icon vor der Hauptzeile */
      get resultIcon() { return mainIcon(this.display); },
      /** @returns {string} „M“, solange etwas im Speicher steht */
      get memIndicator() { return this.model.memory !== 0 ? 'M' : ''; },
      /** @returns {string} die andere Winkeleinheit (Wert der Taste DEG/RAD) */
      get otherAngle() { return this.model.angleMode === 'DEG' ? 'RAD' : 'DEG'; },

      // ─── Reiter und Bereiche ──────────────────────────────
      /** @param {string} m @returns {boolean} */
      isMode(m) { return this.model.mode === m; },
      /** @param {string} m @returns {string} */
      tabClass(m) { return this.isMode(m) ? 'dmike-tab--active' : ''; },
      /** @param {string} m @returns {string} */
      tabSelected(m) { return this.isMode(m) ? 'true' : 'false'; },
      /** @param {string} m @returns {number} */
      tabIndex(m) { return this.isMode(m) ? 0 : -1; },
      /** @param {string} m @returns {string} */
      panelClass(m) { return this.isMode(m) ? '' : 'module-calculator__panel--hidden'; },
      /** Mausklick auf einen Reiter fokussiert ihn nicht — Enter bleibt eine Rechnertaste. @param {Event} e */
      preventFocus(e) { e.preventDefault(); },

      // ─── Datensätze und Tasten ────────────────────────────
      /** @param {number} v @returns {string} ein Wert des Datensatzes in der App-Sprache */
      valueText(v) { return formatValue(v, lang()); },
      /** @returns {string} */
      get dataCount() { return `n = ${this.model.dataset.length}`; },
      /** @returns {string} */
      get ssDataCount() { return `n = ${this.model.ssDataset.length}`; },
      /** @param {string} type @returns {string} Beschriftung einer Statistiktaste */
      statLabel(type) { return keyLabel('stat', type, (k) => this.t(k)); },
      /** @param {string} type @returns {string} Beschriftung einer Prozesstaste */
      ssLabel(type) { return keyLabel('ss', type, (k) => this.t(k)); },

      // ─── Tastatur ─────────────────────────────────────────
      /**
       * Tastatur des Rechners: Zeichen in die Eingabezeile, Enter rechnet
       * bzw. übernimmt den Wert, Escape leert, Rückschritt löscht. Nur in der
       * sichtbaren Instanz, nicht beim Tippen in einem Feld, nicht mit
       * Strg/Meta/Alt; Enter auf einem fokussierten, inaktiven Reiter
       * aktiviert ihn.
       * @param {KeyboardEvent} e
       */
      onKey(e) {
        if (!this.$root.closest('.app-workspace') || this.$root.offsetParent === null) return;
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        const target = /** @type {Element|null} */ (e.target instanceof Element ? e.target : null);
        if (target?.closest(TEXT_TARGETS)) return;
        const tab = target?.closest('[role="tab"]');
        if (e.key === 'Enter' && tab && tab.getAttribute('aria-selected') !== 'true') return;
        const m = this.model;
        if (e.key === 'Enter') {
          e.preventDefault();
          if (m.mode === 'stats') m.addData({});
          else if (m.mode === 'sixsigma') m.addSSData({});
          else m.calculate({});
        } else if (e.key === 'Escape') {
          m.clear({});
        } else if (e.key === 'Backspace') {
          e.preventDefault();
          m.backspace({});
        } else if (TYPED.test(e.key)) {
          m.inputText({ ch: TYPED_MAP[e.key] ?? e.key });
        }
      },
    };
  },
});
