/**
 * D.Mike — Random Generator Module (random-generator.js)
 * Data phase: generates random numbers from various statistical distributions.
 *
 * Migrated to createModule + Alpine CSP. Pure logic (PRNG, distribution
 * registry, sampling, categorical generation, State) lives in
 * random-generator-model.js. This file holds only the view layer:
 *   - declarative template bindings (random-generator.html)
 *   - the histogram / pareto chart (imperative chartManager widget)
 *   - the worksheet-target ColumnPicker (imperative widget)
 *
 * Generated random VALUES are transient (not persisted) — they are regenerated
 * deterministically from the persisted seed on render, matching the legacy
 * getState()/setState() behaviour.
 *
 * @agent  Steuerbar über das Viewmodel: Verteilung wählen
 *   (selectDistribution), ihre Parameter (setDistParam), Umfang und
 *   Startwert (setParam), Kategorien der attributiven Verteilung
 *   (addAttribute, setAttribute, removeAttribute), generieren (generate) und
 *   an einen neuen oder leeren Worksheet senden (toWorksheet). Der
 *   CSV-Download bleibt der Oberfläche vorbehalten; gelesen wird über read()
 *   (AgentRead).
 */

import { openNewWorksheet } from '../../core/worksheet-handoff.js';
import { sendColumnToWorksheet } from '../../core/worksheet-append.js';
import { createModule } from '../../core/template-module.js';
import { readAgentState } from '../../core/agent/agent-read-mixin.js';
import {
  requireEnum, requireKnownId, requireNumber, requireText,
} from '../../core/agent/agent-argcheck.js';
import { targetColumnList } from '../../core/agent/agent-options.js';
import { ColumnPicker, refToKey, keyToRef } from '../../ui/column-picker.js';
import { descriptiveStats } from '../../engines/normality-test-engine.js';
import {
  State,
  DISTRIBUTIONS,
  ATTRIBUTIVE_KEY,
  DIST_KEYS,
  generateSamples,
  generateAttributive,
  attrProbabilities,
  resolveParams,
  clampCount,
  frequency,
  csvEscape,
  parseSeed,
  genId,
} from './random-generator-model.js';

const AUTORUN_DELAY = 80;
const DISPLAY_MAX = 2000;

/**
 * Häufigkeit je Kategorie samt Anteil (0–1); einzige Quelle für Anzeige
 * (`pct`) und Lesefläche (`share`).
 * @param {string[]} data  die erzeugten Werte
 * @returns {{name: string, count: number, share: number}[]}  absteigend nach Anzahl
 */
function frequencyShares(data) {
  const total = data.length;
  return frequency(data).map(([name, count]) => ({ name, count, share: count / total }));
}

const PARAM_KEYS = ['count', 'seed', 'attrCount', 'attrSeed'];
const ATTR_KEYS = ['name', 'weight'];
const TARGET_FILTER = { maxCount: 0 };
/** Welche Eingabe ein fester Schlüssel beschreibt. */
const PARAM_INPUTS = { count: 'countInput', seed: 'seedInput', attrCount: 'attrCountInput', attrSeed: 'attrSeedInput' };

/**
 * Prüft einen Startwert: jede ganze Zahl, auch 0.
 * @param {number|string} value
 * @returns {number}
 */
function requireSeed(value) {
  return requireNumber('value', value, { integer: true });
}
const PARAM_CHECKS = {
  count: (v) => requireNumber('value', v, { min: 1, max: 100000, integer: true }),
  attrCount: (v) => requireNumber('value', v, { min: 1, max: 100000, integer: true }),
  seed: requireSeed,
  attrSeed: requireSeed,
};

/** @param {number} v @returns {string} */
function fmtStatNum(v) {
  if (Math.abs(v) >= 1e6 || (Math.abs(v) < 0.001 && v !== 0)) return v.toExponential(4);
  return v.toFixed(4);
}

