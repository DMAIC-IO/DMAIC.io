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

  /** Platzhalter — Task 12 füllt Verdikt/KPI/Tabellen, Task 13 + 14 die Charts. */
  _renderOutput() {
    const out = this._container?.querySelector('[data-ref="output"]');
    if (!out) return;
    if (!this._result || !this._result.verdict) {
      const err = this._result?.meta?.errors?.[0];
      if (err) {
        out.innerHTML = `<div class="module-msa-typ5__empty">${this._translateCode(err, 'err')}</div>`;
        return;
      }
      out.innerHTML = `<div class="module-msa-typ5__empty">${this._t('modules.msa-typ5.emptyState')}</div>`;
      return;
    }
    out.innerHTML = `<div class="module-msa-typ5__empty">…</div>`;
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
