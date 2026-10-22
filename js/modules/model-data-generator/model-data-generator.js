/**
 * D.Mike — Model Data Generator Module (model-data-generator.js)
 *
 * Data phase: generates synthetic datasets from configurable regression models.
 * Supports factors with min/max ranges, interaction terms up to 5th order,
 * configurable beta coefficients, multiple sampling methods (Monte Carlo, LHS,
 * full factorial), noise injection and a seeded PRNG for reproducibility.
 *
 * View-only module (Alpine CSP). All state and computation live in the Model
 * (model-data-generator-model.js); this file holds the view transformations,
 * event handlers and the imperative DataGrid preview mount.
 *
 * @agent  Steuerbar über das Viewmodel: Faktoren anlegen, entfernen und
 *   ändern (addFactor, removeFactor, setFactor), Koeffizienten setzen
 *   (setBeta, setIntercept), die Ausgabe und das Stichprobenverfahren
 *   einstellen (setYName, setSamplingMethod, setSampleSize, setNoiseStd,
 *   setSeed), generieren (generate) und an einen neuen Worksheet senden
 *   (toWorksheet). Faktoren und Terme werden über ihren Index angesprochen;
 *   gelesen wird über read() (AgentRead). Die erzeugten Zeilen liest ein
 *   Agent nach toWorksheet aus dem Worksheet.
 */

import { createModule } from '../../core/template-module.js';
import { DataGrid } from '../../core/datagrid/datagrid.js';
import { openGridInWorksheet } from '../../core/datagrid/datagrid-to-worksheet.js';
import { readAgentState } from '../../core/agent/agent-read-mixin.js';
import { requireEnum, requireNumber, requireText } from '../../core/agent/agent-argcheck.js';
import { descriptiveStats } from '../../engines/normality-test-engine.js';
import {
  State, Factor, termLabel, SAMPLING_METHODS,
} from './model-data-generator-model.js';

const FACTOR_KEYS = ['name', 'min', 'max'];
const SAMPLE_SIZE_BOUNDS = { min: 10, max: 100000, integer: true };

/**
 * Die Schlüsselfläche von `setFactor`. Sätze je Schlüssel unter
 * `types.FactorFields.<schlüssel>`, dieselben am Spaltenkopf.
 *
 * @typedef {object} FactorFields
 * @property {string} name  Name des Faktors, zugleich Spaltenname der Daten
 * @property {number} min  untere Grenze des Faktorbereichs
 * @property {number} max  obere Grenze des Faktorbereichs
 */

/**
 * Die Zusammenfassung der erzeugten Y-Werte, wie `generate()` und
 * `read().generated` sie liefern; dieselbe Rechnung wie die Kennzahlen-Leiste.
 *
 * @typedef {object} Generated
 * @property {number} n  Zahl der erzeugten Zeilen
 * @property {number} mean  Mittelwert von Y
 * @property {number} sd  Standardabweichung von Y
 * @property {number} min  kleinster Y-Wert
 * @property {number} max  größter Y-Wert
 */

/**
 * Die Agenten-Lesefläche des Modelldaten-Generators.
 *
 * Faktoren und Terme tragen keine ids; ihr `index` ist ihre Adresse für
 * `setFactor`, `removeFactor` und `setBeta`. Die Koeffizienten stehen
 * vollständig in `terms`, auch die Nullen. Die erzeugten Zeilen liest ein
 * Agent nach `toWorksheet` aus dem Worksheet.
 *
 * @typedef {object} AgentRead
 * @property {Array<{ index: number, name: string, min: number, max: number }>} factors  the factors; `index` addresses them in setFactor and removeFactor
 * @property {Array<{ index: number, label: string, order: number, beta: number }>} terms  all model terms with their coefficients; `index` addresses them in setBeta
 * @property {number} intercept  the intercept β₀
 * @property {string} yName  name of the response column
 * @property {string} samplingMethod  the sampling method, one of `samplingMethods`
 * @property {string[]} samplingMethods  the methods setSamplingMethod accepts
 * @property {number} sampleSize  requested number of rows
 * @property {number} noiseStd  standard deviation of the noise
 * @property {number} seed  random seed
 * @property {number} maxOrder  highest interaction order of the terms
 * @property {Generated|null} generated  summary of the generated Y values, each item described under keys; null without data
 */