/**
 * Die Schlüsselfläche von `setParam`. Sätze je Schlüssel unter
 * `types.Params.<schlüssel>`, dieselben am Label (Alt-Taste).
 *
 * @typedef {object} Params
 * @property {number} [count]  Stichprobenumfang, nur stetig/diskret
 * @property {number} [seed]  Startwert, nur stetig/diskret
 * @property {number} [attrCount]  Stichprobenumfang, nur attributiv
 * @property {number} [attrSeed]  Startwert, nur attributiv
 */

/**
 * Die Schlüsselfläche von `setAttribute`. Sätze unter
 * `types.AttributeFields.<schlüssel>`, dieselben am Spaltenkopf.
 *
 * @typedef {object} AttributeFields
 * @property {string} name  Name der Kategorie
 * @property {number} weight  Gewicht der Kategorie
 */

/**
 * Die Zusammenfassung der erzeugten Werte (`_agentGenerated()`), wie
 * `read().generated` sie liefert. Stetig/diskret: n bis kurtosis;
 * attributiv: n und frequency.
 *
 * @typedef {object} Generated
 * @property {number} n  Zahl der erzeugten Werte
 * @property {number} [mean]  Mittelwert
 * @property {number} [sd]  Standardabweichung
 * @property {number} [median]  Median
 * @property {number} [min]  kleinster Wert
 * @property {number} [max]  größter Wert
 * @property {number} [skewness]  Schiefe
 * @property {number} [kurtosis]  Kurtosis (Exzess)
 * @property {FrequencyRow[]} [frequency]  Häufigkeit je Kategorie
 */

/**
 * @typedef {object} FrequencyRow
 * @property {string} name  Kategorie
 * @property {number} count  Anzahl
 * @property {number} share  Anteil an allen erzeugten Werten (0–1)
 */

/**
 * Die Agenten-Lesefläche des Zufallsgenerators.
 *
 * Die Eingaben leben als Text im flüchtigen Zustand; persistiert sind die beim
 * Generieren aufgelösten Zahlen. Die Lesefläche zeigt die Zahlen und fasst die
 * generierten Werte zusammen — die Werte selbst liest ein Agent nach
 * `toWorksheet` aus dem Worksheet.
 *
 * @typedef {object} AgentRead
 * @property {string|null} currentDist  the selected distribution key, one of `distributions`, or null
 * @property {string[]} distributions  all distribution keys, `attributive` included
 * @property {Object<string, number>} params  the parameters of the current numeric distribution by id
 * @property {Array<{ id: string, min: number|null, max: number|null, default: number }>} activeDistParams  the ids `setDistParam` accepts now
 * @property {string[]} activeParams  the keys `setParam` accepts now
 * @property {number} count  sample size of a numeric distribution
 * @property {number} seed  random seed of a numeric distribution
 * @property {Array<{ id: string, name: string, weight: number }>} attributes  the categories of the attributive distribution
 * @property {number} attrCount  sample size of the attributive distribution
 * @property {number} attrSeed  random seed of the attributive distribution
 * @property {Generated|null} generated  summary of the generated values, each item described under keys; null without values
 * @property {Array<{ key: string, name: string }>} targetColumns  the targets `toWorksheet` accepts: per sheet with an empty column its empty columns, then a `instanceId|sheetId|__new__` entry that appends a new column; null targets a new worksheet
 * @property {string} errorMsg  why the last generation failed, '' without error
 */
