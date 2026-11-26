/**
 * D.Mike — 5-Why: Viewmodel.
 *
 * Problemtext, Fragebaum, Kommandos, Invarianten und Kennzahlen liegen im
 * Model (domain/model.js); die Agentenfläche entsteht aus dessen Schema.
 * Anlegen, Löschen und Einklappen lösen ihre Kommandos im Template aus
 * (`x-command`), die Werkzeugleiste klappt über `setCollapseAll` alles ein
 * oder auf, Antworten binden die Textfelder direkt. Hier bleiben die Anzeige
 * (Kennzeichen W1.2…, Platzhalter, Titel, Statistiktexte) und die Höhe der
 * Antwortfelder. Export: der Baum als JSON in der bisherigen Form.
 */
import { createModule } from '../../../core/template-module.js';
import descriptor from '../module.js';
import { State, MAX_LEVEL } from '../domain/model.js';
import { toExport } from '../io/tree.js';

/** Die Antwortfelder, deren Höhe dem Inhalt folgt. */
const ANSWER = '.five-why__answer';

/** @typedef {{ id: number, level: number }} ViewNode */
/** @typedef {import('../domain/model.types.js').StateModel} FiveWhyModel */

/**
 * Ein Antwortfeld auf die Höhe seines Inhalts bringen (wie bisher ohne
 * Ränder: das Feld hat keinen Rahmen oben und unten). Ein eingeklapptes Feld
 * hat keine Höhe; es wird beim Aufklappen gemessen.
 * @param {HTMLTextAreaElement} el
 */
function fitToContent(el) {
  if (el.offsetParent === null) return;
  el.style.height = 'auto';
  el.style.height = `${el.scrollHeight}px`;
}

export default createModule({
  descriptor,
  Model: State,
  history: true,
  config: {
    actions: [
      { icon: 'nav.collapse-up', title: 'collapseAll', command: 'setCollapseAll', args: { collapsed: true } },
      { icon: 'nav.expand-down', title: 'expandAll', command: 'setCollapseAll', args: { collapsed: false } },
    ],
  },
  /** @type {import('../../../core/template-module.js').ExportsDef<FiveWhyModel, {}>} */
  exports: {
    fileName: '5why-export',
    tree() { return toExport(this.model, this.model.collapsed, new Date()); },
  },
  /** @type {import('../../../core/template-module.js').ViewFn<FiveWhyModel, {}>} */
  view(ctx) {
    /** @type {ResizeObserver|null} */
    let shown = null;
    return {
      init() {
        const fitAll = () => this.$root.querySelectorAll(ANSWER).forEach((el) => fitToContent(/** @type {HTMLTextAreaElement} */ (el)));
        this.$nextTick(fitAll);
        // Agent, Rückgängig, Beispiel, Aufklappen: nach jedem Rendern neu messen.
        this.$watch(() => JSON.stringify([this.model.nodes, this.model.collapsed]), () => this.$nextTick(fitAll));
        // Verborgen (Tab ausgehängt, display:none) misst niemand: beim
        // Sichtbarwerden — Breite von 0 auf mehr — alle Felder neu messen.
        if (typeof ResizeObserver === 'undefined') return;
        let visible = false;
        shown = new ResizeObserver((entries) => {
          const now = entries.some((e) => e.contentRect.width > 0);
          if (now && !visible) fitAll();
          visible = now;
        });
        shown.observe(this.$root);
      },
      destroy() {
        shown?.disconnect();
        shown = null;
      },

      /** Eindeutige id eines Felds je Instanz (für `<label for>`). @param {string} name @returns {string} */
      fieldId(name) { return `five-why-${name}-${ctx.instanceId}`; },

      /** Höchste Ebene (Grundursache). */
      get maxLevel() { return MAX_LEVEL; },

      /**
       * Kennzeichen aus dem Pfad der Indizes (ab 0): `W1`, `W1.2`, …; auf der
       * fünften Ebene „Grundursache“. Die Tiefe kommt aus dem Pfad, nicht aus
       * dem gespeicherten `level`.
       * @param {...number} indices @returns {string}
       */
      nodeTag(...indices) {
        if (indices.length >= MAX_LEVEL) return this.t('rootCause');
        return `W${indices.map((i) => i + 1).join('.')}`;
      },
      /** @param {number} id @returns {boolean} ob der Knoten eingeklappt ist */
      isCollapsed(id) { return this.model.collapsed.includes(id); },
      /** Kartenklasse: Grundursache hervorgehoben. @param {ViewNode} node @returns {string} */
      cardClass(node) { return node.level >= MAX_LEVEL ? 'five-why__card--root-cause' : ''; },
      /** Platzhalter und Beschriftung des Antwortfelds. @param {ViewNode} node @returns {string} */
      answerPlaceholder(node) {
        return node.level >= MAX_LEVEL ? this.t('rootCausePlaceholder') : this.t('answerPlaceholder');
      },
      /** Titel des Umschalters. @param {ViewNode} node @returns {string} */
      toggleTitle(node) { return this.isCollapsed(node.id) ? this.t('expand') : this.t('collapse'); },
      /** `aria-expanded` des Umschalters. @param {ViewNode} node @returns {'true'|'false'} */
      ariaExpanded(node) { return this.isCollapsed(node.id) ? 'false' : 'true'; },
      /** Symbol des Umschalters. @param {ViewNode} node @returns {string} */
      toggleIcon(node) { return this.isCollapsed(node.id) ? 'nav.expand-right' : 'nav.expand-down'; },
      /** „Why n hinzufügen“ für die nächste Ebene. @param {ViewNode} node @returns {string} */
      addChildLabel(node) { return this.t('addWhyN', { n: Math.min(node.level + 1, MAX_LEVEL) }); },
      /**
       * Eine Kennzahl der Statistikleiste: „{n} {Text}“.
       * @param {'totalNodes'|'maxDepth'|'branches'|'answered'} key
       * @param {string} label Textschlüssel
       * @returns {string}
       */
      statText(key, label) {
        const s = /** @type {any} */ (this.stats);
        const n = s && typeof s[key] === 'number' ? s[key] : 0;
        return `${n} ${this.t(label)}`;
      },
      /** Antwortfeld beim Tippen und Fokussieren auf seinen Inhalt bringen. @param {EventTarget|null} el */
      fit(el) {
        if (el instanceof HTMLTextAreaElement) fitToContent(el);
      },
    };
  },
});
