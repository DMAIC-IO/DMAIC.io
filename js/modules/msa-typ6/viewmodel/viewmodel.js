/**
 * D.Mike — MSA Typ 6: Viewmodel.
 *
 * Die Ableitung `result` (Model) rechnet aus Eingaben und Spalten; Getter
 * machen daraus Urteil, Kennzahlen, Verletzungstabelle, Deutung, Fehler- und
 * Warntexte und die Konfiguration der drei Diagramm-Widgets. UI-State: die
 * Typ-1-Instanzen der Auswahl (über `ctx.instances` gelesen, aufgefrischt bei
 * `init`, `module:added`/`module:removed` und beim Aktivieren dieser Instanz)
 * und die markierte Tabellenzeile. Zwei Handler: die Typ-1-Auswahl (liest die
 * Liste im UI-State, die kein Agent kennt) und die Regel-Kästchen (rufen das
 * Model-Kommando `toggleRule`).
 */
import { createModule } from '../../../core/template-module.js';
import descriptor from '../module.js';
import { State } from '../domain/model.js';
import { readInputs } from '../domain/analyze.js';
import { UiState } from './state.js';
import {
  fmt, resultOf, errorText, levelClass, violationsClass, meanOf, interpretationText, warningItems,
  violationRows, typ1Label, primaryChart, secondaryChart, driftChart,
} from './present.js';

/** Dauer der Zeilenmarkierung nach einem Klick (ms). */
const HIGHLIGHT_MS = 1500;

