/**
 * D.Mike — Process Map: Übernahme aus einem SIPOC (Teil des view-Blocks).
 *
 * Die SIPOC-Instanzen kommen über den Instanzendienst (`ctx.instances`:
 * `list`, dann je Instanz `read` für Anzahl und Vorschau). Der Dialog leiht
 * das Formular `importForm` aus; bestätigt hängt `appendSteps` die
 * Prozessschritte in einem Verlaufsschritt ans Ende. Ob das Projekt einen
 * SIPOC hat (Angebot im Leerzustand), steht im UI-State und wird bei
 * `module:added`/`module:removed` neu gelesen.
 */
import { sipocSummary, seedsFromSipoc } from '../domain/import.js';

/** @typedef {{ instanceId: string, label: string, processCount: number, processPreview: string[] }} ImportOption */

const SOURCE = 'sipoc';

/** @type {import('./state.types.js').ProcessMapViewFn} */
export const importPart = (ctx) => {
  /** Abo der Broadcasts, in `destroy` wieder abgemeldet. */
  let refresh = /** @type {(() => void)|null} */ (null);
  return {
    init() {
      refresh = () => { this.state.sipocAvailable = ctx.instances.list({ modules: [SOURCE] }).length > 0; };
      refresh();
      ctx.eventBus.on('module:added', refresh);
      ctx.eventBus.on('module:removed', refresh);
    },
    destroy() {
      if (!refresh) return;
      ctx.eventBus.off('module:added', refresh);
      ctx.eventBus.off('module:removed', refresh);
      refresh = null;
    },

    /** Leerzustand mit Angebot: keine Schritte, aber ein SIPOC im Projekt. @returns {boolean} */
    get sipocOfferVisible() { return this.model.steps.length === 0 && this.state.sipocAvailable; },

    // ─── Auswahlzeilen ─────────────────────────────────
    /** @param {ImportOption} opt @returns {boolean} */
    isImportPicked(opt) { return this.state.importPick === opt.instanceId; },
    /** @param {ImportOption} opt @returns {boolean} ohne Prozessschritte nicht wählbar */
    isImportEmpty(opt) { return opt.processCount === 0; },
    /** @param {ImportOption} opt @returns {string} */
    importOptionClass(opt) {
      return [
        this.isImportEmpty(opt) ? 'pmap__sipoc-option--disabled' : '',
        this.isImportPicked(opt) ? 'pmap__sipoc-option--selected' : '',
      ].filter(Boolean).join(' ');
    },
    /** @param {ImportOption} opt @returns {string} „leer“ bzw. „n Prozessschritt(e)“ */
    importCountText(opt) {
      return this.isImportEmpty(opt) ? this.t('importFromSipocEmpty') : this.t('importFromSipocSteps', { n: opt.processCount });
    },
    /** @param {ImportOption} opt @returns {boolean} mehr Schritte als in der Vorschau */
    hasMoreChips(opt) { return opt.processCount > opt.processPreview.length; },
    /** @param {ImportOption} opt @returns {string} „+n“ */
    moreChipText(opt) { return `+${opt.processCount - opt.processPreview.length}`; },
    /** Auswahl im Dialog übernehmen (an der Liste, nicht je Zeile). @param {Event} event */
    pickImport(event) {
      const v = /** @type {HTMLInputElement|null} */ (event?.target)?.value;
      const opt = this.state.importOptions.find((o) => o.instanceId === v);
      if (opt && !this.isImportEmpty(opt)) this.state.importPick = opt.instanceId;
    },

    /**
     * SIPOC-Instanzen lesen und den Dialog öffnen; ohne SIPOC nur ein
     * Hinweis. Vorgewählt ist der erste SIPOC mit Prozessschritten.
     * @returns {Promise<void>}
     */
    async openImport() {
      const infos = ctx.instances.list({ modules: [SOURCE] });
      if (infos.length === 0) {
        ctx.notify(this.t('importFromSipocHint'), 'info');
        return;
      }
      /** @type {ImportOption[]} */
      const options = [];
      for (const [i, info] of infos.entries()) {
        let summary = { processCount: 0, processPreview: /** @type {string[]} */ ([]) };
        try {
          summary = sipocSummary(await ctx.instances.read(info.instanceId));
        } catch (err) {
          console.warn('process-map: SIPOC nicht lesbar', err);
        }
        options.push({ instanceId: info.instanceId, label: `SIPOC #${i + 1}`, ...summary });
      }
      this.state.importOptions = options;
      this.state.importPick = options.find((o) => !this.isImportEmpty(o))?.instanceId ?? null;
      // Erst nach dem Rendern der Zeilen leiht der Dialog das Formular aus.
      this.$nextTick(() => {
        ctx.dialog.form({
          title: this.t('importFromSipocTitle'),
          content: this.$refs.importForm,
          confirmLabel: this.t('importFromSipocConfirm'),
          onConfirm: (body) => {
            const checked = /** @type {HTMLInputElement|null} */ (body?.querySelector('.pmap__sipoc-option input[type="radio"]:checked'));
            if (checked) this.state.importPick = checked.value;
            this.runImport();
          },
        });
      });
    },

    /**
     * Die gewählte Instanz lesen, ihre Prozessschritte ans Ende hängen,
     * melden.
     * @returns {Promise<number>} Zahl der angehängten Schritte
     */
    async runImport() {
      const opt = this.state.importOptions.find((o) => o.instanceId === this.state.importPick);
      if (!opt || this.isImportEmpty(opt)) return 0;
      try {
        const steps = seedsFromSipoc(await ctx.instances.read(opt.instanceId));
        if (steps.length === 0) return 0;
        const n = this.model.appendSteps({ steps });
        ctx.notify(this.t('importFromSipocDone', { n }), 'success');
        return n;
      } catch (err) {
        console.warn('process-map: Übernahme aus SIPOC fehlgeschlagen', err);
        ctx.notify(this.t('importFromSipocFailed'), 'error');
        return 0;
      }
    },
  };
};
