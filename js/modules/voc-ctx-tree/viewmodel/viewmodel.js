/**
 * D.Mike — VoC → CTx-Baum: Viewmodel.
 *
 * Kundenstimmen, Baum, Kommandos und Invarianten liegen im Model
 * (domain/model.js); die Agentenfläche entsteht aus dessen Schema. Anlegen
 * und Bearbeiten laufen je Knotenart über ein verborgenes Formular im Dialog
 * (`x-dialog`, `x-command-form`), Löschen und Auswählen über `x-command`,
 * Umsortieren über die Geste in interaction/siblings.js. Hier bleiben die
 * Darstellung (Klassen, Zeilen, Abzeichen) und das Stil-Panel: die Farben
 * stehen als CSS-Variablen an der Wurzel und an den Formularen
 * (`styleVars`); der Farbwähler schreibt beim Ziehen in den Entwurf
 * `state.styleDraft` und übernimmt beim Schließen ins Model, die Randstärke
 * bindet über `x-field`. Exporte: der Baum als Tabelle (CSV, XLSX) und die
 * angezeigte Stimme als Bild.
 */
import { createModule } from '../../../core/template-module.js';
import { setFields } from '../../../core/model.js';
import { openColorPicker } from '../../../core/color-picker.js';
import { parseRGBA, rgbaStr } from '../../../core/chart/chart-core.js';
import { shortcutRegistry } from '../../../core/shortcut-registry.js';
import descriptor from '../module.js';
import { State } from '../domain/model.js';
import { COLOR_KEYS, effectiveActiveId, findVoc, totalReqs } from '../domain/tree.js';
import { siblingsGesture } from '../interaction/siblings.js';
import { toRows } from '../io/table.js';
import { buildTreeDiagram } from '../io/diagram.js';
import { UiState } from './state.js';

/** @typedef {import('../domain/tree.js').Voc} Voc */
/** @typedef {import('../domain/tree.js').Driver} Driver */
/** @typedef {typeof COLOR_KEYS[number]} ColorKey */

/** Ableitungen einer Knotenfarbe: Name der Variable → Deckkraft. */
const SHADES = Object.freeze({ '': 1, '-bg': 0.06, '-border': 0.20, '-badge-bg': 0.12, '-line': 0.25 });

/** Text je Treiberart (Formular). */
const TYPE_KEY = Object.freeze({ ctq: 'typeQuality', ctd: 'typeDelivery', ctc: 'typeCost' });