export default createModule({
  descriptor,
  Model: State,
  State: UiState,
  history: true,
  /** @type {import('../../../core/template-module.js').ViewFn<import('../domain/model.types.js').StateModel, any>} */
  view(ctx) {
    const lang = () => ctx.context.language;
    const gt = (/** @type {string} */ key) => ctx.i18n.t(key);
    /** Zähler der Lesevorgänge: ein älterer überschreibt keinen neueren, nach `destroy` keiner. */
    let readSeq = 0;
    /** @type {ReturnType<typeof setTimeout>|null} */
    let highlightTimer = null;
    /** @type {((e: { moduleId?: string }) => void)|null} */
    let onModules = null;
    /** @type {((e: { instanceId?: string }) => void)|null} */
    let onActivated = null;
    return {
      init() {
        this.loadTyp1();
        onModules = (e) => { if (!e || !e.moduleId || e.moduleId === 'msa-typ1') this.loadTyp1(); };
        onActivated = (e) => { if (!e || !e.instanceId || e.instanceId === ctx.instanceId) this.loadTyp1(); };
        ctx.eventBus.on('module:added', onModules);
        ctx.eventBus.on('module:removed', onModules);
        ctx.eventBus.on('module:activated', onActivated);
      },
      destroy() {
        if (onModules) {
          ctx.eventBus.off('module:added', onModules);
          ctx.eventBus.off('module:removed', onModules);
        }
        if (onActivated) ctx.eventBus.off('module:activated', onActivated);
        onModules = null;
        onActivated = null;
        readSeq += 1;
        if (highlightTimer) clearTimeout(highlightTimer);
        highlightTimer = null;
      },

      // ─── Typ-1-Auswahl ─────────────────────────────────────
      /**
       * Die Typ-1-Instanzen des Projekts lesen: Name und µ/σ der Messwertspalte
       * (`columnStats`); ohne Kennwerte (unter 2 Werten, keine Spalte) oder bei
       * einem Lesefehler entfällt die Instanz.
       */
      loadTyp1() {
        const seq = ++readSeq;
        const instances = ctx.instances;
        if (!instances) return;
        const list = instances.list({ modules: ['msa-typ1'] });
        Promise.all(list.map((inst) => instances.read(inst.instanceId, { fields: ['params', 'columnStats'] })
          .then((/** @type {any} */ r) => {
            const s = r?.columnStats;
            if (!s || !Number.isFinite(s.mean) || !Number.isFinite(s.stdDev)) return null;
            return { instanceId: inst.instanceId, name: r?.params?.name || inst.instanceId, mean: s.mean, stdDev: s.stdDev };
          })
          .catch((err) => { console.warn('[msa-typ6] reading msa-typ1 failed', inst.instanceId, err); return null; })))
          .then((reads) => {
            if (seq !== readSeq) return;
            this.state.typ1Options = reads.filter((r) => r !== null);
          });
      },
      /** @param {{ name: string, mean: number, stdDev: number }} o @returns {string} Beschriftung einer Typ-1-Instanz */
      typ1Label(o) { return typ1Label(o, lang()); },
      /** @param {string} id @returns {boolean} die gewählte Typ-1-Instanz */
      isTyp1Selected(id) { return id === this.model.sourceTyp1InstanceId; },
      /** Keine Typ-1-Instanz gewählt. */
      get noTyp1Selected() { return !this.model.sourceTyp1InstanceId; },
      /**
       * Auswahl einer Typ-1-Instanz: Quelle, µ₀ und σ₀ in einem Schritt;
       * der Platzhalter setzt nur die Auswahl zurück.
       * @param {Event} event
       */
      onTyp1Selected(event) {
        const id = /** @type {HTMLSelectElement} */ (event.target).value;
        if (!id) { this.model.adoptTyp1({ instanceId: null }); return; }
        const o = this.state.typ1Options.find((/** @type {any} */ x) => x.instanceId === id);
        if (o) this.model.adoptTyp1({ instanceId: id, mu0: o.mean, sigma0: o.stdDev });
      },

      // ─── Regeln ────────────────────────────────────────────
      /** Die Nelson-Regeln 1–8. */
      get ruleIds() { return [1, 2, 3, 4, 5, 6, 7, 8]; },
      /** @param {number} id @returns {boolean} angehakt */
      isRuleEnabled(id) { return this.model.params.enabledRules.includes(/** @type {1|2|3|4|5|6|7|8} */ (id)); },
      /** @param {number} id @returns {string} Kurztext der Regel */
      ruleShort(id) { return gt(`common.nelson.${id}.short`); },
      /** @param {number} id @returns {string} Beschreibung der Regel */
      ruleDesc(id) { return gt(`common.nelson.${id}.desc`); },
      /** @param {number} id @returns {string} Glossarbegriff der Regel */
      ruleTerm(id) { return `nelson-regel-${id}`; },
      /**
       * Ein Regel-Kästchen umgeschaltet.
       * @param {number} id @param {Event} event
       */
      ruleChanged(id, event) {
        this.model.toggleRule({ ruleId: /** @type {1|2|3|4|5|6|7|8} */ (id), on: /** @type {HTMLInputElement} */ (event.target).checked });
      },

      // ─── Sichtbarkeit ──────────────────────────────────────
      /** Untergruppenspalte nur bei x̄-R. */
      get showSubgroup() { return this.activeColumnSlots.includes('subgroup'); },
      /** Basis-Untergruppen nur bei Grenzen aus der Studie. */
      get showBaselineK() { return this.activeParams.includes('baselineK'); },
      /** μ₀, σ₀ und Typ-1-Auswahl nur bei vorgegebenen Grenzen. */
      get showGiven() { return this.activeParams.includes('mu0'); },

      // ─── Ergebnis ──────────────────────────────────────────
      /** Das Ergebnis, oder null bei fehlenden oder abgelehnten Eingaben. */
      get res() { return resultOf(this.result); },
      /** Fehlertext einer abgelehnten Rechnung, sonst leer. */
      get errorText() { return errorText(this.result, this.t); },
      /** Weder Ergebnis noch Fehler: der Leertext. */
      get showEmpty() { return !this.res && !this.errorText; },
      /** Ampelklasse des Urteils. */
      get verdictClass() { return this.res ? levelClass(this.res.verdict.level) : ''; },
      /** Urteil als Text. */
      get verdictLabel() { return this.res ? this.t(`verdict.${this.res.verdict.level}`) : ''; },
      /** Auslöser als Text. */
      get driverLabel() { return this.res ? this.t(`driver.${this.res.verdict.driver}`) : ''; },
      /** Deutungssatz. */
      get interpretation() { return this.res ? interpretationText(this.res, this.t, lang()) : ''; },
      /** Warnungen samt Text. */
      get warnings() { return this.res ? warningItems(this.res, this.t) : []; },
      /** Ampelklasse der Kachel „Regel-Verletzungen“. */
      get violationsClass() { return this.res ? violationsClass(this.res.verdict.nelsonCount) : ''; },
      /** Mittelwert der Lagekarte. */
      get kpiMean() { return this.res ? fmt(meanOf(this.res.primary.series), 3, lang()) : ''; },
      /** Geschätztes σ der Lagekarte. */
      get kpiSigma() { return this.res ? fmt(this.res.primary.sigma, 3, lang()) : ''; },
      /** Steigung des Drifts. */
      get kpiSlope() { return this.res ? fmt(this.res.drift.slope, 4, lang()) : ''; },
      /** p-Wert des Drift-Tests. */
      get kpiDriftP() { return this.res ? fmt(this.res.drift.pValue, 4, lang()) : ''; },
      /** Zeilen der Verletzungstabelle. */
      get violationRows() { return this.res ? violationRows(this.res, gt, lang()) : []; },
      /** Verletzungen vorhanden. */
      get hasViolations() { return this.violationRows.length > 0; },
      /** Titel der Lagekarte. */
      get primaryTitle() { return this.t(this.model.params.chartType === 'i-mr' ? 'charts.primaryImr' : 'charts.primaryXbar'); },
      /** Titel der Streuungskarte. */
      get secondaryTitle() { return this.t(this.model.params.chartType === 'i-mr' ? 'charts.secondaryImr' : 'charts.secondaryXbar'); },
      /**
       * Zahl der Driftformel.
       * @param {'intercept'|'slope'|'se'|'tStat'|'pValue'} key @param {number} d Nachkommastellen
       * @returns {string}
       */
      driftNum(key, d) { return this.res ? fmt(this.res.drift[key], d, lang()) : ''; },

      // ─── Tabelle → Diagramm ────────────────────────────────
      /**
       * Zeile angeklickt: zur Lagekarte scrollen und die Zeile kurz markieren.
       * @param {number} index Punkt der Lagekarte
       */
      highlight(index) {
        this.$root.querySelector('[data-chart-host="primary"]')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        this.state.highlightedIndex = index;
        if (highlightTimer) clearTimeout(highlightTimer);
        highlightTimer = setTimeout(() => { this.state.highlightedIndex = null; highlightTimer = null; }, HIGHLIGHT_MS);
      },
      /** @param {number} index @returns {string} Klasse der markierten Zeile */
      rowClass(index) { return this.state.highlightedIndex === index ? 'module-msa-typ6__violation-row--active' : ''; },

      // ─── Diagramme ─────────────────────────────────────────
      /** Lagekarte. */
      get primaryConfig() { return primaryChart(this.res); },
      /** Streuungskarte. */
      get secondaryConfig() { return secondaryChart(this.res); },
      /** Schlüssel der Lagekarte in den alten `chartEdits`. */
      get legacyPrimaryKey() { return 'control-chart'; },
      /** Schlüssel der Streuungskarte in den alten `chartEdits`. */
      get legacySecondaryKey() { return 'control-chart#2'; },
      /** Schlüssel der Driftgrafik in den alten `chartEdits`. */
      get legacyDriftKey() { return 'scatter'; },

      computed: {
        /** Driftgrafik; die Zeitachse aus den zeilengleich gepaarten Spalten. */
        driftConfig() { return driftChart(this.res, readInputs(this.model, ctx.source), this.t); },
      },
    };
  },
});