export default createModule({
  config: {
    id: 'model-data-generator',
    engine: 'alpine',
    phase: 'data',
    icon: 'module.model-data-generator',
    version: '1.0.0',
    meta: import.meta,
  },
  Model: State,

  data(module, _t) {
    return {
      // ── Transient UI state (not persisted) ────────────────────
      generatedData: null,
      resultsVisible: false,
      statKpis: [],
      rowCountText: '',
      _grid: null,

      // ── View transformations ──────────────────────────────────

      /** @noagent view transform; the agent reads the terms via read().terms. Equation tail: one styled span per non-zero term. */
      equationParts() {
        const parts = [];
        this.model.terms.forEach(term => {
          const b = term.beta;
          if (b === 0) return;
          const vars = term.indices
            .map(fi => this.model.factors[fi]?.name || `X${fi + 1}`)
            .join('·');
          const sign = b > 0 ? '+' : '−';
          parts.push(` ${sign} ${Math.abs(b)}·${vars}`);
        });
        return parts;
      },

      /** @noagent view transform; the agent reads the terms via read().terms. Beta inputs grouped by interaction order. */
      betaGroups() {
        const grouped = new Map();
        this.model.terms.forEach((term, idx) => {
          const order = term.indices.length;
          const label = order === 1 ? _t('mainEffects') : `${order}-${_t('wayInteractions')}`;
          if (!grouped.has(label)) grouped.set(label, []);
          grouped.get(label).push({
            idx,
            label: termLabel(term.indices, this.model.factors),
            term,
          });
        });
        return Array.from(grouped, ([label, items]) => ({ label, items }));
      },

      // ── Agent surface ─────────────────────────────────────────

      /**
       * Den vollständigen Lesezustand dieser Instanz liefern.
       * @agent
       * @param {object} [options] `{ fields?: string[], rows?: { from: number, to: number } }`
       * @returns {AgentRead} Faktoren, Terme mit Koeffizienten, Einstellungen und Zusammenfassung der erzeugten Werte
       */
      read(options) {
        const m = this.model;
        return readAgentState('model-data-generator', {
          factors: m.factors.map((f, index) => ({ index, name: f.name, min: f.min, max: f.max })),
          terms: m.terms.map((t, index) => ({
            index,
            label: termLabel(t.indices, m.factors),
            order: t.indices.length,
            beta: t.beta,
          })),
          intercept: m.intercept,
          yName: m.yName,
          samplingMethod: m.samplingMethod,
          samplingMethods: SAMPLING_METHODS,
          sampleSize: m.sampleSize,
          noiseStd: m.noiseStd,
          seed: m.seed,
          maxOrder: m.maxOrder,
          generated: this._agentGenerated(),
        }, options);
      },

      /**
       * Einen Faktor mit Standardname und Bereich 0 bis 100 anhängen; ein
       * erzeugtes Ergebnis und alle Koeffizienten werden zurückgesetzt.
       * @agent
       * @returns {number} der Index des neuen Faktors
       */
      addFactor() {
        this.model.factors.push(new Factor(`Faktor_${this.model.factors.length + 1}`, 0, 100));
        this.model.rebuildTerms();
        this._resetResults();
        return this.model.factors.length - 1;
      },

      /**
       * Einen Faktor entfernen; ein erzeugtes Ergebnis und alle Koeffizienten
       * werden zurückgesetzt. Der letzte Faktor bleibt stehen.
       * @agent
       * @param {number} index Index eines Faktors aus `factors`
       * @returns {boolean} false, wenn nur noch ein Faktor übrig ist und nichts entfernt wurde
       * @throws {Error} wenn `index` kein Faktor ist
       */
      removeFactor(index) {
        const i = requireNumber('index', index, { min: 0, max: this.model.factors.length - 1, integer: true });
        if (this.model.factors.length <= 1) return false;
        this.model.factors.splice(i, 1);
        this.model.rebuildTerms();
        this._resetResults();
        return true;
      },

      /**
       * Name oder Bereichsgrenze eines Faktors setzen; ein erzeugtes Ergebnis
       * wird verworfen.
       * @agent
       * @param {number} index Index eines Faktors aus `factors`
       * @param {keyof FactorFields} key welches Feld
       * @param {string|number} value der Name (Text, nicht leer, kein anderer Faktor und nicht Y) oder die Grenze (Zahl, min ≤ max); Textzahlen werden angenommen
       * @returns {void}
       * @throws {Error} wenn `index` oder `key` unbekannt ist oder `value` nicht zum Feld passt
       */
      setFactor(index, key, value) {
        const i = requireNumber('index', index, { min: 0, max: this.model.factors.length - 1, integer: true });
        requireEnum('key', key, FACTOR_KEYS);
        const f = this.model.factors[i];
        if (key === 'name') {
          const name = requireText('value', value);
          if (!name.trim()) throw new Error('invalid value ""; allowed: a non-empty name');
          this._requireFreeName(name, i);
          f.name = name;
        } else if (key === 'min') {
          f.min = requireNumber('value', value, { max: f.max });
        } else {
          f.max = requireNumber('value', value, { min: f.min });
        }
        this._resetResults();
      },

      /**
       * Den Koeffizienten eines Terms setzen.
       * @agent
       * @param {number} index Index eines Terms aus `terms`
       * @param {number|string} value endliche Zahl; Textzahlen werden angenommen
       * @returns {void}
       * @throws {Error} wenn `index` kein Term ist oder `value` keine Zahl ist
       */
      setBeta(index, value) {
        const i = requireNumber('index', index, { min: 0, max: this.model.terms.length - 1, integer: true });
        this.model.terms[i].beta = requireNumber('value', value);
      },

      /**
       * Den Achsenabschnitt β₀ setzen.
       * @agent
       * @param {number|string} value endliche Zahl; Textzahlen werden angenommen
       * @returns {void}
       * @throws {Error} wenn `value` keine endliche Zahl ist
       */
      setIntercept(value) {
        this.model.intercept = requireNumber('value', value);
      },

      /**
       * Den Namen der Y-Spalte setzen.
       * @agent
       * @param {string} value Text, nicht leer und kein Faktorname
       * @returns {void}
       * @throws {Error} wenn `value` leer ist oder einen Faktor benennt
       */
      setYName(value) {
        const name = requireText('value', value);
        if (!name.trim()) throw new Error('invalid value ""; allowed: a non-empty name');
        this._requireFreeName(name, -1);
        this.model.yName = name;
      },

      /**
       * Das Stichprobenverfahren wählen.
       * @agent
       * @param {string} value eines der Verfahren aus `samplingMethods`
       * @returns {void}
       * @throws {Error} wenn `value` kein Verfahren dieses Moduls ist
       */
      setSamplingMethod(value) {
        requireEnum('value', value, SAMPLING_METHODS);
        this.model.samplingMethod = value;
      },

      /**
       * Die Zahl der Zeilen setzen (beim Vollfaktorplan nur ein Richtwert).
       * @agent
       * @param {number|string} value ganze Zahl von 10 bis 100000; Textzahlen werden angenommen
       * @returns {void}
       * @throws {Error} wenn `value` keine ganze Zahl im Bereich ist
       */
      setSampleSize(value) {
        this.model.sampleSize = requireNumber('value', value, SAMPLE_SIZE_BOUNDS);
      },

      /**
       * Die Standardabweichung des Rauschens σε setzen.
       * @agent
       * @param {number|string} value Zahl ab 0; Textzahlen werden angenommen
       * @returns {void}
       * @throws {Error} wenn `value` keine Zahl ab 0 ist
       */
      setNoiseStd(value) {
        this.model.noiseStd = requireNumber('value', value, { min: 0 });
      },

      /**
       * Den Startwert des Zufallsgenerators setzen.
       * @agent
       * @param {number|string} value ganze Zahl; Textzahlen werden angenommen
       * @returns {void}
       * @throws {Error} wenn `value` keine ganze Zahl ist
       */
      setSeed(value) {
        this.model.seed = requireNumber('value', value, { integer: true });
      },

      /**
       * Daten aus dem Modell erzeugen und in der Vorschau zeigen.
       * @agent
       * @returns {Generated} Zusammenfassung der erzeugten Y-Werte
       */
      generate() {
        const rows = this.model.generate();
        this.generatedData = rows;
        this._computeStats(rows);
        this.rowCountText = `(${rows.length} ${_t('rows')})`;
        this.resultsVisible = true;
        // Mount after Alpine flushes x-show so the grid measures a visible container.
        this.$nextTick(() => this._mountGrid());
        return this._agentGenerated();
      },

      /**
       * Die erzeugten Daten in einem neuen Worksheet öffnen und dorthin
       * wechseln. Ohne erzeugte Daten wird zuerst generiert.
       * @agent
       * @returns {Promise<string>} die id des neuen Worksheets
       * @throws {Error} wenn die Vorschau nicht eingehängt werden konnte
       */
      async toWorksheet() {
        if (!this.generatedData) this.generate();
        await this.$nextTick();
        if (!this._grid) this._mountGrid();
        return this._openInWorksheet(this._grid);
      },

      // ── Internal helpers ──────────────────────────────────────

      /** Zusammenfassung der erzeugten Y-Werte (Quelle auch der Kennzahlen-Leiste). */
      _agentGenerated() {
        if (!this.generatedData?.length) return null;
        const ds = descriptiveStats(this.generatedData.map(r => r[this.model.yName]));
        return { n: ds.n, mean: ds.mean, sd: ds.stdDev, min: ds.min, max: ds.max };
      },

      /** Wirft, wenn `name` schon ein anderer Faktor (nicht `exceptIndex`) oder Y heißt. */
      _requireFreeName(name, exceptIndex) {
        const taken = this.model.factors.some((f, i) => i !== exceptIndex && f.name === name)
          || (exceptIndex !== -1 && this.model.yName === name);
        if (taken) throw new Error(`invalid value ${JSON.stringify(name)}; allowed: a name no other factor or Y uses`);
      },

      /** Das Grid als neues Worksheet öffnen — Weg des Grid-Knopfs und von toWorksheet. */
      _openInWorksheet(grid) {
        const ctx = module._context;
        const name = ctx.i18n.t('modules.model-data-generator.name') || 'Generated Data';
        return openGridInWorksheet(grid, ctx, { sheetName: name, navigate: true });
      },

      _resetResults() {
        this.generatedData = null;
        this.resultsVisible = false;
        this._destroyGrid();
      },

      _computeStats(rows) {
        const yv = rows.map(r => r[this.model.yName]);
        const ds = descriptiveStats(yv);
        const fmt = v =>
          (Math.abs(v) >= 1e6 || (Math.abs(v) < 0.001 && v !== 0))
            ? v.toExponential(4)
            : v.toFixed(4);
        this.statKpis = [
          { label: 'N', value: ds.n },
          { label: _t('statMean'), value: fmt(ds.mean) },
          { label: _t('statStd'), value: fmt(ds.stdDev) },
          { label: 'Min', value: fmt(ds.min) },
          { label: 'Max', value: fmt(ds.max) },
        ];
      },

      _mountGrid() {
        // Note: `$el` inside an event handler is the clicked element, not the
        // component root — query from the stable module host container instead.
        const wrap = module._container.querySelector('#mdg-data-table');
        if (!wrap || !this.generatedData?.length) return;
        this._destroyGrid();
        wrap.replaceChildren();

        const ctx = module._context;
        const colNames = Object.keys(this.generatedData[0]);
        const columns = colNames.map(name => ({
          name,
          type: 'numeric',
          values: this.generatedData.map(r => r[name]),
          format: { decimals: 4 },
        }));

        this._grid = new DataGrid(wrap, {
          toast: ctx.notify || (() => {}),
          t: (key) => ctx.i18n.t(key),
          dialog: ctx.dialog,
          openInWorksheet: (grid) => { this._openInWorksheet(grid); },
        });
        this._grid.setData(columns);
      },

      _destroyGrid() {
        if (this._grid) {
          try { this._grid.destroy(); } catch { /* ignore */ }
          this._grid = null;
        }
      },

      /** @noagent lifecycle */
      destroy() {
        this._destroyGrid();
      },
    };
  },
});
