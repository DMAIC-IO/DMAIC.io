/**
 * D.Mike — Process Map: Inputs und Outputs (Teil des view-Blocks).
 *
 * Beschriftung der beiden Listen, Abzeichen des Input-Typs, die Gruppe der
 * Geste `io` je Schritt und Liste samt Vorschau und das Anlegen mit Fokus.
 * Typ, Entfernen und Name binden im Template (`x-command`, `x-field`).
 */

/** @typedef {import('../domain/model.types.js').StateFields['steps'][number]} Step */
/** @typedef {Step['inputs'][number]} Input */
/** @typedef {'inputs'|'outputs'} IoType */

/** Abzeichen je Input-Typ: Schlüssel von Kürzel und Langtext. */
const INPUT_TYPE = Object.freeze({
  param: { label: 'inputTypeParam', title: 'inputTypeParamLong' },
  noise: { label: 'inputTypeNoise', title: 'inputTypeNoiseLong' },
});

/** @type {import('./state.types.js').ProcessMapViewFn} */
export const ioPart = () => ({
  /** Kopf der Input-Liste („Inputs »“). @returns {string} */
  ioLabelIn() { return `${this.t('inputs')} »`; },
  /** Kopf der Output-Liste („» Outputs“). @returns {string} */
  ioLabelOut() { return `» ${this.t('outputs')}`; },

  /**
   * Gruppe der Geste `io`: je Schritt und Liste eine.
   * @param {Step} step @param {IoType} type @returns {string}
   */
  ioGroup(step, type) { return `${step.id}:${type}`; },

  /**
   * Vorschau der Geste am Eintrag `j`: der gezogene blass, am Zielplatz eine
   * Linie an der Seite, an der er landet.
   * @param {Step} step @param {IoType} type @param {{ id: string }} item @param {number} j
   * @returns {string}
   */
  ioItemClass(step, type, item, j) {
    const p = this.state.ioPreview;
    if (!p || p.group !== `${step.id}:${type}`) return '';
    if (p.id === item.id) return 'pmap__io-item--dragging';
    if (p.index !== j) return '';
    const from = step[type].findIndex((x) => x.id === p.id);
    return from >= 0 && from < j ? 'pmap__io-item--drag-over pmap__io-item--drag-over-end' : 'pmap__io-item--drag-over';
  },

  // ─── Input-Typ ─────────────────────────────────────
  /** @param {Input} item @returns {string} Kürzel oder „?“ */
  inputTypeLabel(item) { return item.inputType ? this.t(INPUT_TYPE[item.inputType].label) : '?'; },
  /** @param {Input} item @returns {string} Langtext oder „Input-Typ“ */
  inputTypeTitle(item) { return item.inputType ? this.t(INPUT_TYPE[item.inputType].title) : this.t('inputTypeLabel'); },
  /** @param {Input} item @returns {string} */
  inputTypeClass(item) { return `pmap__input-type--${item.inputType || 'none'}`; },

  /**
   * Einen Input bzw. Output anlegen und sein Namensfeld fokussieren (Klick
   * auf den Kopf der Liste).
   * @param {string} stepId @param {IoType} type @returns {string} id des Eintrags
   */
  addIOAt(stepId, type) {
    const id = this.model.addIO({ stepId, type });
    this.$nextTick(() => {
      /** @type {HTMLTextAreaElement|null} */ (this.$root.querySelector(
        `[data-reorder-group="${CSS.escape(`${stepId}:${type}`)}"] [data-io-id="${CSS.escape(id)}"] .pmap__io-name`))?.focus();
    });
    return id;
  },
});
