/**
 * D.Mike — Opportunity-Flowchart: Viewmodel.
 *
 * Schritte und Kommandos liegen im Model (domain/model.js); die
 * Agentenfläche entsteht aus dessen Schema. Einfügen, Bandwechsel, Löschen
 * und die Unterschritte lösen ihre Kommandos im Template aus (`x-command`,
 * `x-field`), das Verschieben die Gesten (interaction/gestures.js).
 * Exporte: Mapper nach Datenform, Menü und Dateien baut der Kern.
 * Hier bleiben: Bänder, Lücken und Schienen der Kette, das Einfügemenü, die
 * Vorschau der Gesten, die Höhe der Textfelder und der Importdialog über den
 * Instanzendienst.
 */
import { createModule } from '../../../core/template-module.js';
import { substepsView } from '../../../core/flowchart/substeps-view.js';
import descriptor from '../module.js';
import { State } from '../domain/model.js';
import { IMPORT_SOURCES, seedsFromRead } from '../domain/import.js';
import { chain, substeps } from '../interaction/gestures.js';
import { toJsonTree } from '../io/export.js';
import { UiState } from './state.js';

/** Bänder von oben nach unten: wertschöpfend, nicht wertschöpfend. */
const BANDS = Object.freeze(['va', 'nva']);
const AUTOSIZE = 'textarea.fc-card__title, textarea.fc-card__description';
/** Platz neben einer neuen Karte beim Hineinscrollen (Verbinder davor, Lücke danach). */
const REVEAL_PAD = 48;

/**
 * Ein Textfeld genau auf die Höhe seines Inhalts bringen; unter
 * `box-sizing: border-box` kommen die Ränder dazu, sonst schneidet die
 * letzte Zeile an.
 * @param {HTMLTextAreaElement} el
 */
function fitToContent(el) {
  el.style.height = 'auto';
  // offsetHeight − clientHeight sind die Ränder (kein Rollbalken: overflow hidden)
  const borders = getComputedStyle(el).boxSizing === 'border-box' ? el.offsetHeight - el.clientHeight : 0;
  el.style.height = `${el.scrollHeight + borders}px`;
}

/**
 * Den Canvas so weit scrollen, dass die Karte eines neuen Schritts sichtbar
 * ist; die nächste Kante gewinnt, eine sichtbare Karte bewegt nichts.
 * @param {HTMLElement} root @param {string} id
 */
function revealStep(root, id) {
  const canvas = root.querySelector('.of__canvas');
  const col = canvas?.querySelector(`.of__col[data-step-id="${CSS.escape(id)}"]`);
  if (!canvas || !col) return;
  const c = canvas.getBoundingClientRect();
  const r = col.getBoundingClientRect();
  if (r.left < c.left + REVEAL_PAD) canvas.scrollLeft += r.left - c.left - REVEAL_PAD;
  else if (r.right > c.right - REVEAL_PAD) canvas.scrollLeft += r.right - c.right + REVEAL_PAD;
}

/**
 * Auswahlzeilen des Importdialogs: Titel der Instanz; ohne Titel bei
 * mehreren Instanzen derselben Quelle die Ordnungszahl, sonst leer.
 * @param {Array<{ instanceId: string, moduleId: string, title: string }>} infos
 * @returns {Array<{ instanceId: string, moduleId: 'process-map'|'sipoc', label: string }>}
 */
function importOptionsOf(infos) {
  return IMPORT_SOURCES.flatMap((src) => {
    const own = infos.filter((x) => x.moduleId === src);
    return own.map((x, i) => ({
      instanceId: x.instanceId,
      moduleId: /** @type {'process-map'|'sipoc'} */ (src),
      label: x.title || (own.length > 1 ? `#${i + 1}` : ''),
    }));
  });
}

