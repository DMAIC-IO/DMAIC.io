/**
 * DMAIC.io — MSA Typ 5 Module (msa-typ5.js)
 * Measure phase: Attribute Measurement System Analysis.
 * Fünf Prüfer x Teile x Wiederholungen mit binärem / nominalem / ordinalem
 * Merkmal — Kappa-basierte Übereinstimmung, Effektivität, Signal Detection.
 *
 * Spec: docs/superpowers/specs/2026-07-15-msa-typ5-design.md
 */

import { analyze } from '../../engines/msa-typ5-engine.js';
import { ColumnPicker, getColumnValues } from '../../ui/column-picker.js';
import {
  provisionWorksheet as _provisionWorksheet,
  removeProvisionedWorksheet as _removeProvisionedWorksheet,
} from '../../core/examples-registry.js';

export default {
  id: 'msa-typ5',
  phase: 'measure',
  icon: 'check-square',
  i18nKey: 'modules.msa-typ5',
  version: '1.0.0',

  _container: null,
  _context: null,
  _t: null,
  _result: null,
  _params: {
    type: 'binary',
    positiveLevel: null,
    ordinalOrder: null,
    weights: 'quadratic',
    alpha: 0.05,
  },
  _columnRefs: {
    part: null, appraiser: null, rating: null, reference: null, replicate: null,
  },
  _pickers: {
    part: null, appraiser: null, rating: null, reference: null, replicate: null,
  },
  _exampleWorksheetId: null,
  _charts: [],
  _eventUnsubs: [],

  help: () => import('./msa-typ5-help.js'),

  // ─── Lifecycle ──────────────────────────────────────────────

  async init(container, context) {
    this._container = container;
    this._context = context;
    this._t = (key, vars) => context.i18n.t(key, vars);

    if (!document.getElementById('msa-typ5-css')) {
      const link = document.createElement('link');
      link.id = 'msa-typ5-css';
      link.rel = 'stylesheet';
      link.href = './js/modules/msa-typ5/msa-typ5.css';
      document.head.appendChild(link);
    }

    // ─── Event subscriptions ─────────────────────────────────
    const refreshPickers = ({ instanceId } = {}) => {
      if (!instanceId || instanceId === context.instanceId) {
        for (const p of Object.values(this._pickers)) p?.refresh?.();
      }
    };
    // Worksheet-Zellen-Edits ändern die Spaltenauswahl nicht, aber die Daten:
    // ColumnPicker.refresh() greift dann nicht — Analyse muss selbst neu laufen.
    const rerunOnData = () => this._tryAutoAnalysis();
    const nullOnColumnRemoved = ({ instanceId, columnId } = {}) => {
      let touched = false;
      for (const role of Object.keys(this._columnRefs)) {
        const r = this._columnRefs[role];
        if (r && r.instanceId === instanceId && r.columnId === columnId) {
          this._columnRefs[role] = null;
          touched = true;
        }
      }
      if (touched) { this._save(); this._render(); this._tryAutoAnalysis(); }
    };
    const nullOnWorksheetRemoved = ({ instanceId } = {}) => {
      let touched = false;
      for (const role of Object.keys(this._columnRefs)) {
        if (this._columnRefs[role]?.instanceId === instanceId) {
          this._columnRefs[role] = null;
          touched = true;
        }
      }
      if (touched) { this._save(); this._render(); this._tryAutoAnalysis(); }
    };
    context.eventBus.on('module:activated', refreshPickers);
    context.eventBus.on('state:saved', rerunOnData);
    context.eventBus.on('worksheet:dataChanged', rerunOnData);
    context.eventBus.on('worksheet:column-removed', nullOnColumnRemoved);
    context.eventBus.on('worksheet:removed', nullOnWorksheetRemoved);
    this._eventUnsubs.push(
      () => context.eventBus.off('module:activated', refreshPickers),
      () => context.eventBus.off('state:saved', rerunOnData),
      () => context.eventBus.off('worksheet:dataChanged', rerunOnData),
      () => context.eventBus.off('worksheet:column-removed', nullOnColumnRemoved),
      () => context.eventBus.off('worksheet:removed', nullOnWorksheetRemoved),
    );

    container.innerHTML = '';
    this._render();
    this._tryAutoAnalysis();
  },

  async destroy() {
    for (const u of this._eventUnsubs) u();
    this._eventUnsubs = [];
    this._destroyCharts();
    for (const p of Object.values(this._pickers)) p?.destroy?.();
    this._pickers = { part: null, appraiser: null, rating: null, reference: null, replicate: null };
    if (this._container) this._container.innerHTML = '';
  },

  onLanguageChange() { if (this._container) this._render(); },
  onThemeChange()    { if (this._container) this._render(); },

  // ─── Data hooks ─────────────────────────────────────────────

  getState() {
    return {
      version: this.version,
      params: { ...this._params },
      columns: {
        part:      this._columnRefs.part      ? { ...this._columnRefs.part }      : null,
        appraiser: this._columnRefs.appraiser ? { ...this._columnRefs.appraiser } : null,
        rating:    this._columnRefs.rating    ? { ...this._columnRefs.rating }    : null,
        reference: this._columnRefs.reference ? { ...this._columnRefs.reference } : null,
        replicate: this._columnRefs.replicate ? { ...this._columnRefs.replicate } : null,
      },
      exampleWorksheetId: this._exampleWorksheetId,
    };
  },

  setState(data) {
    if (!data || typeof data !== 'object') return;
    if (data.params)  this._params      = { ...this._params, ...data.params };
    if (data.columns) this._columnRefs  = { ...this._columnRefs, ...data.columns };
    if (data.exampleWorksheetId !== undefined) this._exampleWorksheetId = data.exampleWorksheetId;
    if (this._container) this._render();
  },

  // ─── Render ─────────────────────────────────────────────────

  _render() {
    for (const p of Object.values(this._pickers)) p?.destroy?.();
    this._pickers = { part: null, appraiser: null, rating: null, reference: null, replicate: null };
    this._destroyCharts();

    const t = this._t;
    const p = this._params;
    const isOrdinal = p.type === 'ordinal';
    const isBinary  = p.type === 'binary';

    this._container.innerHTML = `
      <div class="module-msa-typ5 dmike-split">
        <div class="dmike-split__input">
          <div class="dmike-split__section-title">${t('modules.msa-typ5.sections.feature')}</div>

          <fieldset class="msa-typ5__radios">
            <legend>${t('modules.msa-typ5.labels.type')}</legend>
            <label><input type="radio" name="msa5-type" value="binary"  ${isBinary  ? 'checked' : ''}> ${t('modules.msa-typ5.labels.typeBinary')}</label>
            <label><input type="radio" name="msa5-type" value="nominal" ${p.type === 'nominal' ? 'checked' : ''}> ${t('modules.msa-typ5.labels.typeNominal')}</label>
            <label><input type="radio" name="msa5-type" value="ordinal" ${isOrdinal ? 'checked' : ''}> ${t('modules.msa-typ5.labels.typeOrdinal')}</label>
          </fieldset>

          <fieldset class="msa-typ5__radios${isOrdinal ? '' : ' msa-typ5__hidden'}">
            <legend>${t('modules.msa-typ5.labels.weights')}</legend>
            <label><input type="radio" name="msa5-weights" value="linear"    ${p.weights === 'linear'    ? 'checked' : ''}> ${t('modules.msa-typ5.labels.weightsLinear')}</label>
            <label><input type="radio" name="msa5-weights" value="quadratic" ${p.weights === 'quadratic' ? 'checked' : ''}> ${t('modules.msa-typ5.labels.weightsQuadratic')}</label>
          </fieldset>

          <div class="dmike-split__section-title">${t('modules.msa-typ5.sections.dataSource')}</div>

          <div class="field-group"><label>${t('modules.msa-typ5.labels.partColumn')}</label>      <div data-ref="col-part-wrap"></div></div>
          <div class="field-group"><label>${t('modules.msa-typ5.labels.appraiserColumn')}</label> <div data-ref="col-appraiser-wrap"></div></div>
          <div class="field-group"><label>${t('modules.msa-typ5.labels.ratingColumn')}</label>    <div data-ref="col-rating-wrap"></div></div>
          <div class="field-group"><label>${t('modules.msa-typ5.labels.referenceColumn')}</label> <div data-ref="col-reference-wrap"></div></div>
          <div class="field-group"><label>${t('modules.msa-typ5.labels.replicateColumn')}</label> <div data-ref="col-replicate-wrap"></div></div>

          <div class="dmike-split__section-title">${t('modules.msa-typ5.labels.detectedLevels')}</div>
          <div class="msa-typ5__levels" data-ref="levels-panel"></div>

          <div class="dmike-split__section-title">${t('modules.msa-typ5.sections.evaluation')}</div>

          <div class="field-group">
            <label>${t('modules.msa-typ5.labels.alpha')}</label>
            <select class="field" data-ref="sel-alpha">
              <option value="0.01" ${p.alpha === 0.01 ? 'selected' : ''}>0.01</option>
              <option value="0.05" ${p.alpha === 0.05 ? 'selected' : ''}>0.05</option>
              <option value="0.10" ${p.alpha === 0.10 ? 'selected' : ''}>0.10</option>
            </select>
          </div>

          <div class="field-group">
            <label>${t('modules.msa-typ5.labels.referenceSource')}</label>
            <output class="msa-typ5__ref-source" data-ref="ref-source">—</output>
          </div>
        </div>

        <main class="dmike-split__output" data-ref="output">
          <div class="module-msa-typ5__empty">${t('modules.msa-typ5.emptyState')}</div>
        </main>
      </div>
    `;

    this._mountPickers();
    this._bindEvents();
    this._renderLevelsPanel();
  },

  _mountPickers() {
    const pickerConfig = [
      { role: 'part',      wrap: 'col-part-wrap' },
      { role: 'appraiser', wrap: 'col-appraiser-wrap' },
      { role: 'rating',    wrap: 'col-rating-wrap' },
      { role: 'reference', wrap: 'col-reference-wrap' },
      { role: 'replicate', wrap: 'col-replicate-wrap' },
    ];
    for (const { role, wrap } of pickerConfig) {
      const el = this._container.querySelector(`[data-ref="${wrap}"]`);
      if (!el) continue;
      this._pickers[role] = new ColumnPicker(el, this._context, {
        mode: 'single',
        onChange: (ref) => {
          this._columnRefs[role] = ref;
          this._save();
          if (role === 'rating') this._renderLevelsPanel();
          this._tryAutoAnalysis();
        },
      });
      if (this._columnRefs[role]) this._pickers[role].value = this._columnRefs[role];
    }
  },

  _bindEvents() {
    const c = this._container;
    c.querySelectorAll('input[name="msa5-type"]').forEach((el) => {
      el.addEventListener('change', (e) => {
        this._params.type = e.target.value;
        // Positiv-Auswahl beim Merkmalstyp-Wechsel zurücksetzen.
        this._params.positiveLevel = null;
        this._save();
        this._render();
        this._tryAutoAnalysis();
      });
    });
    c.querySelectorAll('input[name="msa5-weights"]').forEach((el) => {
      el.addEventListener('change', (e) => {
        this._params.weights = e.target.value;
        this._save();
        this._tryAutoAnalysis();
      });
    });
    const alphaSel = c.querySelector('[data-ref="sel-alpha"]');
    if (alphaSel) {
      alphaSel.addEventListener('change', (e) => {
        this._params.alpha = parseFloat(e.target.value);
        this._save();
        this._tryAutoAnalysis();
      });
    }
  },

  _renderLevelsPanel() {
    const host = this._container?.querySelector('[data-ref="levels-panel"]');
    if (!host) return;
    const values = this._collectRatingValues();
    if (!values.length) {
      host.innerHTML = `<span class="msa-typ5__levels-hint">—</span>`;
      return;
    }

    if (this._params.type === 'binary') {
      // Häufigkeit zählen, die zwei häufigsten als (i.O., n.i.O.) darstellen.
      const [firstTwo] = [this._twoMostFrequent(values)];
      let pos, neg;
      if (this._params.positiveLevel && values.includes(this._params.positiveLevel)) {
        pos = this._params.positiveLevel;
        neg = firstTwo.find((v) => v !== pos) ?? values.find((v) => v !== pos);
      } else {
        [pos, neg] = firstTwo;
      }
      host.innerHTML = `
        <span class="msa-typ5__level msa-typ5__level--pos" title="i.O.">i.O. = ${this._esc(pos ?? '—')}</span>
        <span class="msa-typ5__level msa-typ5__level--neg" title="n.i.O.">n.i.O. = ${this._esc(neg ?? '—')}</span>
        <button type="button" class="dmike-btn dmike-btn--secondary msa-typ5__swap" data-ref="btn-swap">
          ${this._t('modules.msa-typ5.labels.positiveSwap')}
        </button>
      `;
      const swap = host.querySelector('[data-ref="btn-swap"]');
      if (swap && neg !== undefined) {
        swap.addEventListener('click', () => {
          this._params.positiveLevel = neg;
          this._save();
          this._renderLevelsPanel();
          this._tryAutoAnalysis();
        });
      }
    } else {
      const items = values.map((v) => `<span class="msa-typ5__level">${this._esc(v)}</span>`).join('');
      const hint = this._params.type === 'ordinal'
        ? `<div class="msa-typ5__levels-hint">${this._t('modules.msa-typ5.ordinalHint')}</div>`
        : '';
      host.innerHTML = items + hint;
    }
  },

  /**
   * Rohwerte aus der Bewertungs-Spalte einlesen und deduplizieren.
   * Sortierung: für ordinal-numerische Werte numerisch, sonst
   * lexikographisch (nominal/binär). Rückgabe als Strings.
   */
  _collectRatingValues() {
    if (!this._columnRefs.rating) return [];
    const vals = getColumnValues(this._context.stateManager, this._columnRefs.rating) || [];
    const cleaned = vals.filter((v) => v !== null && v !== undefined && v !== '');
    const unique = [...new Set(cleaned.map((v) => String(v)))];
    // Numerisch sortieren, wenn alle Werte Zahlen sind (ordinal-typischer Fall).
    if (unique.length > 0 && unique.every((v) => Number.isFinite(Number(v)))) {
      return unique.sort((a, b) => Number(a) - Number(b));
    }
    return unique.sort();
  },

  /**
   * Zwei häufigste Bewertungs-Werte für den Binär-Fall.
   * Bei Gleichstand entscheidet die Reihenfolge des ersten Auftretens.
   */
  _twoMostFrequent(values) {
    if (!this._columnRefs.rating) return [values[0], values[1]];
    const vals = getColumnValues(this._context.stateManager, this._columnRefs.rating) || [];
    const counts = new Map();
    for (const v of vals) {
      if (v === null || v === undefined || v === '') continue;
      const key = String(v);
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
    return [sorted[0] ?? values[0], sorted[1] ?? values[1]];
  },

  // ─── Actions ────────────────────────────────────────────────

  /**
   * Baut das Long-Format-Ratings-Array aus den 5 Spalten und ruft die Engine.
   * Aktualisiert `this._result`, füllt die Referenz-Quelle-Anzeige und
   * delegiert die Ergebnis-Darstellung an `_renderOutput()`.
   */
  _tryAutoAnalysis() {
    const out = this._container?.querySelector('[data-ref="output"]');
    if (!out) return;

    if (!this._columnRefs.part || !this._columnRefs.appraiser || !this._columnRefs.rating) {
      this._result = null;
      this._destroyCharts();
      this._updateReferenceSourceLabel(null);
      this._renderOutput();
      return;
    }

    const sm = this._context.stateManager;
    const parts   = getColumnValues(sm, this._columnRefs.part)      || [];
    const apprs   = getColumnValues(sm, this._columnRefs.appraiser) || [];
    const ratings = getColumnValues(sm, this._columnRefs.rating)    || [];
    const refs    = this._columnRefs.reference ? (getColumnValues(sm, this._columnRefs.reference) || []) : null;
    const reps    = this._columnRefs.replicate ? (getColumnValues(sm, this._columnRefs.replicate) || []) : null;

    const N = Math.min(parts.length, apprs.length, ratings.length);
    if (N === 0) {
      this._result = null;
      this._updateReferenceSourceLabel(null);
      this._renderOutput();
      return;
    }

    const rows = [];
    const referenceMap = {};
    for (let i = 0; i < N; i++) {
      if (parts[i] === null || parts[i] === undefined || parts[i] === '') continue;
      if (apprs[i] === null || apprs[i] === undefined || apprs[i] === '') continue;
      if (ratings[i] === null || ratings[i] === undefined || ratings[i] === '') continue;
      const row = {
        part: String(parts[i]),
        appraiser: String(apprs[i]),
        value: String(ratings[i]),
      };
      if (reps && reps[i] !== null && reps[i] !== undefined && reps[i] !== '') {
        const r = Number(reps[i]);
        row.rep = Number.isFinite(r) ? r : (i + 1);
      } else {
        row.rep = null;
      }
      rows.push(row);
      if (refs && refs[i] !== null && refs[i] !== undefined && refs[i] !== '') {
        referenceMap[String(parts[i])] = String(refs[i]);
      }
    }

    if (rows.length === 0) {
      this._result = null;
      this._updateReferenceSourceLabel(null);
      this._renderOutput();
      return;
    }

    // Klassen aus den vorkommenden Bewertungs-Werten ableiten. Für binär
    // wird die als "positiv" markierte Klasse an Position 0 geschoben
    // (Konvention der Engine für Miss/False-Alarm/SDT).
    const values = [...new Set(rows.map((r) => r.value))];
    let levels;
    if (this._params.type === 'ordinal') {
      if (values.every((v) => Number.isFinite(Number(v)))) {
        levels = values.sort((a, b) => Number(a) - Number(b));
      } else {
        levels = values.sort();
      }
    } else {
      levels = values.sort();
      if (this._params.type === 'binary' && this._params.positiveLevel && levels.includes(this._params.positiveLevel)) {
        levels = [this._params.positiveLevel, ...levels.filter((v) => v !== this._params.positiveLevel)];
      } else if (this._params.type === 'binary') {
        // Falls kein positiveLevel gesetzt, häufigsten Wert auf Position 0.
        const [pos] = this._twoMostFrequent(values);
        if (pos && levels.includes(pos)) {
          levels = [pos, ...levels.filter((v) => v !== pos)];
        }
      }
    }

    const referencesArg = this._columnRefs.reference
      ? (Object.keys(referenceMap).length > 0 ? referenceMap : {})
      : null;

    let result;
    try {
      result = analyze({
        type: this._params.type,
        levels,
        ratings: rows,
        references: referencesArg,
        params: { alpha: this._params.alpha, weights: this._params.weights },
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[msa-typ5] analyze() threw:', err);
      this._result = null;
      this._updateReferenceSourceLabel(null);
      this._renderOutput();
      return;
    }

    this._result = result;
    this._updateReferenceSourceLabel(result?.meta?.referenceSource ?? null);
    this._renderOutput();
  },

  _updateReferenceSourceLabel(src) {
    const el = this._container?.querySelector('[data-ref="ref-source"]');
    if (!el) return;
    if (!src) { el.textContent = '—'; return; }
    // src ∈ { 'given', 'consensus', 'none' } → labels.referenceSourceGiven/…
    const key = `modules.msa-typ5.labels.referenceSource${src.charAt(0).toUpperCase() + src.slice(1)}`;
    el.textContent = this._t(key);
  },

  /**
   * Rendert Verdikt-Header, KPI-Strip, Interpretationstext, drei Tabellen
   * (Prüfer / Prüferpaare / κ vs. Referenz) und die Chart-Container.
   * Charts selbst rendert `_renderCharts()` (Task 13/14).
   */
  _renderOutput() {
    const out = this._container?.querySelector('[data-ref="output"]');
    if (!out) return;
    const res = this._result;
    if (!res || !res.verdict) {
      const err = res?.meta?.errors?.[0];
      if (err) {
        out.innerHTML = `<div class="module-msa-typ5__empty">${this._translateCode(err, 'err')}</div>`;
        return;
      }
      out.innerHTML = `<div class="module-msa-typ5__empty">${this._t('modules.msa-typ5.emptyState')}</div>`;
      return;
    }

    const t = this._t;
    const f = this._fmt.bind(this);
    const pct = this._fmtPct.bind(this);
    const verdictMod = _verdictClass(res.verdict.level);
    const verdictLabel = t(`modules.msa-typ5.verdict${res.verdict.level.charAt(0).toUpperCase() + res.verdict.level.slice(1)}`);

    // Aggregierte KPIs.
    const effRates = Object.values(res.perAppraiser)
      .map((x) => x.vsReference?.effectiveness?.rate)
      .filter(Number.isFinite);
    const repRates = Object.values(res.perAppraiser)
      .map((x) => x.repeatability?.rate)
      .filter(Number.isFinite);
    const kappaVsRefs = Object.values(res.perAppraiser)
      .map((x) => x.vsReference?.kappa?.kappa)
      .filter(Number.isFinite);
    const meanEff  = _mean(effRates);
    const meanRep  = _mean(repRates);
    const meanKvR  = _mean(kappaVsRefs);

    // Warnungen aus meta.warnings zu Bannern.
    const warnings = (res.meta?.warnings || []).map((w) => {
      const params = { ...(w.params || {}) };
      if (Array.isArray(params.appraisers)) params.appraisers = params.appraisers.join(', ');
      return `<div class="msa-typ5__warn">${this._translateCode({ code: w.code, params }, 'warn')}</div>`;
    }).join('');

    // Prüfer-Tabelle.
    const perApprRows = Object.entries(res.perAppraiser).map(([id, v]) => {
      const rep  = v.repeatability;
      const eff  = v.vsReference?.effectiveness;
      const miss = v.vsReference?.missRate;
      const fa   = v.vsReference?.falseAlarmRate;
      const bias = v.vsReference?.biasRate;
      return `<tr>
        <td>${this._esc(id)}</td>
        <td>${rep  ? pct(rep.rate) : '—'}</td>
        <td>${eff  ? pct(eff.rate) : '—'}</td>
        <td>${miss ? pct(miss.rate) : '—'}</td>
        <td>${fa   ? pct(fa.rate)   : '—'}</td>
        <td>${bias ? f(bias.value, 3) : '—'}</td>
      </tr>`;
    }).join('');

    // Prüferpaar-Tabelle mit Ampel-Kreisen.
    const pairRows = Object.entries(res.betweenAppraisers.pairwiseCohenKappa || {}).map(([pair, k]) => {
      const cls = _kappaClass(k.kappa);
      const ci = k.ci95 && Number.isFinite(k.ci95[0]) && Number.isFinite(k.ci95[1])
        ? `[${f(k.ci95[0], 3)}, ${f(k.ci95[1], 3)}]`
        : '—';
      return `<tr>
        <td>${this._esc(pair.replace('|', ' | '))}</td>
        <td>${f(k.kappa, 3)}</td>
        <td>${ci}</td>
        <td><span class="msa-typ5__ampel ${cls}"></span></td>
      </tr>`;
    }).join('');

    // κ vs. Referenz (nur wenn Referenz vorhanden).
    const vsRefEntries = Object.entries(res.perAppraiser).filter(([, v]) => v.vsReference?.kappa);
    const vsRefRows = vsRefEntries.map(([id, v]) => {
      const k = v.vsReference.kappa;
      const cls = _kappaClass(k.kappa);
      const ci = k.ci95 && Number.isFinite(k.ci95[0]) && Number.isFinite(k.ci95[1])
        ? `[${f(k.ci95[0], 3)}, ${f(k.ci95[1], 3)}]`
        : '—';
      return `<tr>
        <td>${this._esc(id)}</td>
        <td>${f(k.kappa, 3)}</td>
        <td>${ci}</td>
        <td><span class="msa-typ5__ampel ${cls}"></span></td>
      </tr>`;
    }).join('');

    const fleiss = res.betweenAppraisers.fleissKappa || {};
    const fleissCi = fleiss.ci95 && Number.isFinite(fleiss.ci95[0]) && Number.isFinite(fleiss.ci95[1])
      ? ` (KI [${f(fleiss.ci95[0], 3)}, ${f(fleiss.ci95[1], 3)}])`
      : '';
    const refSrc = t(`modules.msa-typ5.labels.referenceSource${(res.meta.referenceSource || 'none').charAt(0).toUpperCase() + (res.meta.referenceSource || 'none').slice(1)}`);

    const hasEff = effRates.length > 0;
    const hasSdt = !!res.signalDetection;

    out.innerHTML = `
      <div class="msa-typ5__verdict-header ${verdictMod}">
        <div class="msa-typ5__verdict-dot"></div>
        <div class="msa-typ5__verdict-text">
          <strong>${verdictLabel}</strong>
          <span>Fleiss κ = ${f(fleiss.kappa, 3)}${fleissCi} · ${t('modules.msa-typ5.labels.referenceSource')}: ${refSrc}</span>
        </div>
      </div>
      ${warnings}

      <div class="dmike-kpi-strip">
        <div class="dmike-kpi ${verdictMod}">
          <div class="dmike-kpi-label">${t('modules.msa-typ5.kpi.fleissKappa')}</div>
          <div class="dmike-kpi-value">${f(fleiss.kappa, 3)}</div>
          <div class="dmike-kpi-sub">${this._esc(fleiss.method || '')}</div>
        </div>
        <div class="dmike-kpi">
          <div class="dmike-kpi-label">${t('modules.msa-typ5.kpi.repeatability')}</div>
          <div class="dmike-kpi-value">${meanRep !== null ? pct(meanRep) : '—'}</div>
        </div>
        <div class="dmike-kpi">
          <div class="dmike-kpi-label">${t('modules.msa-typ5.kpi.effectiveness')}</div>
          <div class="dmike-kpi-value">${meanEff !== null ? pct(meanEff) : '—'}</div>
        </div>
        <div class="dmike-kpi">
          <div class="dmike-kpi-label">${t('modules.msa-typ5.kpi.kappaVsRef')}</div>
          <div class="dmike-kpi-value">${meanKvR !== null ? f(meanKvR, 3) : '—'}</div>
        </div>
      </div>

      <div class="msa-typ5__interp ${verdictMod}">
        ${t(res.interpretation.textKey, res.interpretation.params || {})}
      </div>

      <div class="dmike-split__output-section">${t('modules.msa-typ5.table.appraiser')}</div>
      <table class="dmike-table msa-typ5__table">
        <thead><tr>
          <th>${t('modules.msa-typ5.table.appraiser')}</th>
          <th>${t('modules.msa-typ5.table.repeatability')}</th>
          <th>${t('modules.msa-typ5.table.effectiveness')}</th>
          <th>${t('modules.msa-typ5.table.missRate')}</th>
          <th>${t('modules.msa-typ5.table.falseAlarmRate')}</th>
          <th>${t('modules.msa-typ5.table.biasRate')}</th>
        </tr></thead>
        <tbody>${perApprRows}</tbody>
      </table>

      <div class="dmike-split__output-section">${t('modules.msa-typ5.table.pair')} — ${t('modules.msa-typ5.table.cohenKappa')}</div>
      <table class="dmike-table msa-typ5__table">
        <thead><tr>
          <th>${t('modules.msa-typ5.table.pair')}</th>
          <th>${t('modules.msa-typ5.table.cohenKappa')}</th>
          <th>${t('modules.msa-typ5.table.ci95')}</th>
          <th>${t('modules.msa-typ5.table.verdict')}</th>
        </tr></thead>
        <tbody>${pairRows}</tbody>
      </table>

      ${vsRefRows ? `
        <div class="dmike-split__output-section">${t('modules.msa-typ5.table.vsReference')}</div>
        <table class="dmike-table msa-typ5__table">
          <thead><tr>
            <th>${t('modules.msa-typ5.table.appraiser')}</th>
            <th>κ</th>
            <th>${t('modules.msa-typ5.table.ci95')}</th>
            <th>${t('modules.msa-typ5.table.verdict')}</th>
          </tr></thead>
          <tbody>${vsRefRows}</tbody>
        </table>
      ` : ''}

      <div class="dmike-split__output-section">${t('modules.msa-typ5.charts.kappaBar')}</div>
      <div class="msa-typ5__chart" data-ref="chart-kappa-bar"></div>

      ${hasEff ? `
        <div class="dmike-split__output-section">${t('modules.msa-typ5.charts.effectivenessBar')}</div>
        <div class="msa-typ5__chart" data-ref="chart-eff-bar"></div>
      ` : ''}

      ${hasSdt ? `
        <div class="dmike-split__output-section">${t('modules.msa-typ5.charts.sdtScatter')}</div>
        <div class="msa-typ5__chart" data-ref="chart-sdt"></div>
      ` : ''}

      <div class="dmike-split__output-section">${t('modules.msa-typ5.charts.confusion')}</div>
      <div class="msa-typ5__heatmap-grid" data-ref="chart-heatmaps"></div>
    `;

    // Charts asynchron nachladen (Task 13/14).
    this._renderCharts(res);
  },

  /**
   * Chart-Rendering — asynchron nach dem HTML-Ausbau des Output-Panels.
   * Orchestriert:
   *   1. Kappa-Bar (paarweises Cohen κ mit KI-Whiskern)
   *   2. Effektivitäts-Bar (nur mit Referenz)
   *   3. Signal-Detection-Scatter (nur binär + Referenz)
   *   4. Confusion-Heatmaps-Grid (Task 14)
   */
  async _renderCharts(res) {
    this._destroyCharts();
    await this._renderKappaBar(res);
    if (Object.values(res.perAppraiser).some((x) => x.vsReference?.effectiveness)) {
      await this._renderEffectivenessBar(res);
    }
    if (res.signalDetection) {
      await this._renderSdtScatter(res);
    }
    await this._renderConfusionHeatmaps(res);
  },

  /**
   * Cohen κ je Prüferpaar als Dot-and-Whisker-Plot (scatter mit
   * Error-Bars). `bar.js` unterstützt kein `series[].errorBars`, deshalb
   * bewusst der scatter-Weg mit categoricalen Tick-Labels über xTickFormat.
   * Referenzlinien: κ = 0.40 (gelb) / κ = 0.75 (grün) / Fleiss κ (info).
   */
  async _renderKappaBar(res) {
    const host = this._container?.querySelector('[data-ref="chart-kappa-bar"]');
    if (!host) return;
    const entries = Object.entries(res.betweenAppraisers?.pairwiseCohenKappa || {});
    if (!entries.length) return;

    const labels = entries.map(([pair]) => pair.replace('|', ' | '));
    const x = entries.map((_, i) => i);
    const y = entries.map(([, k]) => k.kappa);
    const yPlus  = entries.map(([, k]) => (Number.isFinite(k.ci95?.[1]) ? Math.max(0, k.ci95[1] - k.kappa) : 0));
    const yMinus = entries.map(([, k]) => (Number.isFinite(k.ci95?.[0]) ? Math.max(0, k.kappa - k.ci95[0]) : 0));

    const refLines = [
      { dir: 'h', value: 0.75, label: 'κ = 0.75', dash: 'dash', width: 1, color: 'var(--color-success, #2ea043)' },
      { dir: 'h', value: 0.40, label: 'κ = 0.40', dash: 'dash', width: 1, color: 'var(--color-warning, #d29922)' },
    ];
    const fleiss = res.betweenAppraisers?.fleissKappa?.kappa;
    if (Number.isFinite(fleiss)) {
      refLines.push({ dir: 'h', value: fleiss, label: `Fleiss κ = ${fleiss.toFixed(3)}`, dash: 'solid', width: 1, color: 'var(--color-info, #58a6ff)' });
    }

    const chart = await this._context.chartManager.create(host, 'scatter', {
      xLabel: this._t('modules.msa-typ5.table.pair'),
      yLabel: 'Cohen κ',
      showLegend: false,
      xTicks: x,
      xTickFormat: (v) => labels[Math.round(v)] ?? '',
      xMin: -0.5,
      xMax: x.length - 0.5,
      yMin: Math.min(-0.1, ...y, ...entries.map(([, k]) => k.ci95?.[0] ?? 0)),
      yMax: Math.max(1.05, ...y, ...entries.map(([, k]) => k.ci95?.[1] ?? 0)),
      series: [{
        name: 'κ',
        color: 'var(--color-accent, #58a6ff)',
        x, y,
        symbol: 'circle',
        markerSize: 10,
        strokeWidth: 1.5,
        errorBars: { show: true, yMode: 'absolute', yPlus, yMinus },
      }],
      refLines,
    });
    this._charts.push(chart);
  },

  /**
   * Effektivität je Prüfer als Dot-and-Whisker-Plot (Wilson-Score-KI).
   * Referenzlinien: 80 % (gelb) / 90 % (grün) — AIAG-Schwellen.
   */
  async _renderEffectivenessBar(res) {
    const host = this._container?.querySelector('[data-ref="chart-eff-bar"]');
    if (!host) return;
    const entries = Object.entries(res.perAppraiser).filter(([, v]) => v.vsReference?.effectiveness);
    if (!entries.length) return;

    const labels = entries.map(([id]) => id);
    const x = entries.map((_, i) => i);
    const y = entries.map(([, v]) => v.vsReference.effectiveness.rate);
    const yPlus  = entries.map(([, v]) => Math.max(0, (v.vsReference.effectiveness.ci95?.[1] ?? y[0]) - v.vsReference.effectiveness.rate));
    const yMinus = entries.map(([, v]) => Math.max(0, v.vsReference.effectiveness.rate - (v.vsReference.effectiveness.ci95?.[0] ?? y[0])));

    const chart = await this._context.chartManager.create(host, 'scatter', {
      xLabel: this._t('modules.msa-typ5.table.appraiser'),
      yLabel: this._t('modules.msa-typ5.kpi.effectiveness'),
      showLegend: false,
      xTicks: x,
      xTickFormat: (v) => labels[Math.round(v)] ?? '',
      xMin: -0.5,
      xMax: x.length - 0.5,
      yMin: 0,
      yMax: 1.05,
      series: [{
        name: this._t('modules.msa-typ5.kpi.effectiveness'),
        color: 'var(--color-accent, #58a6ff)',
        x, y,
        symbol: 'circle',
        markerSize: 10,
        strokeWidth: 1.5,
        errorBars: { show: true, yMode: 'absolute', yPlus, yMinus },
      }],
      refLines: [
        { dir: 'h', value: 0.90, label: '90 %', dash: 'dash', width: 1, color: 'var(--color-success, #2ea043)' },
        { dir: 'h', value: 0.80, label: '80 %', dash: 'dash', width: 1, color: 'var(--color-warning, #d29922)' },
      ],
    });
    this._charts.push(chart);
  },

  /**
   * Signal-Detection-Scatter: d′ (y) vs. Kriterium c (x) je Prüfer.
   * Ein Punkt pro Prüfer, benannte Serien liefern die Legende.
   */
  async _renderSdtScatter(res) {
    const host = this._container?.querySelector('[data-ref="chart-sdt"]');
    if (!host) return;
    const per = res.signalDetection?.perAppraiser || {};
    const ids = Object.keys(per);
    if (!ids.length) return;
    const palette = [
      'var(--color-chart-1)', 'var(--color-chart-3)', 'var(--color-chart-5)',
      'var(--color-chart-2)', 'var(--color-chart-7)', 'var(--color-chart-4)',
    ];
    const series = ids.map((id, i) => ({
      name: id,
      color: palette[i % palette.length],
      x: [per[id].criterion],
      y: [per[id].dPrime],
      symbol: 'circle',
      markerSize: 12,
      strokeWidth: 1.5,
    }));

    const chart = await this._context.chartManager.create(host, 'scatter', {
      xLabel: 'Kriterium c',
      yLabel: "d'",
      showLegend: true,
      series,
      refLines: [
        { dir: 'v', value: 0, label: 'c = 0', dash: 'dash', width: 1, color: 'var(--color-text-secondary)' },
        { dir: 'h', value: 0, label: "d' = 0", dash: 'dash', width: 1, color: 'var(--color-text-secondary)' },
      ],
    });
    this._charts.push(chart);
  },

  /**
   * Grid aus Confusion-Heatmaps: eine je Prüfer-vs-Referenz-Kombination
   * (falls Referenz vorhanden) sowie eine je Prüferpaar. Nutzt das
   * bestehende chart/types/heatmap.js (viridis-Skala, showCellLabels).
   */
  async _renderConfusionHeatmaps(res) {
    const host = this._container?.querySelector('[data-ref="chart-heatmaps"]');
    if (!host) return;

    const items = [];
    // Prüfer vs. Referenz (Kreuztabelle aus perAppraiser[].confusionMatrix).
    for (const [id, v] of Object.entries(res.perAppraiser || {})) {
      if (v.confusionMatrix && Array.isArray(v.confusionMatrix.counts)) {
        items.push({
          title: `${id} vs. ${this._t('modules.msa-typ5.labels.referenceSource')}`,
          rows: v.confusionMatrix.rows,
          cols: v.confusionMatrix.cols,
          counts: v.confusionMatrix.counts,
        });
      }
    }
    // Prüfer vs. Prüfer aus den Paar-Confusionen.
    for (const [pair, k] of Object.entries(res.betweenAppraisers?.pairwiseCohenKappa || {})) {
      if (!k.confusion || !Array.isArray(k.confusion.counts)) continue;
      const [a, b] = pair.split('|');
      items.push({
        title: `${a} vs. ${b}`,
        rows: k.confusion.rows,
        cols: k.confusion.cols,
        counts: k.confusion.counts,
      });
    }
    if (!items.length) { host.innerHTML = ''; return; }

    host.innerHTML = items.map((_, i) => `
      <div class="msa-typ5__heatmap-cell">
        <div class="msa-typ5__heatmap-title"></div>
        <div class="msa-typ5__heatmap-body" data-ref="heatmap-${i}"></div>
      </div>
    `).join('');

    for (let i = 0; i < items.length; i++) {
      const cell = host.children[i];
      if (!cell) continue;
      const titleEl = cell.querySelector('.msa-typ5__heatmap-title');
      if (titleEl) titleEl.textContent = items[i].title;
      const target = cell.querySelector(`[data-ref="heatmap-${i}"]`);
      if (!target) continue;
      const chart = await this._context.chartManager.create(target, 'heatmap', {
        xCategories: items[i].cols,
        yCategories: items[i].rows,
        cells: items[i].counts,
        cellGap: 1,
        valueDecimals: 0,
        valueLabel: 'n',
        showCellLabels: true,
        colorScheme: 'viridis',
      });
      this._charts.push(chart);
    }
  },

  _fmt(v, d = 3) {
    return Number.isFinite(v) ? v.toFixed(d) : '—';
  },

  _fmtPct(rate) {
    return Number.isFinite(rate) ? `${(rate * 100).toFixed(1)} %` : '—';
  },

  /**
   * Engine-Codes E_TOO_FEW_PARTS / W_UNBALANCED_REPS → i18n-Keys
   * modules.msa-typ5.errTooFewParts / warnUnbalancedReps.
   */
  _translateCode({ code, params }, prefix) {
    const stripped = code.replace(/^E_|^W_/, '');
    const camel = stripped.split('_').map((w) => w[0] + w.slice(1).toLowerCase()).join('');
    return this._t(`modules.msa-typ5.${prefix}${camel}`, params ?? {});
  },

  // ─── Persistenz ─────────────────────────────────────────────

  _save() {
    if (this._context?.stateManager && this._context?.instanceId) {
      this._context.stateManager.setModuleState(this._context.instanceId, this.getState());
    }
  },

  _esc(s) {
    if (s === null || s === undefined) return '';
    const el = document.createElement('span');
    el.textContent = String(s);
    return el.innerHTML;
  },

  _destroyCharts() {
    const cm = this._context?.chartManager;
    for (const c of this._charts) {
      try { if (cm) cm.destroy(c); } catch (_) { /* ignore */ }
    }
    this._charts = [];
  },
};

// ─── Modul-lokale Helfer (außerhalb des Modul-Objekts) ────────

/**
 * Mittelwert einer Zahlenliste unter Ignorieren von NaN/Infinity.
 * @param {number[]} arr
 * @returns {number|null}
 */
function _mean(arr) {
  const clean = (arr || []).filter(Number.isFinite);
  return clean.length ? clean.reduce((s, v) => s + v, 0) / clean.length : null;
}

/**
 * Modifier-Klasse für Ampel je Verdikt-Level (dmike-kpi-Konvention).
 * @param {'good'|'marginal'|'unacceptable'} level
 * @returns {string}
 */
function _verdictClass(level) {
  if (level === 'good') return 'dmike-kpi--good';
  if (level === 'marginal') return 'dmike-kpi--warn';
  return 'dmike-kpi--bad';
}

/**
 * κ-Wert → Ampel-Klasse (AIAG-Schwellen 0.75 / 0.40).
 * @param {number} k
 * @returns {string}
 */
function _kappaClass(k) {
  if (!Number.isFinite(k)) return '';
  if (k >= 0.75) return 'dmike-kpi--good';
  if (k >= 0.40) return 'dmike-kpi--warn';
  return 'dmike-kpi--bad';
}
