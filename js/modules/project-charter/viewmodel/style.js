/**
 * D.Mike — Project charter: view-Teil Stil-Panel des Organigramms.
 *
 * Der globale Stil steht als CSS-Variablen am Bereich (`styleVars`); Knoten
 * und Linien lesen ihn darüber. Farben wählt der Farbwähler des Kerns: beim
 * Ziehen schreibt er in den Entwurf `state.styleDraft` (Vorschau über die
 * Variable), erst beim Schließen übernimmt das Model den Wert — ein Schritt
 * im Verlauf. Rahmen- und Linienart und -breite binden im Template über
 * `x-field`. Im Bearbeiten-Dialog schreibt der Farbwähler in das Feld des
 * Formulars.
 */
import { setFields } from '../../../core/model.js';
import { openColorPicker } from '../../../core/color-picker.js';
import { DASH } from '../domain/layout.js';

/** Farbschlüssel des globalen Stils → Variable des Bereichs und Themenfarbe ohne eigenen Wert. */
const COLOR_VARS = Object.freeze({
  nodeBg: { css: '--pc-org-node-bg', theme: 'var(--color-bg-secondary)' },
  nodeBorderColor: { css: '--pc-org-node-border-color', theme: 'var(--color-border-secondary)' },
  lineColor: { css: '--pc-org-line-color', theme: 'var(--color-border-secondary)' },
});

/** Farbfelder eines Knotens → Farbschlüssel des globalen Stils, von dem sie erben. */
const NODE_COLOR_INHERITS = Object.freeze({ bg: 'nodeBg', borderColor: 'nodeBorderColor' });

/** @typedef {keyof typeof COLOR_VARS} ColorKey */

/** @type {import('./state.types.js').ProjectCharterViewFn} */
export const styleView = (_ctx) => ({
  /**
   * Der wirksame Wert eines Farbschlüssels: Entwurf, sonst Model.
   * @param {ColorKey} key @returns {string}
   */
  styleColor(key) {
    const d = this.state.styleDraft;
    return d && d.key === key ? d.value : this.model.orgStyle[key];
  },

  /** Der globale Stil als Variablen am Bereich; leere Farben folgen dem Farbschema. @returns {Record<string, string>} */
  get styleVars() {
    const s = this.model.orgStyle;
    return {
      '--pc-org-node-bg': this.styleColor('nodeBg'),
      '--pc-org-node-border-color': this.styleColor('nodeBorderColor'),
      '--pc-org-node-border-style': s.nodeBorderStyle || 'solid',
      '--pc-org-node-border-width': `${s.nodeBorderWidth}px`,
      '--pc-org-line-color': this.styleColor('lineColor'),
      '--pc-org-line-width': String(s.lineWidth),
      '--pc-org-line-dasharray': DASH[s.lineStyle] ?? 'none',
    };
  },

  /** Farbfeld im Stil-Panel. @param {ColorKey} key @returns {Record<string, string>} */
  swatchStyle(key) {
    return { background: this.styleColor(key) || COLOR_VARS[key].theme };
  },

  /** Stil-Panel auf- oder zuklappen. */
  toggleEditor() {
    this.state.editorOpen = !this.state.editorOpen;
  },

  /**
   * Farbwähler für einen Farbschlüssel des globalen Stils: Ziehen schreibt
   * den Entwurf, Schließen übernimmt ihn ins Model.
   * @param {ColorKey} key @param {MouseEvent} ev
   */
  openColor(key, ev) {
    const swatch = /** @type {HTMLElement} */ (ev.currentTarget ?? ev.target);
    const current = getComputedStyle(swatch).backgroundColor;
    openColorPicker(ev, current, (value) => {
      this.state.styleDraft = { key, value };
    }, {
      onClose: () => {
        const d = this.state.styleDraft;
        this.state.styleDraft = null;
        if (d && d.value !== this.model.orgStyle[d.key]) {
          setFields(this.model, { orgStyle: { ...this.model.orgStyle, [d.key]: d.value } });
        }
      },
    });
  },

  /**
   * Farbfeld im Bearbeiten-Dialog: eigener Wert, sonst der geerbte.
   * @param {string} value Wert des Formularfelds @param {keyof typeof NODE_COLOR_INHERITS} name
   * @returns {Record<string, string>}
   */
  nodeSwatchStyle(value, name) {
    const key = NODE_COLOR_INHERITS[name];
    return { background: value || this.model.orgStyle[key] || COLOR_VARS[key].theme };
  },

  /**
   * Farbwähler im Bearbeiten-Dialog: schreibt in das Formularfeld `name`
   * neben dem Farbfeld.
   * @param {keyof typeof NODE_COLOR_INHERITS} name @param {MouseEvent} ev
   */
  pickNodeColor(name, ev) {
    const swatch = /** @type {HTMLElement} */ (ev.currentTarget ?? ev.target);
    /** @type {HTMLInputElement|null} */
    const input = swatch.parentElement?.querySelector(`[data-field="${name}"]`) ?? null;
    if (!input) return;
    openColorPicker(ev, getComputedStyle(swatch).backgroundColor, (value) => {
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
  },
});