export default createModule({
  config: {
    id: 'random-generator',
    engine: 'alpine',
    phase: 'data',
    icon: 'module.random-generator',
    version: '1.1.0',
    meta: import.meta,
  },
  Model: State,

  data(module, _t) {
    return {
      // ── Constants exposed to the template ─────────────────────
      attrKey: ATTRIBUTIVE_KEY,

      // ── Transient view state (not persisted) ──────────────────
      /** Raw string inputs for the active numeric distribution's params. */
      paramInputs: {},
      countInput: '1000',
      seedInput: '42',
      attrCountInput: '50',
      attrSeedInput: '42',
      /** Generated values (numbers or category strings). */
      genData: [],
      /** Why the last generation failed; '' without error. */
      errorMsg: '',
      _chart: null,
      _picker: null,
      _unsubs: [],
      _autoTimer: 0,
      _renderGen: 0,

      // ── Sidebar / selection ───────────────────────────────────

      // ── Agent surface ─────────────────────────────────────────

      /**
       * Den vollständigen Lesezustand dieser Instanz liefern.
       * @agent
       * @param {object} [options] `{ fields?: string[], rows?: { from: number, to: number } }`
       * @returns {AgentRead} Verteilung, Parameter, Kategorien, wählbare Mengen und Zusammenfassung der Werte
       */
      read(options) {
        return readAgentState('random-generator', {
          currentDist: this.model.currentDist,
          distributions: DIST_KEYS,
          params: this.isNumeric() ? { ...this.model.params } : {},
          activeDistParams: this.activeDistParams(),
          activeParams: this.activeParams(),
          count: this.model.count,
          seed: this.model.seed,
          attributes: this.model.attributes.map(a => ({ id: a.id, name: a.name, weight: a.weight })),
          attrCount: this.model.attrCount,
          attrSeed: this.model.attrSeed,
          generated: this._agentGenerated(),
          targetColumns: this.targetColumns(),
          errorMsg: this.errorMsg,
        }, options);
      },
      /** @noagent derived set; der Agent liest sie über read().activeDistParams */
      activeDistParams() {
        if (!this.isNumeric()) return [];
        return DISTRIBUTIONS[this.model.currentDist].params.map(p => ({
          id: p.id, min: p.min ?? null, max: p.max ?? null, default: p.default,
        }));
      },
      /** @noagent derived set; der Agent liest sie über read().activeParams */
      activeParams() {
        if (this.isNumeric()) return ['count', 'seed'];
        if (this.isAttributive()) return ['attrCount', 'attrSeed'];
        return [];
      },
      /** @noagent derived set; der Agent liest sie über read().targetColumns */
      targetColumns() {
        return targetColumnList(module._context.stateManager, TARGET_FILTER);
      },

      /** Zusammenfassung der generierten Werte für die Lesefläche. */
      _agentGenerated() {
        if (!this.genData.length) return null;
        if (this.isAttributive()) {
          return {
            n: this.genData.length,
            frequency: frequencyShares(this.genData),
          };
        }
        const ds = descriptiveStats(this.genData);
        return {
          n: ds.n, mean: ds.mean, sd: ds.stdDev, median: ds.median,
          min: ds.min, max: ds.max, skewness: ds.skewness, kurtosis: ds.kurtosis,
        };
      },

      /**
       * Die Verteilung wählen und sofort generieren.
       * @agent
       * @param {string} key eine der Verteilungen aus `distributions`
       * @returns {void}
       * @throws {Error} wenn `key` keine Verteilung dieses Moduls ist
       */
      selectDistribution(key) {
        requireEnum('key', key, DIST_KEYS);
        this._destroyChart();
        this.model.currentDist = key;
        this.genData = [];
        if (key === ATTRIBUTIVE_KEY) {
          this._syncAttrInputs();
        } else {
          this._syncParamInputs(key);
        }
        this.generate();
        this.$nextTick(() => this._mountPicker());
      },

      /**
       * Einen Parameter der gewählten Verteilung setzen und sofort generieren.
       * @agent
       * @param {string} id einer der Parameter aus `activeDistParams`
       * @param {number|string} value Zahl im Bereich aus `activeDistParams`; Textzahlen werden angenommen
       * @returns {void}
       * @throws {Error} wenn `id` zur gewählten Verteilung nicht passt oder `value` außerhalb des Bereichs liegt
       */
      setDistParam(id, value) {
        const defs = this.activeDistParams();
        requireEnum('id', id, defs.map(p => p.id));
        const p = defs.find(d => d.id === id);
        const n = requireNumber('value', value, { min: p.min ?? undefined, max: p.max ?? undefined });
        this.paramInputs = { ...this.paramInputs, [id]: String(n) };
        this.generate();
      },

      /**
       * Umfang oder Startwert setzen und sofort generieren.
       * @agent
       * @param {keyof Params} key welcher Wert; die zulässigen nennt `activeParams`
       * @param {number|string} value ganze Zahl; Umfang von 1 bis 100000, Startwert beliebig (auch 0); Textzahlen werden angenommen
       * @returns {void}
       * @throws {Error} wenn `key` zur gewählten Verteilung nicht passt oder `value` außerhalb des Bereichs liegt
       */
      setParam(key, value) {
        requireEnum('key', key, PARAM_KEYS);
        requireEnum('key', key, this.activeParams());
        this[PARAM_INPUTS[key]] = String(PARAM_CHECKS[key](value));
        this.generate();
      },

      /** @noagent derived set; the agent reads the distributions via read().distributions */
      categories() {
        const cats = {};
        for (const key of DIST_KEYS.filter(k => k !== ATTRIBUTIVE_KEY)) {
          const d = DISTRIBUTIONS[key];
          if (!cats[d.categoryKey]) cats[d.categoryKey] = [];
          cats[d.categoryKey].push(key);
        }
        return Object.entries(cats).map(([key, dists]) => ({ key, dists }));
      },

      /** @noagent view transform */
      isAttributive() { return this.model.currentDist === ATTRIBUTIVE_KEY; },
      /** @noagent view transform */
      isNumeric() {
        return Boolean(this.model.currentDist)
          && this.model.currentDist !== ATTRIBUTIVE_KEY
          && Boolean(DISTRIBUTIONS[this.model.currentDist]);
      },

      // ── View transformations ──────────────────────────────────

      /** @noagent view transform */
      distName(key) { return _t(DISTRIBUTIONS[key].nameKey); },
      /** @noagent view transform */
      distFormula(key) { return DISTRIBUTIONS[key].formula; },
      /** @noagent view transform */
      distParams() { return DISTRIBUTIONS[this.model.currentDist]?.params || []; },

      /** @noagent view transform */
      paramLabel(p) { return _t(`dist.${this.model.currentDist}.${p.id}.label`); },
      /** @noagent view transform */
      paramHint(p) {
        const key = `dist.${this.model.currentDist}.${p.id}.hint`;
        const text = _t(key);
        return text === key ? '' : text;
      },
      /** @noagent view transform */
      paramMin(p) { return p.min !== undefined ? p.min : false; },
      /** @noagent view transform */
      paramMax(p) { return p.max !== undefined ? p.max : false; },

      /** @noagent view transform */
      attrColor(i) { return `var(--color-chart-${  (i % 10) + 1  })`; },
      /** @noagent view transform */
      removeGlyph() { return '×'; },
      /** @noagent view transform */
      attrFormula() { return 'X ~ Categorical(p₁, p₂, …, pₖ)'; },

      /** @noagent view transform */
      fmtValue(v) {
        const d = DISTRIBUTIONS[this.model.currentDist];
        return (d && d.discrete) ? v.toString() : v.toFixed(6);
      },

      /** @noagent view transform */
      hasResults() { return this.genData.length > 0; },

      /** @noagent view transform */
      dataCountLabel() {
        const total = this.genData.length;
        return total > DISPLAY_MAX ? `${DISPLAY_MAX} / ${total}` : `${total}`;
      },
      /** @noagent view transform; the agent reads a summary via read().generated */
      dataValues() { return this.genData.slice(0, DISPLAY_MAX); },

      // ── Numeric stats KPIs ────────────────────────────────────

      /** @noagent view transform; je Karte `help` = Satz der Kennzahl in `read().generated` */
      statKpis() {
        if (!this.genData.length || this.isAttributive()) return [];
        const ds = descriptiveStats(this.genData);
        return [
          { value: String(ds.n), label: _t('statN'), help: 'modules.random-generator.types.Generated.n' },
          { value: fmtStatNum(ds.mean), label: _t('statMean'), help: 'modules.random-generator.types.Generated.mean' },
          { value: fmtStatNum(ds.stdDev), label: _t('statStd'), help: 'modules.random-generator.types.Generated.sd' },
          { value: fmtStatNum(ds.median), label: _t('statMedian'), help: 'modules.random-generator.types.Generated.median' },
          { value: fmtStatNum(ds.min), label: _t('statMin'), help: 'modules.random-generator.types.Generated.min' },
          { value: fmtStatNum(ds.max), label: _t('statMax'), help: 'modules.random-generator.types.Generated.max' },
          { value: fmtStatNum(ds.skewness), label: _t('statSkewness'), help: 'modules.random-generator.types.Generated.skewness' },
          { value: fmtStatNum(ds.kurtosis), label: _t('statKurtosis'), help: 'modules.random-generator.types.Generated.kurtosis' },
        ];
      },

      // ── Attributive view helpers ──────────────────────────────

      /** @noagent view transform */
      probBars() {
        const probs = attrProbabilities(this.model.attributes);
        return this.model.attributes.map((a, i) => {
          const pct = probs[i].toFixed(1);
          return {
            pct,
            label: `${pct  }%`,
            color: this.attrColor(i),
            title: `${a.name || '?'}: ${pct}%`,
          };
        });
      },

      /** @noagent view transform; je Karte `help` = Satz der Kennzahl in `read().generated` */
      attrKpis() {
        if (!this.genData.length || !this.isAttributive()) return [];
        const total = this.genData.length;
        const sorted = frequency(this.genData);
        return [
          { value: String(total), label: _t('statN'), help: 'modules.random-generator.types.Generated.n' },
          { value: String(sorted.length), label: _t('catCount'), help: 'modules.random-generator.types.Generated.frequency' },
          { value: sorted[0] ? String(sorted[0][0]) : '—', label: _t('mostFrequent'), help: 'modules.random-generator.types.Generated.frequency' },
        ];
      },

      /** @noagent view transform; the agent reads a summary via read().generated */
      freqRows() {
        if (!this.genData.length || !this.isAttributive()) return [];
        const rows = frequencyShares(this.genData);
        const attrOrder = this.model.attributes.map(a => a.name);
        const maxCount = rows.length ? rows[0].count : 1;
        return rows.map(({ name, count, share }) => {
          const idx = attrOrder.indexOf(name);
          const color = idx >= 0 ? this.attrColor(idx) : 'var(--color-text-tertiary)';
          return {
            name,
            count,
            pct: (share * 100).toFixed(1),
            barW: (count / maxCount * 100).toFixed(1),
            color,
          };
        });
      },

      /** @noagent view transform */
      dataChips() {
        const attrOrder = this.model.attributes.map(a => a.name);
        return this.genData.slice(0, DISPLAY_MAX).map((v) => {
          const idx = attrOrder.indexOf(v);
          return { value: v, color: idx >= 0 ? this.attrColor(idx) : 'var(--color-text-tertiary)' };
        });
      },

      // ── Attribute grid handlers ───────────────────────────────

      /**
       * Eine Kategorie der attributiven Verteilung anlegen und sofort generieren.
       * @agent
       * @returns {string} die id der neuen Kategorie (leerer Name, Gewicht 1)
       */
      addAttribute() {
        const attr = { id: genId(), name: '', weight: 1 };
        this.model.attributes.push(attr);
        this.generate();
        return attr.id;
      },
      /**
       * Eine Kategorie entfernen und sofort generieren.
       * @agent
       * @param {string} attrId die id einer Kategorie aus `attributes`
       * @returns {void}
       * @throws {Error} wenn `attrId` keine Kategorie ist
       */
      removeAttribute(attrId) {
        requireKnownId('attrId', attrId, this.model.attributes.map(a => a.id));
        this.model.attributes = this.model.attributes.filter(a => a.id !== attrId);
        this.generate();
      },
      /**
       * Name oder Gewicht einer Kategorie setzen und sofort generieren.
       * @agent
       * @param {string} attrId die id einer Kategorie aus `attributes`
       * @param {keyof AttributeFields} key welches Feld
       * @param {string|number} value der Name (Text, leer erlaubt) oder das Gewicht (Zahl ab 0)
       * @returns {void}
       * @throws {Error} wenn `attrId` oder `key` unbekannt ist oder `value` nicht zum Feld passt
       */
      setAttribute(attrId, key, value) {
        requireKnownId('attrId', attrId, this.model.attributes.map(a => a.id));
        requireEnum('key', key, ATTR_KEYS);
        const a = this.model.attributes.find(x => x.id === attrId);
        if (key === 'name') a.name = requireText('value', value);
        else a.weight = requireNumber('value', value, { min: 0 });
        this.generate();
      },

      // ── DOM input handlers ────────────────────────────────────
      // Die Oberfläche klemmt wie bisher, bevor sie die Senke ruft; eine
      // abgewiesene Eingabe wird auf den gehaltenen Wert zurückgesetzt.

      /** @noagent DOM event handler; the agent uses setDistParam() */
      onDistParamInput(id, event) {
        try {
          this.setDistParam(id, event.target.value);
        } catch {
          event.target.value = this.paramInputs[id] ?? '';
        }
      },

      /** @noagent DOM event handler; the agent uses setParam() */
      onParamInput(key, event) {
        let v = event.target.value;
        if (key === 'count' || key === 'attrCount') v = clampCount(v, key === 'count' ? 1000 : 50);
        if (key === 'seed' || key === 'attrSeed') v = parseSeed(v);
        event.target.value = String(v);
        try {
          this.setParam(key, v);
        } catch {
          event.target.value = this[PARAM_INPUTS[key]];
        }
      },

      /** @noagent DOM event handler; the agent uses setAttribute() */
      onAttributeInput(attrId, key, event) {
        try {
          this.setAttribute(attrId, key, event.target.value);
        } catch {
          const a = this.model.attributes.find(x => x.id === attrId);
          event.target.value = a ? String(a[key]) : '';
        }
      },

      // ── Generation ────────────────────────────────────────────

      /** @noagent helper; verzögertes Generieren für die Oberfläche */
      autoGenerate() {
        clearTimeout(this._autoTimer);
        this._autoTimer = setTimeout(() => this.generate(), AUTORUN_DELAY);
      },

      /**
       * Erzeugt die Werte mit den aktuellen Eingaben. Ohne gewählte Verteilung
       * geschieht nichts; ein Fehler der Verteilung steht in `errorMsg`, keine Absage.
       * @agent
       * @returns {void}
       */
      generate() {
        this.errorMsg = '';
        try {
          if (this.isAttributive()) return this._generateAttributive();
          if (this.isNumeric()) return this._generateNumeric();
        } catch (err) {
          this.genData = [];
          this._destroyChart();
          this.errorMsg = _t('errGenerate', { message: err?.message ?? String(err) });
        }
      },

      _generateNumeric() {
        const seed = parseSeed(this.seedInput);
        const count = clampCount(this.countInput, 1000);
        const params = resolveParams(this.model.currentDist, this.paramInputs);

        this.genData = generateSamples(this.model.currentDist, params, count, seed);

        // Persist exactly what legacy stored.
        this.model.seed = seed;
        this.model.count = count;
        this.model.params = params;

        const gen = ++this._renderGen;
        this.$nextTick(() => this._renderHistogram(gen));
      },

      _generateAttributive() {
        const seed = parseSeed(this.attrSeedInput);
        const count = clampCount(this.attrCountInput, 50);
        this.model.attrSeed = seed;
        this.model.attrCount = count;

        this.genData = generateAttributive(this.model.attributes, count, seed);

        if (!this.genData.length) {
          this._destroyChart();
          return;
        }
        const gen = ++this._renderGen;
        this.$nextTick(() => this._renderAttrChart(gen));
      },

      // ── Charts (imperative chartManager widgets) ──────────────

      _destroyChart() {
        if (this._chart) {
          try { module._context.chartManager.destroy(this._chart); } catch { /* ignore */ }
          this._chart = null;
        }
      },

      async _renderHistogram(gen) {
        this._destroyChart();
        const area = module._container.querySelector('[data-ref="rg-hist"]');
        if (!area || gen !== this._renderGen) return;
        area.replaceChildren();
        const d = DISTRIBUTIONS[this.model.currentDist];
        const distName = _t(d.nameKey);
        const chart = await module._context.chartManager.create(area, 'histogram', {
          title: `${_t('histogram')  } — ${  distName}`,
          data: this.genData,
          binMethod: 'sturges',
          showNormalCurve: !d.discrete,
          barColor: 'var(--color-chart-1)',
          normalCurveColor: 'var(--color-chart-2)',
          showLegend: !d.discrete,
          xLabel: distName,
          yLabel: '',
        });
        if (gen !== this._renderGen) { module._context.chartManager.destroy(chart); return; }
        this._chart = chart;
      },

      async _renderAttrChart(gen) {
        this._destroyChart();
        const area = module._container.querySelector('[data-ref="rg-hist"]');
        if (!area || gen !== this._renderGen) return;
        area.replaceChildren();
        const attrOrder = this.model.attributes.map(a => a.name);
        const items = frequency(this.genData).map(([name, value]) => {
          const idx = attrOrder.indexOf(name);
          return { name, value, color: idx >= 0 ? this.attrColor(idx) : 'var(--color-chart-1)' };
        });
        const chart = await module._context.chartManager.create(area, 'pareto', {
          title: `${_t('distAttributive')  } — ${  _t('frequency')}`,
          items,
          refLineValue: 80,
        });
        if (gen !== this._renderGen) { module._context.chartManager.destroy(chart); return; }
        this._chart = chart;
      },

      // ── CSV export ────────────────────────────────────────────

      /** @noagent downloads a file; an agent sends the values to a worksheet via toWorksheet() */
      exportCSV() {
        if (!this.genData.length) return;
        const lines = ['Value'];
        if (this.isAttributive()) {
          this.genData.forEach(v => lines.push(csvEscape(v)));
        } else {
          const d = DISTRIBUTIONS[this.model.currentDist];
          this.genData.forEach(v => lines.push(d.discrete ? v.toString() : v.toFixed(8)));
        }
        const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        const seed = this.isAttributive() ? this.attrSeedInput : this.seedInput;
        a.download = `${this.model.currentDist}_seed${seed}_n${this.genData.length}.csv`;
        a.click();
        URL.revokeObjectURL(a.href);
        module._context.notify(_t('csvExported'));
      },

      // ── To Worksheet ──────────────────────────────────────────

      /**
       * Die generierten Werte als neue Spalte an einen neuen oder leeren Worksheet senden.
       * @agent
       * @param {{ instanceId: string, sheetId: string, columnId: string }|null} target
       *   null für einen neuen Worksheet, sonst ein Spaltenbezug aus `targetColumns`;
       *   columnId `'__new__'` hängt eine neue Spalte an das Blatt an
       * @returns {Promise<{ instanceId: string }|null>} der empfangende Worksheet, oder null ohne Werte
       * @throws {Error} wenn `target` keine wählbare Spalte ist
       */
      async toWorksheet(target) {
        if (target != null) {
          requireKnownId('target', refToKey(target), this.targetColumns().map(c => c.key));
        }
        if (!this.genData.length) return null;

        const isAttr = this.isAttributive();
        const name = isAttr ? _t('distAttributive') : _t(DISTRIBUTIONS[this.model.currentDist].nameKey);
        const discrete = isAttr ? true : Boolean(DISTRIBUTIONS[this.model.currentDist].discrete);
        const type = isAttr ? 'text' : 'numeric';
        const values = [...this.genData];

        if (target == null) {
          return { instanceId: await this._createWorksheetAndSend(name, values, type, discrete) };
        }

        const clean = keyToRef(refToKey(target));
        // Auch ein nicht eingehängter Worksheet bekommt die Spalte (Bug 13);
        // ein unbekanntes Ziel wirft, und dann gibt es keine Erfolgsmeldung.
        sendColumnToWorksheet(module._context, clean.instanceId, {
          sheetId: clean.sheetId,
          colId: clean.columnId,
          name, values, discrete, type,
        });
        module._context.notify(_t('sentToWorksheet'));
        return { instanceId: clean.instanceId };
      },

      /** @noagent DOM event handler; the agent uses toWorksheet() */
      async onToWorksheet() {
        const v = this._picker?.value;
        if (!v) {
          module._context.notify(_t('selectTarget'));
          return;
        }
        try {
          await this.toWorksheet(v === ColumnPicker.NEW_WORKSHEET ? null : v);
        } catch (err) {
          module._context.notify(err?.message ?? String(err), 'error');
        }
      },

      async _createWorksheetAndSend(name, values, type, discrete) {
        const ctx = module._context;
        const wsId = await openNewWorksheet(ctx, {
          sheetName: ctx.i18n.t('modules.worksheet.defaultSheetName'),
        });
        sendColumnToWorksheet(ctx, wsId, {
          sheetId: 'sheet_1',
          colId: '__first__',
          name, values, discrete, type,
        });
        ctx.notify(_t('sentToWorksheet'));
        return wsId;
      },

      // ── Input synchronisation (model → raw string inputs) ─────

      _syncParamInputs(key) {
        const d = DISTRIBUTIONS[key];
        const inputs = {};
        const stored = this.model.params || {};
        d.params.forEach(p => {
          inputs[p.id] = String(stored[p.id] !== undefined ? stored[p.id] : p.default);
        });
        this.paramInputs = inputs;
        this.countInput = String(this.model.count ?? 1000);
        this.seedInput = String(this.model.seed ?? 42);
      },

      _syncAttrInputs() {
        this.attrCountInput = String(this.model.attrCount ?? 50);
        this.attrSeedInput = String(this.model.attrSeed ?? 42);
      },

      // ── ColumnPicker (imperative widget) ──────────────────────

      _mountPicker() {
        const wrap = module._container.querySelector('[data-ref="rg-target-wrap"]');
        if (!wrap) return;
        this._picker?.destroy();
        this._picker = new ColumnPicker(wrap, module._context, {
          mode: 'single',
          ...TARGET_FILTER,
          allowCreateWorksheet: true,
        });
      },

      // ── Lifecycle (per Alpine component) ──────────────────────

      /** @noagent lifecycle */
      init() {
        this._unsubs = [];
        this.genData = [];

        const eb = module._context.eventBus;
        const onActivated = ({ instanceId }) => {
          if (instanceId === module._context.instanceId) this._picker?.refresh();
        };
        eb.on('module:activated', onActivated);
        this._unsubs.push(() => eb.off('module:activated', onActivated));

        const onTheme = () => {
          if (this.genData.length) {
            const gen = ++this._renderGen;
            if (this.isAttributive()) this._renderAttrChart(gen);
            else this._renderHistogram(gen);
          }
        };
        eb.on('theme:changed', onTheme);
        this._unsubs.push(() => eb.off('theme:changed', onTheme));

        // Restore inputs + regenerate from persisted state.
        if (this.model.currentDist === ATTRIBUTIVE_KEY) {
          this._syncAttrInputs();
        } else if (this.isNumeric()) {
          this._syncParamInputs(this.model.currentDist);
        }
        this.$nextTick(() => {
          if (this.model.currentDist) {
            this._mountPicker();
            this.generate();
          }
        });
      },

      /** @noagent lifecycle */
      destroy() {
        clearTimeout(this._autoTimer);
        for (const unsub of this._unsubs) unsub();
        this._unsubs = [];
        this._destroyChart();
        this._picker?.destroy();
        this._picker = null;
        this.genData = [];
      },
    };
  },
});