export default createModule({
  descriptor,
  Model: State,
  State: UiState,
  gestures: [chain, substeps],
  config: {
    actions: [
      { icon: 'action.add', title: 'addStepVA', variant: 'primary', command: 'addStep', args: { side: 'va' } },
      { icon: 'action.add', title: 'addStepNVA', command: 'addStep', args: { side: 'nva' } },
      { icon: 'action.upload', title: 'importFrom', onClick: (d) => d.openImport() },
    ],
  },
  /** @type {import('./state.types.js').OpportunityFlowchartViewFn} */
  view(ctx) {
    return {
      ...substepsView(),

      init() {
        let known = new Set(this.model.steps.map((s) => s.id));
        const fitAll = () => this.$root.querySelectorAll(AUTOSIZE).forEach(fitToContent);
        this.$nextTick(fitAll);
        this.$watch(() => JSON.stringify(this.model.steps), () => {
          const ids = this.model.steps.map((s) => s.id);
          const added = ids.find((id) => !known.has(id));
          known = new Set(ids);
          this.$nextTick(() => {
            fitAll();
            if (added) revealStep(this.$root, added);
          });
        });
      },

      // ─── Bänder und Kette ──────────────────────────────
      /** Bänder in Anzeigereihenfolge. */
      get bands() { return BANDS; },
      /** Nummer eines Schritts, zweistellig („01“). @param {number} i @returns {string} */
      stepNum(i) { return String(i + 1).padStart(2, '0'); },
      /** Lücke vor Schritt `i` (Einfügen), im Band seiner Karte. @param {number} i @param {string} band @returns {boolean} */
      showGap(i, band) { return i > 0 && this.model.steps[i]?.side === band; },
      /** Schiene vor dem ersten Schritt, nur während einer Geste. @param {number} i @param {string} band @returns {boolean} */
      showStartRail(i, band) {
        return this.state.chainPreview !== null && i === 0 && this.model.steps[0]?.side === band;
      },
      /** Schiene hinter dem letzten Schritt, nur während einer Geste. @param {number} i @param {string} band @returns {boolean} */
      showEndRail(i, band) {
        return this.state.chainPreview !== null && i === this.model.steps.length - 1 && this.model.steps[i]?.side === band;
      },

      // ─── Vorschau der Kettengeste ──────────────────────
      /**
       * Die Lücke, in der der gezogene Schritt landet; ohne Geste oder an
       * alter Stelle `null`.
       * @returns {number|null}
       */
      get previewGap() {
        const p = this.state.chainPreview;
        if (!p) return null;
        const from = this.model.steps.findIndex((s) => s.id === p.id);
        if (from < 0 || p.index === from) return null;
        return p.index < from ? p.index : p.index + 1;
      },
      /** Klassen des Verbinders an Lücke `g`. @param {number} g @returns {string} */
      gapClass(g) {
        if (this.state.chainPreview === null) return '';
        return g === this.previewGap ? 'fc-connector--drop is-drop-target' : 'fc-connector--drop';
      },
      /** Klassen des Verbinders hinter Schritt `i`. @param {number} i @returns {string} */
      gapClassAfter(i) { return this.gapClass(i + 1); },
      /** Hervorhebung des Zielbands bei einem Bandwechsel. @param {string} band @returns {string} */
      slotClass(band) {
        const p = this.state.chainPreview;
        if (!p || p.band !== band) return '';
        return this.model.steps.find((s) => s.id === p.id)?.side === band ? '' : 'is-drop-target';
      },
      /** Klassen der Karte: Bandfarbe, gezogen. @param {{ id: string, side: string }} step @returns {string} */
      cardClass(step) {
        const dragging = this.state.chainPreview?.id === step.id ? ' is-dragging' : '';
        return `of__card--${step.side}${dragging}`;
      },

      // ─── Bandwechsel-Knopf ─────────────────────────────
      /** @param {{ side: string }} step @returns {'va'|'nva'} das andere Band */
      otherSide(step) { return step.side === 'va' ? 'nva' : 'va'; },
      /** @param {{ side: string }} step @returns {string} */
      sideToggleTitle(step) { return step.side === 'va' ? this.t('moveToNVA') : this.t('moveToVA'); },
      /** @param {{ side: string }} step @returns {boolean} steht im oberen Band */
      isVA(step) { return step.side === 'va'; },

      // ─── Einfügemenü ───────────────────────────────────
      /** @param {number} i @returns {boolean} */
      isInsertOpen(i) { return this.state.insertMenuAt === i; },
      /** Menü an Lücke `i` öffnen oder schließen. @param {number} i */
      toggleInsertMenu(i) { this.state.insertMenuAt = this.state.insertMenuAt === i ? null : i; },
      closeInsertMenu() { this.state.insertMenuAt = null; },

      // ─── Import ────────────────────────────────────────
      /** @param {{ moduleId: string }} opt @returns {string} Name des Quellmoduls */
      sourceName(opt) { return this.t(`modules.${opt.moduleId}.name`); },
      /** @param {{ instanceId: string }} opt @returns {boolean} */
      isImportPicked(opt) { return this.state.importPick === opt.instanceId; },
      /** @param {{ instanceId: string }} opt @returns {string} */
      importOptionClass(opt) { return this.isImportPicked(opt) ? 'of__import-option--selected' : ''; },
      /** Auswahl im Dialog übernehmen (an der Liste, nicht je Zeile). @param {Event} event */
      pickImport(event) {
        const v = /** @type {HTMLInputElement|null} */ (event?.target)?.value;
        if (typeof v === 'string' && v !== '') this.state.importPick = v;
      },

      /**
       * Quellen auflisten und den Dialog öffnen; ohne Quelle nur ein Hinweis.
       * @returns {void}
       */
      openImport() {
        const options = importOptionsOf(ctx.instances?.list({ modules: [...IMPORT_SOURCES] }) ?? []);
        if (options.length === 0) {
          ctx.notify(this.t('importEmptyHint'), 'info');
          return;
        }
        this.state.importOptions = options;
        this.state.importPick = options[0].instanceId;
        // Erst nach dem Rendern der Zeilen leiht der Dialog das Formular aus.
        this.$nextTick(() => {
          ctx.dialog.form({
            title: this.t('importTitle'),
            content: this.$refs.importForm,
            confirmLabel: this.t('importConfirm'),
            onConfirm: (body) => {
              const checked = /** @type {HTMLInputElement|null} */ (body?.querySelector('.of__import-option input[type="radio"]:checked'));
              if (checked) this.state.importPick = checked.value;
              this.runImport();
            },
          });
        });
      },

      /**
       * Die gewählte Instanz lesen, ihre Schritte ans Ende hängen, melden.
       * @returns {Promise<number>} Zahl der angehängten Schritte
       */
      async runImport() {
        const opt = this.state.importOptions.find((o) => o.instanceId === this.state.importPick);
        if (!opt || !ctx.instances) return 0;
        try {
          const steps = seedsFromRead(opt.moduleId, await ctx.instances.read(opt.instanceId));
          const n = this.model.appendSteps({ steps });
          ctx.notify(this.t('importDone', { n }), 'success');
          return n;
        } catch (err) {
          ctx.notify(err?.message ?? String(err), 'error');
          return 0;
        }
      },
    };
  },

  /** @type {import('./state.types.js').OpportunityFlowchartExports} */
  exports: {
    fileName: 'opportunity-flowchart',
    tree() { return toJsonTree(this.model); },
  },
});