export default createModule({
  descriptor,
  Model: State,
  State: UiState,
  history: true,
  gestures: [siblingsGesture],
  /** @type {import('./state.types.js').VocCtxTreeExports} */
  exports: {
    fileName: 'voc-ctx-tree',
    table() { return toRows(this.model, this.t); },
    image() {
      const id = effectiveActiveId(this.model.vocs, this.model.activeVocId);
      const voc = id === null ? undefined : findVoc(this.model.vocs, id);
      if (!voc) return null;
      return this.chartSVG('node-diagram', buildTreeDiagram(voc, this.model.styles, {
        source: this.t('source'),
        badgeVoc: this.t('badgeVoc'),
        badgeNeed: this.t('badgeNeed'),
        badgeReq: this.t('badgeReq'),
        target: this.t('target'),
        measurement: this.t('measurement'),
      }));
    },
  },
  /** @type {import('./state.types.js').VocCtxTreeViewFn} */
  view(ctx) {
    return {
      /**
       * id eines Formularfelds, eindeutig je Instanz (`<label for>`).
       * @param {string} name @returns {string}
       */
      fieldId(name) { return `vct-${name}-${ctx.instanceId}`; },

      // ─── Auswahl ──────────────────────────────────────────
      /** Die angezeigte Kundenstimme; ohne Auswahl die erste, ohne Stimmen `null`. @returns {Voc|null} */
      get activeVoc() {
        const id = effectiveActiveId(this.model.vocs, this.model.activeVocId);
        return id === null ? null : (findVoc(this.model.vocs, id) ?? null);
      },
      /** Ohne Kundenstimmen. */
      get isEmpty() { return this.model.vocs.length === 0; },

      // ─── Karten ───────────────────────────────────────────
      /** @param {Voc} voc @returns {string} hebt die angezeigte Karte hervor */
      cardClass(voc) { return voc.id === this.activeVoc?.id ? 'vct__card--active' : ''; },
      /** @param {Voc} voc @returns {string} „{n} Bedürfnisse · {m} Req.“ */
      cardCountText(voc) {
        return `${voc.needs.length} ${this.t('needCount')} · ${totalReqs(voc)} ${this.t('reqShort')}`;
      },

      // ─── Knoten ───────────────────────────────────────────
      /** @param {string} text @returns {string} in Anführungszeichen */
      quoted(text) { return `„${text}“`; },
      /** @param {string} src @returns {string} Herkunftszeile */
      sourceLine(src) { return `${this.t('source')}: ${src}`; },
      /** @param {string} v @returns {string} Zielwertzeile */
      targetLine(v) { return `${this.t('target')}: ${v}`; },
      /** @param {string} v @returns {string} Messgrößenzeile */
      measureLine(v) { return `${this.t('measurement')}: ${v}`; },
      /** @param {string} type @returns {string} Treiberart als Kürzel */
      driverBadge(type) { return type.toUpperCase(); },
      /** @param {Driver} drv @returns {string} Knotenklasse der Treiberart, beim Ziehen mit Zielmarke */
      driverNodeClass(drv) { return `vct__node--${drv.type} ${this.dropClass(drv.id)}`.trim(); },
      /** @param {Driver} drv @returns {string} Kindklasse der Treiberart */
      driverChildrenClass(drv) { return `vct__children--${drv.type}`; },
      /** @param {string} type @returns {string} Beschreibung der Treiberart im Formular */
      typeLabel(type) { return this.t(TYPE_KEY[type]); },

      // ─── Umsortieren ──────────────────────────────────────
      /**
       * Schlüssel einer Geschwisterliste (Gruppe der Geste).
       * @param {'need'|'driver'|'req'} kind @param {string} parentId @returns {string}
       */
      groupKey(kind, parentId) { return `${kind}:${parentId}`; },
      /** @param {string} id @returns {string} markiert das Ziel beim Ziehen */
      dropClass(id) { return this.state.dropTarget === id ? 'vct__node--drag-over' : ''; },

      // ─── Formulare ────────────────────────────────────────
      /**
       * Strg+Enter (Kürzel `vocCtxTree.commit`) schickt das Formular ab;
       * Enter im Textfeld bleibt ein Zeilenumbruch.
       * @param {KeyboardEvent} event
       */
      commitKey(event) {
        if (!shortcutRegistry.matches(event, 'vocCtxTree.commit')) return;
        const form = /** @type {HTMLElement} */ (event.target).closest('form');
        if (!form) return;
        event.preventDefault();
        form.requestSubmit();
      },

      // ─── Stil ─────────────────────────────────────────────
      /**
       * Der wirksame Wert einer Knotenfarbe: Entwurf, sonst Model.
       * @param {ColorKey} key @returns {string}
       */
      styleColor(key) {
        const d = this.state.styleDraft;
        return d && d.key === key ? d.value : this.model.styles.colors[key];
      },
      /**
       * Die Darstellung als Variablen: je Knotenart die Farbe deckend und
       * vier Ableitungen (Hintergrund, Rand, Abzeichen, Linie), dazu die
       * Randstärke. An der Wurzel und an den Formularen, die im Dialog
       * außerhalb der Wurzel stehen.
       * @returns {Record<string, string>}
       */
      get styleVars() {
        /** @type {Record<string, string>} */
        const out = {};
        for (const key of COLOR_KEYS) {
          const c = parseRGBA(this.styleColor(key));
          for (const [suffix, a] of Object.entries(SHADES)) out[`--color-vct-${key}${suffix}`] = rgbaStr({ ...c, a });
        }
        out['--vct-border-width'] = `${this.model.styles.borderWidth}px`;
        return out;
      },
      /** @param {ColorKey} key @returns {Record<string, string>} Hintergrund des Farbfelds */
      swatchStyle(key) { return { background: this.styleColor(key) }; },
      /** Anzeige der Randstärke neben dem Regler. @returns {string} */
      get borderWidthText() { return String(this.model.styles.borderWidth); },
      /**
       * Farbwähler für eine Knotenart: Ziehen schreibt den Entwurf, Schließen
       * übernimmt ihn ins Model (ein Schritt im Verlauf).
       * @param {ColorKey} key @param {MouseEvent} ev
       */
      openColor(key, ev) {
        openColorPicker(ev, this.styleColor(key), (value) => {
          this.state.styleDraft = { key, value };
        }, {
          onClose: () => {
            const d = this.state.styleDraft;
            this.state.styleDraft = null;
            const s = this.model.styles;
            if (d && d.value !== s.colors[d.key]) {
              setFields(this.model, { styles: { ...s, colors: { ...s.colors, [d.key]: d.value } } });
            }
          },
        });
      },
    };
  },
});
