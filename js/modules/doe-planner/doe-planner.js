/**
 * D.Mike — DoE Planner Module (doe-planner.js)
 * Design of Experiments — Split-panel layout with live auto-generation.
 * DMAIC phase: Improve
 *
 * Layout:
 *   Left panel  — Factors, Responses, Design Type + Parameters
 *   Right panel — Live Worksheet (auto-generated), Evaluation, Analysis
 *
 * Spec: prototypes/DOE_TOOL_SPEC.md
 */

import { DataGrid } from '../../core/datagrid/datagrid.js';
import { FRAC, PB_DESIGNS, ALL_RUNS, K_RANGE, BOX_BEHNKEN, TAGUCHI } from './doe-planner-designs.js';
import { generateDesign, selectTaguchiArray, taguchiCandidates, minRunsForModel } from '../../engines/doe-planner-engine.js';
import {
  createDesignWorksheet,
  createExperimentRecord,
  removeExperimentRecord,
  readResponsesFromWorksheet,
  isWorksheetValid,
} from './doe-planner-worksheet.js';
import {
  evaluateDesign,
  computeEVOPEffects,
  recenteredFactors,
  computeAliasStructure,
  computeDispersionAnalysis,
} from './doe-planner-analysis.js';

// ─── Constants ─────────────────────────────────────────────────────

const DESIGN_TYPES = [
  { key: 'full',    formula: '2<sup>k</sup>' },
  { key: 'frac',    formula: '2<sup>(k\u2212p)</sup>' },
  { key: 'pb',      formula: 'PB' },
  { key: 'ccd',     formula: 'CCD' },
  { key: 'bb',      formula: 'BB' },
  { key: 'taguchi', formula: 'OA' },
  { key: 'dopt',    formula: 'D-Opt' },
  { key: 'aopt',    formula: 'A-Opt' },
  { key: 'gopt',    formula: 'G-Opt' },
];

const ALGO_ID_DEFF = 'd-efficiency';
const ALGO_ID_VIF = 'vif';
const ALGO_LINK_SVG = '<svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>';

const AUTO_GEN_DELAY = 600; // ms debounce for auto-generation

/**
 * Calculate the number of polynomial terms for k factors at given degree.
 * Mirrors buildPolyDesignMatrix in regression-engine.js.
 * @param {number} k - number of factors
 * @param {number} degree - polynomial degree (1, 2, or 3)
 * @returns {number} total number of terms (including intercept)
 */
function polyTermCount(k, degree) {
  let p = 1 + k; // intercept + main effects
  if (degree >= 2) {
    p += k;                           // squared terms
    p += k * (k - 1) / 2;            // 2-way interactions
  }
  if (degree >= 3) {
    p += k;                           // cubic terms
    p += k * (k - 1);                 // x_i²·x_j  +  x_i·x_j² per pair
    p += k * (k - 1) * (k - 2) / 6;  // 3-way interactions (distinct triples)
  }
  return p;
}

/**
 * Determine the highest polynomial degree (1–3) where n > p.
 * @param {number} n - number of data rows
 * @param {number} k - number of factors
 * @returns {1|2|3}
 */
function maxFeasiblePolyDegree(n, k) {
  for (let d = 3; d >= 2; d--) {
    if (n > polyTermCount(k, d)) return d;
  }
  return 1;
}

// ─── Module ────────────────────────────────────────────────────────

export default {
  id: 'doe-planner',
  phase: 'improve',
  allowedPhases: ['measure', 'analyze', 'improve', 'control'],
  icon: 'grid',
  i18nKey: 'modules.doe-planner',
  version: '3.0.0',

  /** @type {HTMLElement|null} */
  _container: null,
  /** @type {object|null} */
  _context: null,
  /** @type {Function[]} */
  _eventUnsubs: [],

  // ─── State ──────────────────────────────────────────────────────

  _doeName: '',
  _designType: 'full',
  /** @type {{ id: number, name: string, unit: string, kind: 'continuous'|'categorical', levels: string[] }[]} */
  _factors: [],
  /** @type {{ name: string, unit: string, goal: string }[]} */
  _responses: [],
  _options: { randomize: true, centerPoints: false, replicates: 1, alphaType: 'rotatable', ccdCenterPoints: 3, bbCenterPoints: 3, taguchiArray: '', optimalRuns: 0, optimalQuadratic: false },
  /** @type {{ k: number, runs: number, res: string, p: number }|null} */
  _selectedRes: null,
  _selectedPBIdx: null,
  /** @type {import('../../engines/doe-planner-engine.js').DesignResult|null} */
  _design: null,
  /** @type {import('./doe-planner-worksheet.js').WorksheetRef|null} */
  _worksheetRef: null,
  /** @type {import('./doe-planner-analysis.js').DesignEvaluation|null} */
  _evaluation: null,
  _analysisResponseIdx: 0,
  /** @type {object[]} Active chart instances (destroyed on re-render) */
  _charts: [],
  /** @type {DataGrid|null} Embedded worksheet grid */
  _embeddedGrid: null,
  _fid: 0,
  _autoGenTimer: null,
  /** @type {boolean} Evaluation detail expanded */

  // ─── EVOP State ────────────────────────────────────────────────
  _projectMode: false,
  _projectName: '',
  _projectPhases: [],
  _activePhaseIdx: -1,

  // ─── Lifecycle ──────────────────────────────────────────────────

  async init(container, context) {
    this._container = container;
    this._context = context;
    this._eventUnsubs = [];

    // Reset state
    this._doeName = '';
    this._designType = 'full';
    this._factors = [];
    this._responses = [];
    this._options = { randomize: true, centerPoints: false, replicates: 1, alphaType: 'rotatable', ccdCenterPoints: 3, bbCenterPoints: 3, taguchiArray: '' };
    this._selectedRes = null;
    this._selectedPBIdx = null;
    this._design = null;
    this._worksheetRef = null;
    this._evaluation = null;
    this._analysisResponseIdx = 0;
    this._charts = [];
    this._embeddedGrid = null;
    this._fid = 0;
    this._autoGenTimer = null;
    this._projectMode = false;
    this._projectName = '';
    this._projectPhases = [];
    this._activePhaseIdx = -1;

    // Restore saved state
    const saved = context.stateManager.getModuleState(context.instanceId);
    if (saved) this._importState(saved);

    // Defaults
    if (this._factors.length === 0) {
      this._addFactor('', '');
      this._addFactor('', '');
    }
    if (this._responses.length === 0) {
      this._responses.push({ name: '', unit: '', goal: 'max' });
    }

    // Listen for worksheet changes → update right panel
    const onStateSaved = () => {
      if (this._worksheetRef) this._renderOutput();
    };
    context.eventBus.on('state:saved', onStateSaved);
    this._eventUnsubs.push(() => context.eventBus.off('state:saved', onStateSaved));

    // Cell edits in the linked worksheet do not trigger state:saved
    // (setModuleState writes silently). Listen for the worksheet's
    // own change event so the embedded grid + analysis stay in sync
    // when the user edits the standalone Datensammlung.
    const onWorksheetChanged = ({ instanceId }) => {
      if (this._worksheetRef && instanceId === this._worksheetRef.instanceId) {
        this._renderOutput();
      }
    };
    context.eventBus.on('worksheet:dataChanged', onWorksheetChanged);
    this._eventUnsubs.push(() => context.eventBus.off('worksheet:dataChanged', onWorksheetChanged));

    this._render();

    // If config is valid but no design yet, trigger auto-generation
    if (!this._design && this._isConfigValid()) {
      this._scheduleAutoGenerate();
    }
  },

  async destroy() {
    if (this._autoGenTimer) clearTimeout(this._autoGenTimer);
    this._destroyCharts();
    this._destroyEmbeddedGrid();
    for (const unsub of this._eventUnsubs) unsub();
    this._eventUnsubs = [];
    if (this._container) this._container.innerHTML = '';
  },

  onLanguageChange() { this._render(); },
  onThemeChange() { /* CSS handles it */ },

  // ─── Data hooks ─────────────────────────────────────────────────

  getState() {
    return {
      version: 3,
      doeName: this._doeName,
      designType: this._designType,
      factors: JSON.parse(JSON.stringify(this._factors)),
      responses: JSON.parse(JSON.stringify(this._responses)),
      options: { ...this._options },
      selectedRes: this._selectedRes ? { ...this._selectedRes } : null,
      selectedPBIdx: this._selectedPBIdx,
      design: this._design ? JSON.parse(JSON.stringify(this._design)) : null,
      worksheetRef: this._worksheetRef ? { ...this._worksheetRef } : null,
      evaluation: this._evaluation ? JSON.parse(JSON.stringify(this._evaluation)) : null,
      analysisResponseIdx: this._analysisResponseIdx,
      fid: this._fid,
      projectMode: this._projectMode,
      projectName: this._projectName,
      projectPhases: JSON.parse(JSON.stringify(this._projectPhases)),
      activePhaseIdx: this._activePhaseIdx,
    };
  },

  setState(data) {
    this._importState(data);
    this._render();
  },

  help: () => import('./doe-planner-help.js'),

  // ─── State import ───────────────────────────────────────────────

  _importState(saved) {
    if (!saved) return;

    // v2 → v3 migration: remove wizard fields
    if (saved.currentStep !== undefined) {
      delete saved.currentStep;
      delete saved.maxVisitedStep;
    }

    if (saved.doeName != null) this._doeName = saved.doeName;
    if (saved.designType) this._designType = saved.designType;
    if (Array.isArray(saved.factors)) {
      this._factors = JSON.parse(JSON.stringify(saved.factors)).map(f => {
        if (!Array.isArray(f.levels)) {
          f.levels = [f.lo ?? '', f.hi ?? ''];
          delete f.lo; delete f.hi;
        }
        // Migration: pre-Phase-2 records have no kind — default to continuous.
        if (f.kind !== 'categorical') f.kind = 'continuous';
        return f;
      });
    }
    if (Array.isArray(saved.responses)) {
      this._responses = JSON.parse(JSON.stringify(saved.responses));
    }
    if (saved.options) this._options = { ...this._options, ...saved.options };
    this._selectedRes = saved.selectedRes ? { ...saved.selectedRes } : null;
    this._selectedPBIdx = saved.selectedPBIdx ?? null;
    this._design = saved.design ? JSON.parse(JSON.stringify(saved.design)) : null;
    this._worksheetRef = saved.worksheetRef ? { ...saved.worksheetRef } : null;
    this._evaluation = saved.evaluation ? JSON.parse(JSON.stringify(saved.evaluation)) : null;
    this._analysisResponseIdx = saved.analysisResponseIdx ?? 0;
    if (typeof saved.fid === 'number') this._fid = saved.fid;
    if (typeof saved.projectMode === 'boolean') this._projectMode = saved.projectMode;
    if (saved.projectName != null) this._projectName = saved.projectName;
    if (Array.isArray(saved.projectPhases)) this._projectPhases = JSON.parse(JSON.stringify(saved.projectPhases));
    if (typeof saved.activePhaseIdx === 'number') this._activePhaseIdx = saved.activePhaseIdx;
  },

  // ─── Helpers ────────────────────────────────────────────────────

  _t(key, params) {
    return this._context.i18n.t('modules.doe-planner.' + key, params);
  },

  _esc(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  },

  _hasDuplicateFactorNames() {
    const names = this._factors
      .map(f => f.name.trim().toLowerCase())
      .filter(n => n !== '');
    return new Set(names).size !== names.length;
  },

  _markDuplicateFactors(root) {
    const counts = {};
    this._factors.forEach(f => {
      const n = f.name.trim().toLowerCase();
      if (n) counts[n] = (counts[n] || 0) + 1;
    });
    root.querySelectorAll('.doe__factor-name').forEach(input => {
      const f = this._factors.find(f => f.id === parseInt(input.dataset.factorId, 10));
      const n = f?.name?.trim().toLowerCase();
      const isDup = n && counts[n] > 1;
      input.classList.toggle('field--error', isDup);
      input.title = isDup ? this._t('duplicateFactorError') : '';
    });
  },

  _addFactor(name, unit, levels, kind = 'continuous') {
    this._fid++;
    this._factors.push({
      id: this._fid,
      name: name || '',
      unit: unit || '',
      kind: kind === 'categorical' ? 'categorical' : 'continuous',
      levels: Array.isArray(levels) && levels.length >= 2 ? [...levels] : ['', ''],
    });
  },

  _save() {
    this._context.stateManager.setModuleState(
      this._context.instanceId,
      this.getState()
    );
  },

  _autoFixDesignType() {
    const has3Plus = this._factors.some(f => f.levels.length > 2);
    if (has3Plus && (this._designType === 'frac' || this._designType === 'pb')) {
      this._designType = 'full';
      this._selectedRes = null;
      this._selectedPBIdx = null;
    }
  },

  // ─── Config Validation ──────────────────────────────────────────

  _isConfigValid() {
    // Factors valid?
    if (this._factors.length < 2) return false;
    if (this._hasDuplicateFactorNames()) return false;
    if (!this._factors.every(f =>
      f.name.trim() !== '' &&
      f.levels.length >= 2 && f.levels[0] !== '' && f.levels[f.levels.length - 1] !== ''
    )) return false;

    // Responses valid?
    if (this._responses.length < 1) return false;
    if (!this._responses.every(r => r.name.trim() !== '')) return false;

    // Design type valid?
    if (!this._designType) return false;
    const has3Plus = this._factors.some(f => f.levels.length > 2);
    if (has3Plus && (this._designType === 'frac' || this._designType === 'pb')) return false;
    if (this._designType === 'frac' && !this._selectedRes) return false;
    if (this._designType === 'pb' && this._selectedPBIdx === null) return false;
    if (this._designType === 'bb' && !BOX_BEHNKEN[this._factors.length]) return false;
    if (this._designType === 'taguchi' && !this._options.taguchiArray) return false;
    if (['dopt', 'aopt', 'gopt'].includes(this._designType)) {
      const minRuns = minRunsForModel(this._factors.length, this._options.optimalQuadratic);
      const nRuns = this._options.optimalRuns || 0;
      if (nRuns < minRuns) return false;
    }

    return true;
  },

  // ─── Auto-Generation Pipeline ──────────────────────────────────

  _scheduleAutoGenerate() {
    if (this._autoGenTimer) clearTimeout(this._autoGenTimer);
    this._autoGenTimer = setTimeout(() => {
      this._autoGenTimer = null;
      this._tryAutoGenerate();
    }, AUTO_GEN_DELAY);
  },

  _tryAutoGenerate() {
    if (!this._isConfigValid()) {
      // Config invalid — clear design if it exists
      if (this._design) {
        this._design = null;
        this._evaluation = null;
        // Keep worksheetRef — user may have entered data
      }
      this._save();
      this._renderOutput();
      return;
    }

    try {
      this._design = generateDesign(this._factors, {
        designType: this._designType,
        selectedRes: this._selectedRes,
        randomize: this._options.randomize,
        centerPoints: this._options.centerPoints,
        replicates: this._options.replicates || 1,
        alphaType: this._options.alphaType,
        ccdCenterPoints: this._options.ccdCenterPoints,
        bbCenterPoints: this._options.bbCenterPoints,
        taguchiArray: this._options.taguchiArray || undefined,
        optimalRuns: this._options.optimalRuns || undefined,
        optimalQuadratic: this._options.optimalQuadratic,
      });

      // Evaluate design
      this._evaluation = evaluateDesign(
        this._design.codedMatrix,
        this._factors.length,
        this._design.p,
        this._design.designType
      );

      // Create worksheet if none exists yet. We mint the experiment id up front so
      // that column.meta.managedRef on the locked structural columns can point back
      // to the corresponding state.experiments entry.
      if (!this._worksheetRef || !isWorksheetValid(this._context, this._worksheetRef)) {
        const expId = crypto.randomUUID();
        this._worksheetRef = createDesignWorksheet(
          this._context,
          this._design,
          this._factors,
          this._responses,
          this._doeName,
          'improve',
          expId
        );
        createExperimentRecord(
          this._context,
          expId,
          this._design,
          this._factors,
          this._responses,
          this._doeName,
          this._worksheetRef
        );
      }

      // Sync to project phase if in EVOP mode
      if (this._projectMode && this._activePhaseIdx >= 0 && this._activePhaseIdx < this._projectPhases.length) {
        const ph = this._projectPhases[this._activePhaseIdx];
        ph.design = JSON.parse(JSON.stringify(this._design));
        ph.worksheetRef = this._worksheetRef ? { ...this._worksheetRef } : null;
        ph.evaluation = this._evaluation ? JSON.parse(JSON.stringify(this._evaluation)) : null;
        ph.factors = JSON.parse(JSON.stringify(this._factors));
        ph.responses = JSON.parse(JSON.stringify(this._responses));
        ph.doeName = this._doeName;
      }

      this._save();
      this._renderOutput();
    } catch (err) {
      this._context.notify(err.message, 'error');
    }
  },

  /** Explicit regenerate with new randomization */
  _invalidateDesign() {
    if (this._worksheetRef?.experimentId) {
      removeExperimentRecord(this._context, this._worksheetRef.experimentId);
    }
    this._design = null;
    this._worksheetRef = null;
    this._evaluation = null;
    if (this._selectedRes && this._selectedRes.k !== this._factors.length) {
      this._selectedRes = null;
    }
    this._autoFixDesignType();
    this._scheduleAutoGenerate();
  },

  // ─── Main Render ────────────────────────────────────────────────

  _render() {
    if (!this._container || !this._context) return;
    this._destroyCharts();
    this._destroyEmbeddedGrid();

    this._container.innerHTML = `
      <div class="doe dmike-split">
        <div class="doe__input dmike-split__input">
          ${this._renderProjectToggle()}
          ${this._projectMode ? this._renderProjectBar() : ''}
          ${this._renderNameBar()}
          ${this._renderSectionFactors()}
          ${this._renderSectionResponses()}
          ${this._renderSectionDesign()}
        </div>
        <div class="doe__output dmike-split__output">
          ${this._renderOutputContent()}
        </div>
      </div>
    `;

    this._bindLeftPanelEvents();
    this._bindOutputEvents();
  },

  /** Re-render only the right panel (preserves left panel focus) */
  _renderOutput() {
    this._destroyCharts();
    this._destroyEmbeddedGrid();

    const el = this._container?.querySelector('.doe__output');
    if (!el) return;

    el.innerHTML = this._renderOutputContent();
    this._bindOutputEvents();
  },

  // ─── Header ─────────────────────────────────────────────────────

  _renderProjectToggle() {
    return `
      <label class="doe__project-toggle">
        <input type="checkbox" class="doe__project-check" ${this._projectMode ? 'checked' : ''} />
        <span>${this._t('projectMode')}</span>
      </label>
    `;
  },

  _renderNameBar() {
    return `
      <div class="doe__name-bar">
        <label class="doe__name-label">${this._projectMode ? this._t('phaseName') : this._t('doeName')}</label>
        <input type="text" class="field doe__name-input"
               value="${this._esc(this._doeName)}"
               placeholder="${this._t('doeNamePlaceholder')}" />
      </div>
    `;
  },

  // ─── Section Title ─────────────────────────────────────────────

  _renderSection(id, titleKey, content) {
    return `
      <div class="dmike-split__section-title">${this._t(titleKey)}</div>
      ${content}
    `;
  },

  // ─── Left Panel: Factors Section ────────────────────────────────

  _renderSectionFactors() {
    const content = `
      <div class="doe__factors-list">
        ${this._factors.map((f, i) => this._renderFactorRow(f, i)).join('')}
      </div>
      <button class="btn btn--sm doe__add-factor-btn" type="button">+ ${this._t('addFactor')}</button>
    `;
    return this._renderSection('factors', 'stepFactors', content);
  },

  _renderFactorRow(f, index) {
    const letter = String.fromCharCode(65 + index);
    const kind = f.kind === 'categorical' ? 'categorical' : 'continuous';
    let levelsHtml = `
      <button class="doe__insert-level-btn" type="button"
              data-factor-id="${f.id}" data-insert-at="0"
              title="${this._t('insertLevel')}">+</button>
    `;
    f.levels.forEach((val, li) => {
      levelsHtml += `
        <div class="doe__level-chip">
          <span class="doe__level-num">${li + 1}</span>
          <input type="text" class="field doe__factor-level-input"
                 data-factor-id="${f.id}" data-level-idx="${li}"
                 value="${this._esc(val)}" placeholder="${kind === 'categorical' ? this._t('factorLevelLabelPlaceholder') : '\u2026'}" />
          ${f.levels.length > 2
            ? `<button class="doe__remove-level-btn" type="button"
                       data-factor-id="${f.id}" data-level-idx="${li}"
                       title="${this._t('removeLevel')}">\u2715</button>`
            : ''}
        </div>
        <button class="doe__insert-level-btn" type="button"
                data-factor-id="${f.id}" data-insert-at="${li + 1}"
                title="${this._t('insertLevel')}">+</button>
      `;
    });

    return `
      <div class="doe__factor-row" data-factor-id="${f.id}" data-factor-kind="${kind}">
        <div class="doe__factor-top">
          <span class="doe__factor-letter">${letter}</span>
          <input type="text" class="field doe__factor-name" data-factor-id="${f.id}"
                 value="${this._esc(f.name)}" placeholder="${this._t('factorNamePlaceholder')}" />
          <input type="text" class="field doe__factor-unit doe__factor-unit--narrow" data-factor-id="${f.id}"
                 value="${this._esc(f.unit)}" placeholder="${this._t('factorUnitPlaceholder')}"
                 ${kind === 'categorical' ? 'disabled title="' + this._t('factorUnitCategoricalDisabled') + '"' : ''} />
          <select class="field doe__factor-kind" data-factor-id="${f.id}"
                  title="${this._t('factorKindLabel')}">
            <option value="continuous" ${kind === 'continuous' ? 'selected' : ''}>${this._t('factorKindContinuous')}</option>
            <option value="categorical" ${kind === 'categorical' ? 'selected' : ''}>${this._t('factorKindCategorical')}</option>
          </select>
          <button class="doe__factor-remove-btn" type="button" data-factor-id="${f.id}"
                  title="${this._t('removeFactor')}">\u2715</button>
        </div>
        <div class="doe__levels-row">${levelsHtml}</div>
      </div>
    `;
  },

  // ─── Left Panel: Responses Section ──────────────────────────────

  _renderSectionResponses() {
    const content = `
      <div class="doe__responses-list">
        ${this._responses.map((r, i) => this._renderResponseRow(r, i)).join('')}
      </div>
      <button class="btn btn--sm doe__add-response-btn" type="button">+ ${this._t('addResponse')}</button>
    `;
    return this._renderSection('responses', 'stepResponses', content);
  },

  _renderResponseRow(r, index) {
    return `
      <div class="doe__response-row" data-response-idx="${index}">
        <div class="doe__response-top">
          <span class="doe__response-letter">Y${index + 1}</span>
          <input type="text" class="field doe__response-name" data-idx="${index}"
                 value="${this._esc(r.name)}" placeholder="${this._t('responseNamePlaceholder')}" />
          <input type="text" class="field doe__response-unit doe__factor-unit--narrow" data-idx="${index}"
                 value="${this._esc(r.unit)}" placeholder="${this._t('responseUnitPlaceholder')}" />
          ${this._responses.length > 1
            ? `<button class="doe__response-remove-btn" type="button" data-idx="${index}"
                     title="${this._t('removeResponse')}">\u2715</button>`
            : ''}
        </div>
        <div class="doe__response-bottom">
          <select class="field doe__response-goal" data-idx="${index}">
            <option value="max" ${r.goal === 'max' ? 'selected' : ''}>${this._t('goalMax')}</option>
            <option value="min" ${r.goal === 'min' ? 'selected' : ''}>${this._t('goalMin')}</option>
            <option value="target" ${r.goal === 'target' ? 'selected' : ''}>${this._t('goalTarget')}</option>
          </select>
        </div>
      </div>
    `;
  },

  // ─── Left Panel: Design Section ─────────────────────────────────

  _renderSectionDesign() {
    const has3Plus = this._factors.some(f => f.levels.length > 2);
    const twoLevelOnly = new Set(['frac', 'pb']);

    // Dynamic formula for full factorial
    const fullFormula = has3Plus
      ? this._factors.map(f => f.levels.length).join('\u00d7')
      : '2<sup>k</sup>';

    const content = `
      ${this._renderDesignRecommendation()}
      <div class="doe__design-options">
        ${DESIGN_TYPES.map(dt => {
          const disabled = has3Plus && twoLevelOnly.has(dt.key);
          const tip = disabled
            ? this._t('tipTwoLevelOnly')
            : this._t('tip_' + dt.key);
          const formula = dt.key === 'full' ? fullFormula : dt.formula;
          return `
          <button class="doe__design-opt ${this._designType === dt.key ? 'doe__design-opt--active' : ''} ${disabled ? 'doe__design-opt--disabled' : ''}"
                  data-type="${dt.key}" type="button"
                  ${disabled ? 'disabled' : ''}
                  title="${this._esc(tip)}">
            <span class="doe__design-opt-label">${this._t('design_' + dt.key)}</span>
            <span class="doe__design-opt-desc">${formula}</span>
          </button>`;
        }).join('')}
      </div>
      ${this._designType === 'frac' ? this._renderResolutionTable() : ''}
      ${this._designType === 'pb' ? this._renderPBTable() : ''}
      ${this._designType === 'bb' ? this._renderBBInfo() : ''}
      ${this._designType === 'taguchi' ? this._renderTaguchiSelector() : ''}
      ${['dopt', 'aopt', 'gopt'].includes(this._designType) ? this._renderOptimalOptions() : ''}
      ${this._renderDesignParameters()}
      ${this._renderDesignSummary()}
    `;
    return this._renderSection('design', 'stepDesignType', content);
  },

  _renderDesignRecommendation() {
    const k = this._factors.length;
    const has3Levels = this._factors.some(f => f.levels.length >= 3);
    let rec = '';
    let recKey = '';

    if (k <= 4 && !has3Levels) {
      rec = 'full'; recKey = 'recFull';
    } else if (k <= 6 && !has3Levels) {
      rec = 'frac'; recKey = 'recFrac';
    } else if (k >= 7 && !has3Levels) {
      rec = 'pb'; recKey = 'recPB';
    } else if (k >= 3 && k <= 7 && has3Levels) {
      rec = 'bb'; recKey = 'recBB';
    } else if (has3Levels) {
      rec = 'taguchi'; recKey = 'recTaguchi';
    }

    if (!rec) return '';
    return `
      <div class="doe__recommendation">
        <span class="doe__recommendation-icon">\u2728</span>
        <span class="doe__recommendation-text">${this._t(recKey, { k })}</span>
        <button class="doe__recommendation-btn" data-rec-type="${rec}" type="button">
          ${this._t('design_' + rec)}
        </button>
      </div>
    `;
  },

  _renderResolutionTable() {
    const currentK = this._factors.length;
    const resCellClass = (res) => {
      const map = { 'Full':'doe__res-full','VIII':'doe__res-viii','VII':'doe__res-vii',
        'VI':'doe__res-vi','V':'doe__res-v','IV':'doe__res-iv','III':'doe__res-iii' };
      return map[res] || '';
    };

    let html = `
      <div class="doe__sub-panel">
        <div class="dmike-split__section-title">${this._t('resTableTitle')}</div>
        <div class="doe__res-info">${this._selectedRes
          ? `${this._selectedRes.k} ${this._t('factors')} \u00b7 ${this._selectedRes.runs} Runs \u00b7 ${this._t('resolution')} ${this._selectedRes.res}`
          : this._t('resSelectPrompt')}</div>
        <div class="doe__res-table-wrap">
          <table class="doe__res-table">
            <thead>
              <tr>
                <th class="doe__res-corner">${this._t('runs')}</th>
                <th colspan="${K_RANGE.length}" style="text-align:center;letter-spacing:2px">${this._t('factorsHeader')}</th>
              </tr>
              <tr>
                <th class="doe__res-corner"></th>
                ${K_RANGE.map(k => `<th class="${k === currentK ? 'doe__res-col--active' : 'doe__res-col--inactive'}">${k}</th>`).join('')}
              </tr>
            </thead>
            <tbody>`;

    ALL_RUNS.forEach(runs => {
      html += `<tr><td class="doe__res-run-label">${runs}</td>`;
      K_RANGE.forEach(k => {
        const d = FRAC.find(x => x.k === k && x.runs === runs);
        if (d) {
          const isActiveCol = k === currentK;
          const sel = this._selectedRes && this._selectedRes.k === k && this._selectedRes.runs === runs;
          const lbl = d.res === 'Full' ? this._t('resFull') : d.res;
          const disabledCls = isActiveCol ? '' : 'doe__res-cell--disabled';
          html += `<td><span class="doe__res-cell ${resCellClass(d.res)} ${disabledCls} ${sel ? 'doe__res-cell--selected' : ''}"
                        ${isActiveCol ? `data-k="${k}" data-runs="${runs}" data-res="${d.res}" data-p="${d.p}"` : ''}>${this._esc(lbl)}</span></td>`;
        } else {
          html += '<td><span class="doe__res-cell doe__res-cell--empty"></span></td>';
        }
      });
      html += '</tr>';
    });

    html += `</tbody></table></div>
        ${this._renderResolutionAliasDetail()}
        <div class="doe__res-legend">
          <span class="doe__res-legend-title">${this._t('resLegendTitle')}</span>
          <dl class="doe__res-legend-list">
            <div class="doe__res-legend-item"><dt><span class="doe__res-cell doe__res-full">${this._t('resFull')}</span></dt><dd>${this._t('resLegendFull')}</dd></div>
            <div class="doe__res-legend-item"><dt><span class="doe__res-cell doe__res-vii">VII</span></dt><dd>${this._t('resLegendVII')}</dd></div>
            <div class="doe__res-legend-item"><dt><span class="doe__res-cell doe__res-vi">VI</span></dt><dd>${this._t('resLegendVI')}</dd></div>
            <div class="doe__res-legend-item"><dt><span class="doe__res-cell doe__res-v">V</span></dt><dd>${this._t('resLegendV')}</dd></div>
            <div class="doe__res-legend-item"><dt><span class="doe__res-cell doe__res-iv">IV</span></dt><dd>${this._t('resLegendIV')}</dd></div>
            <div class="doe__res-legend-item"><dt><span class="doe__res-cell doe__res-iii">III</span></dt><dd>${this._t('resLegendIII')}</dd></div>
          </dl>
        </div>
      </div>`;
    return html;
  },

  _renderResolutionAliasDetail() {
    if (!this._selectedRes || this._selectedRes.res === 'Full') return '';

    const { k, p } = this._selectedRes;
    const alias = computeAliasStructure(k, p, 'frac');
    if (!alias || (alias.generatorStrings.length === 0 && alias.aliases.length === 0)) return '';

    const nameMap = {};
    for (let i = 0; i < k; i++) {
      const letter = String.fromCharCode(65 + i);
      const name = this._factors[i]?.name?.trim();
      nameMap[letter] = name || letter;
    }

    const replaceLetters = (code) => code.split('').map(ch => nameMap[ch] || ch).join(' \u00b7 ');
    const formatGen = (gen) => {
      const [left, right] = gen.split(' = ');
      return `${nameMap[left] || left} = ${replaceLetters(right)}`;
    };
    const formatDef = (word) => `I = ${replaceLetters(word)}`;

    let html = `<div class="doe__res-alias-detail">
      <span class="doe__res-alias-detail-title">${this._t('aliasDetailTitle')}</span>`;

    if (alias.generatorStrings.length > 0) {
      html += `<div class="doe__res-alias-section">
        <span class="doe__res-alias-label">${this._t('generators')}:</span>
        ${alias.generatorStrings.map(g => `<code class="doe__res-alias-code">${this._esc(formatGen(g))}</code>`).join(' ')}
      </div>`;
    }

    if (alias.definingRelation.length > 0) {
      html += `<div class="doe__res-alias-section">
        <span class="doe__res-alias-label">${this._t('definingRelation')}:</span>
        ${alias.definingRelation.map(w => `<code class="doe__res-alias-code">${this._esc(formatDef(w))}</code>`).join(' ')}
      </div>`;
    }

    if (alias.aliases.length > 0) {
      html += `<table class="doe__res-alias-table">
        <thead><tr><th>${this._t('term')}</th><th>${this._t('aliasedWith')}</th></tr></thead>
        <tbody>
          ${alias.aliases.map(a => `
            <tr>
              <td><code>${this._esc(replaceLetters(a.term))}</code></td>
              <td>${a.aliasedWith.map(w => `<code>${this._esc(replaceLetters(w))}</code>`).join(', ')}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>`;
    }

    html += '</div>';
    return html;
  },

  _renderPBTable() {
    return `
      <div class="doe__sub-panel">
        <div class="dmike-split__section-title">${this._t('pbTitle')}</div>
        <div class="doe__pb-info">${this._selectedPBIdx !== null
          ? `${PB_DESIGNS[this._selectedPBIdx].label} ${this._t('factors')}`
          : this._t('pbSelectPrompt')}</div>
        <table class="doe__pb-table">
          <thead><tr><th></th><th>${this._t('factors')}</th><th>${this._t('runs')}</th></tr></thead>
          <tbody>
            ${PB_DESIGNS.map((d, i) => `
              <tr class="doe__pb-row ${this._selectedPBIdx === i ? 'doe__pb-row--selected' : ''}" data-idx="${i}">
                <td><span class="doe__pb-radio"></span></td>
                <td>${this._esc(d.label)}</td>
                <td>${this._esc(d.runs)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  },

  _renderBBInfo() {
    const k = this._factors.length;
    const available = BOX_BEHNKEN[k];
    const nCenter = this._options.bbCenterPoints || 3;
    const runs = available ? (available.length * 4 + nCenter) : '?';
    return `
      <div class="doe__sub-panel">
        <div class="dmike-split__section-title">${this._t('bbTitle')}</div>
        <div class="doe__bb-info-body">
          ${available ? `
            <p class="doe__bb-detail">${this._t('bbDetail', { k, pairs: available.length, runs })}</p>
          ` : `
            <p class="doe__bb-warning">${this._t('bbNotAvailable', { k, min: 3, max: 7 })}</p>
          `}
        </div>
      </div>
    `;
  },

  _renderTaguchiSelector() {
    const lc = this._factors.map(f => f.levels.length);
    const candidates = taguchiCandidates(lc);
    const sameLevels = lc.length > 0 && lc.every(n => n === lc[0]);
    const labelKey = !sameLevels ? 'taguchiLevelsMixed' : (lc[0] === 3 ? 'taguchiLevels3' : 'taguchiLevels2');

    const selected = this._options.taguchiArray || (candidates.length > 0 ? candidates[0].name : '');

    return `
      <div class="doe__sub-panel">
        <div class="dmike-split__section-title">${this._t('taguchiTitle')}</div>
        <div class="doe__taguchi-info">${this._t(labelKey)}</div>
        ${candidates.length > 0 ? `
          <table class="doe__taguchi-table">
            <thead><tr>
              <th></th>
              <th>${this._t('taguchiArray')}</th>
              <th>${this._t('runs')}</th>
              <th>max. ${this._t('factors')}</th>
            </tr></thead>
            <tbody>
              ${candidates.map(oa => `
                <tr class="doe__taguchi-row ${selected === oa.name ? 'doe__taguchi-row--selected' : ''}" data-oa="${oa.name}">
                  <td><span class="doe__taguchi-radio"></span></td>
                  <td><strong>${oa.name}</strong></td>
                  <td>${oa.runs}</td>
                  <td>${oa.maxFactors}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        ` : `
          <p class="doe__taguchi-warning">${this._t('taguchiNotAvailable', { k, levels: nLevels })}</p>
        `}
      </div>
    `;
  },

  _renderOptimalOptions() {
    const k = this._factors.length;
    const quad = this._options.optimalQuadratic;
    const minRuns = minRunsForModel(k, quad);
    const currentRuns = this._options.optimalRuns || 0;
    const valid = currentRuns >= minRuns;
    const criterionKey = this._designType; // 'dopt', 'aopt', 'gopt'

    return `
      <div class="doe__sub-panel">
        <div class="dmike-split__section-title">${this._t('optimalTitle')}</div>
        <div class="doe__optimal-info">${this._t('optimalInfo_' + criterionKey)}</div>
        <div class="field-group">
          <label class="doe__input-label">${this._t('optimalRuns')}</label>
          <input type="number" class="field doe__optimal-runs-input" min="${minRuns}" max="200"
                 value="${currentRuns || minRuns}" />
          <span class="doe__optimal-hint">${this._t('optimalMinRuns', { min: minRuns })}</span>
        </div>
        <label class="doe__check-row">
          <input type="checkbox" class="doe__optimal-quad-check"
                 ${quad ? 'checked' : ''} />
          <span>${this._t('optimalQuadratic')}</span>
          <span class="doe__param-tooltip" title="${this._esc(this._t('tipOptimalQuadratic'))}">?</span>
        </label>
        ${!valid ? `<div class="doe__optimal-warning">${this._t('optimalTooFewRuns', { min: minRuns })}</div>` : ''}
      </div>
    `;
  },

  _renderDesignParameters() {
    const replicates = this._options.replicates || 1;
    return `
      <div class="dmike-split__section-title">${this._t('stepParameters')}</div>

      <div class="doe__param-group">
        <label class="doe__check-row">
          <input type="checkbox" class="doe__randomize-check"
                 ${this._options.randomize ? 'checked' : ''} />
          <span>${this._t('optRandomize')}</span>
          <span class="doe__param-tooltip" title="${this._esc(this._t('tipRandomize'))}">?</span>
        </label>
        ${!['ccd', 'bb', 'taguchi', 'dopt', 'aopt', 'gopt'].includes(this._designType) ? `
          <label class="doe__check-row">
            <input type="checkbox" class="doe__center-check"
                   ${this._options.centerPoints ? 'checked' : ''} />
            <span>${this._t('optCenterPoints')}</span>
            <span class="doe__param-tooltip" title="${this._esc(this._t('tipCenterPoints'))}">?</span>
          </label>
        ` : ''}
        <div class="doe__replicates-row">
          <label class="doe__input-label">${this._t('optReplicates')}</label>
          <input type="number" class="field doe__replicates-input" min="1" max="10"
                 value="${replicates}" />
          <span class="doe__param-tooltip" title="${this._esc(this._t('tipReplicates'))}">?</span>
        </div>
      </div>

      ${this._designType === 'bb' ? `
        <div class="field-group">
          <label class="doe__input-label">${this._t('bbCenterPoints')}</label>
          <input type="number" class="field doe__bb-cp-input" min="1" max="10"
                 value="${this._options.bbCenterPoints}" />
        </div>
      ` : ''}

      ${this._designType === 'ccd' ? `
        <div class="field-group">
          <label class="doe__input-label">${this._t('alphaType')}</label>
          <select class="field doe__alpha-type-select">
            <option value="rotatable" ${this._options.alphaType === 'rotatable' ? 'selected' : ''}>${this._t('alphaRotatable')}</option>
            <option value="face-centered" ${this._options.alphaType === 'face-centered' ? 'selected' : ''}>${this._t('alphaFaceCentered')}</option>
            <option value="spherical" ${this._options.alphaType === 'spherical' ? 'selected' : ''}>${this._t('alphaSpherical')}</option>
          </select>
        </div>
        <div class="field-group">
          <label class="doe__input-label">${this._t('ccdCenterPoints')}</label>
          <input type="number" class="field doe__ccd-cp-input" min="1" max="10"
                 value="${this._options.ccdCenterPoints}" />
        </div>
      ` : ''}
    `;
  },

  _renderDesignSummary() {
    const k = this._factors.length;
    let runs = '?';
    let res = '';

    switch (this._designType) {
      case 'full': {
        const allTwo = this._factors.every(f => f.levels.length === 2);
        runs = (allTwo
          ? Math.pow(2, k)
          : this._factors.reduce((p, f) => p * f.levels.length, 1)
        ) + (this._options.centerPoints ? 3 : 0);
        res = 'Full';
        break;
      }
      case 'frac':
        if (this._selectedRes) {
          runs = this._selectedRes.runs + (this._options.centerPoints ? 3 : 0);
          res = this._selectedRes.res;
        }
        break;
      case 'pb': {
        let n = Math.ceil((k + 1) / 4) * 4;
        if (n <= k) n += 4;
        runs = n + (this._options.centerPoints ? 3 : 0);
        res = 'III';
        break;
      }
      case 'ccd': {
        const factRuns = Math.pow(2, k);
        const starRuns = 2 * k;
        runs = factRuns + starRuns + (this._options.ccdCenterPoints || 3);
        res = 'CCD';
        break;
      }
      case 'bb': {
        const pairs = BOX_BEHNKEN[k];
        if (pairs) {
          runs = pairs.length * 4 + (this._options.bbCenterPoints || 3);
        }
        res = 'BB';
        break;
      }
      case 'taguchi': {
        const sel = this._options.taguchiArray;
        const oa = sel ? Object.values(TAGUCHI).find(t => t.name === sel) : null;
        if (oa) runs = oa.runs;
        res = sel || 'OA';
        break;
      }
      case 'dopt':
      case 'aopt':
      case 'gopt': {
        const minR = minRunsForModel(k, this._options.optimalQuadratic);
        runs = this._options.optimalRuns || minR;
        res = { dopt: 'D-Opt', aopt: 'A-Opt', gopt: 'G-Opt' }[this._designType];
        break;
      }
    }

    const reps = this._options.replicates || 1;
    if (typeof runs === 'number' && reps > 1) runs = runs * reps;

    return `
      <div class="doe__summary-card">
        <div class="doe__summary-item">${this._t('factors')}: <strong>${k}</strong></div>
        <div class="doe__summary-item">${this._t('runs')}: <strong>${runs}</strong></div>
        <div class="doe__summary-item">${this._t('resolution')}: <strong>${res}</strong></div>
        <div class="doe__summary-item">${this._t('responses')}: <strong>${this._responses.length}</strong></div>
        ${this._design
          ? `<div class="doe__summary-item"><span class="doe__generated-badge">\u2713 ${this._t('generated', { runs: this._design.runOrder.length })}</span></div>`
          : `<div class="doe__summary-item doe__summary-item--pending">${this._isConfigValid() ? this._t('configReady') : this._t('configIncomplete')}</div>`
        }
      </div>
    `;
  },

  // ─── Right Panel: Output Content ────────────────────────────────

  _renderOutputContent() {
    if (!this._design) {
      if (!this._isConfigValid()) {
        return `
          <div class="doe__placeholder">
            <p>${this._t('configureLeft')}</p>
          </div>
        `;
      }
      return '';
    }

    const wsValid = isWorksheetValid(this._context, this._worksheetRef);
    const resp = wsValid ? readResponsesFromWorksheet(this._context, this._worksheetRef) : null;
    const pct = resp && resp.totalCount > 0 ? Math.round(resp.filledCount / resp.totalCount * 100) : 0;

    let html = '';

    // Worksheet header
    html += `
      <div class="dmike-split__output-section-header">
        <span class="dmike-split__output-section">${this._t('stepResults')}</span>
      </div>
    `;

    // Status bar
    if (resp) {
      html += `
        <div class="doe__results-status">
          <div class="doe__results-bar">
            <div class="doe__results-bar-fill" style="width:${pct}%"></div>
          </div>
          <span class="doe__results-text">${resp.filledCount} / ${resp.totalCount} ${this._t('valuesFilled')} (${pct}%)</span>
        </div>
      `;
    }

    // Transfer to Regression button (above data table, when all responses filled)
    if (resp?.complete) {
      html += `
        <div class="doe__transfer-section">
          <button class="btn btn--primary doe__transfer-regression-btn" type="button">
            <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
            ${this._t('transferToRegression')}
          </button>
        </div>
      `;
    }

    // Embedded grid
    if (wsValid) {
      html += `
        <div class="dmike-embedded-grid dmike-embedded-grid--md doe__embedded-grid"></div>
      `;
    }

    // Evaluation summary (design quality: efficiency, VIF, aliases, power)
    if (this._evaluation) {
      html += this._renderEvaluationSummary();
    }

    // Dispersion analysis (only when replicates ≥ 2 and responses are filled)
    if (this._design && resp?.complete && this._designType !== 'taguchi' && this._designType !== 'evop') {
      html += this._renderDispersionAnalysis(resp);
    }

    return html;
  },

  // ─── Dispersion Analysis (Streuungs-DoE) ────────────────────────

  /**
   * Render the dispersion analysis section: per-design-point variance
   * statistics plus dual response models for mean and ln(s²).
   *
   * Only shown when at least one design point has been replicated.
   */
  _renderDispersionAnalysis(resp) {
    if (!this._design || !resp?.values?.length) return '';

    // Use the active response column
    const idx = Math.min(this._analysisResponseIdx, resp.values.length - 1);
    const yRaw = resp.values[idx] || [];
    const y = yRaw.map(v => (typeof v === 'number' && isFinite(v)) ? v : NaN);

    const factorNames = this._factors.map((f, i) => f.name || String.fromCharCode(65 + i));
    const result = computeDispersionAnalysis(this._design, y, factorNames, 0.05);

    // Silently skip if no replicates — the section only makes sense for replicated designs
    if (!result.ok) {
      if (result.reason === 'no-replicates' || result.reason === 'insufficient-data') {
        // Hide section unless the user explicitly chose replicates ≥ 2
        if ((this._options.replicates || 1) < 2) return '';
        return `
          <div class="doe__eval-section">
            <h4 class="doe__eval-heading">${this._t('dispersionTitle')}</h4>
            <p class="doe__eval-note">${this._t('dispersionNoReplicates')}</p>
          </div>
        `;
      }
      return '';
    }

    const respName = this._responses[idx]?.name || `Y${idx + 1}`;

    return `
      <div class="dmike-split__output-section-header">
        <span class="dmike-split__output-section">${this._t('dispersionSection')}</span>
      </div>
      <div class="doe__eval-detail">
        <div class="doe__eval-section">
          <h4 class="doe__eval-heading">
            ${this._t('dispersionTitle')}
            <span class="doe__eval-tooltip" title="${this._esc(this._t('tipDispersion'))}">?</span>
          </h4>
          <p class="doe__eval-note">${this._t('dispersionLead', {
            response: this._esc(respName),
            min: result.minReplicates,
            max: result.maxReplicates,
            points: result.groups.length,
          })}</p>

          ${this._renderDispersionGroupsTable(result.groups)}

          ${result.zeroVarPoints > 0 ? `
            <p class="doe__eval-note">${this._t('dispersionZeroVar', { n: result.zeroVarPoints })}</p>
          ` : ''}

          ${this._renderDispersionModelTables(result)}

          ${this._renderDispersionConclusion(result)}
        </div>
      </div>
    `;
  },

  _renderDispersionGroupsTable(groups) {
    const rows = groups.map(g => `
      <tr>
        <td>${g.point}</td>
        <td>${g.n}</td>
        <td>${g.mean.toFixed(4)}</td>
        <td>${g.sd.toFixed(4)}</td>
        <td>${g.variance.toFixed(6)}</td>
        <td>${g.lnVariance != null ? g.lnVariance.toFixed(4) : '—'}</td>
      </tr>
    `).join('');
    return `
      <table class="doe__alias-table doe__dispersion-table">
        <thead>
          <tr>
            <th>${this._t('dispersionPoint')}</th>
            <th>n</th>
            <th>${this._t('dispersionMean')}</th>
            <th>s</th>
            <th>s²</th>
            <th>ln(s²)</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    `;
  },

  _renderDispersionModelTables(result) {
    const renderModel = (model, titleKey) => {
      if (!model?.coefficients) {
        return `
          <div class="doe__dispersion-model">
            <h5 class="doe__dispersion-model-title">${this._t(titleKey)}</h5>
            <p class="doe__eval-note">${this._t('dispersionModelNotFitted')}</p>
          </div>
        `;
      }
      const rows = model.coefficients
        .filter(c => c.term !== 'Intercept')
        .map(c => `
          <tr class="${c.significant ? 'doe__dispersion-sig' : ''}">
            <td>${this._esc(c.term)}</td>
            <td>${c.coefficient.toFixed(4)}</td>
            <td>${c.effect.toFixed(4)}</td>
            <td>${c.p.toFixed(4)}</td>
          </tr>
        `).join('');
      return `
        <div class="doe__dispersion-model">
          <h5 class="doe__dispersion-model-title">${this._t(titleKey)}</h5>
          <p class="doe__eval-note">R² = ${(model.rSquared * 100).toFixed(1)}%, R²<sub>adj</sub> = ${(model.rSquaredAdj * 100).toFixed(1)}%</p>
          <table class="doe__alias-table doe__dispersion-coef-table">
            <thead>
              <tr>
                <th>${this._t('term')}</th>
                <th>${this._t('coefficient')}</th>
                <th>${this._t('effect')}</th>
                <th>p</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      `;
    };

    return `
      <div class="doe__dispersion-models">
        ${renderModel(result.meanModel, 'dispersionMeanModel')}
        ${renderModel(result.dispersionModel, 'dispersionLogVarModel')}
      </div>
    `;
  },

  _renderDispersionConclusion(result) {
    if (!result.dispersionModel) {
      return `<p class="doe__eval-note">${this._t('dispersionNoModel')}</p>`;
    }
    if (result.significantDispersion.length === 0) {
      return `
        <div class="doe__dispersion-conclusion doe__dispersion-conclusion--none">
          <strong>${this._t('dispersionConclusion')}:</strong>
          ${this._t('dispersionConclusionNone')}
        </div>
      `;
    }
    const items = result.significantDispersion.map(d => {
      if (d.prefer === 'low' || d.prefer === 'high') {
        return `<li>${this._esc(d.term)}: ${this._t('dispersionPrefer_' + d.prefer)} (β = ${d.coefficient.toFixed(3)}, p = ${d.p.toFixed(4)})</li>`;
      }
      return `<li>${this._esc(d.term)}: ${this._t('dispersionPreferInteraction')} (β = ${d.coefficient.toFixed(3)}, p = ${d.p.toFixed(4)})</li>`;
    }).join('');
    return `
      <div class="doe__dispersion-conclusion">
        <strong>${this._t('dispersionConclusion')}:</strong>
        <ul>${items}</ul>
      </div>
    `;
  },

  // ─── Evaluation Summary (compact + expandable detail) ──────────

  _renderEvaluationSummary() {
    const ev = this._evaluation;
    if (!ev) return '';

    return `
      <div class="dmike-split__output-section-header">
        <span class="dmike-split__output-section">${this._t('stepEvaluate')}</span>
      </div>
      <div class="doe__eval-compact">
        ${this._renderEvaluationDetail(ev)}
      </div>
    `;
  },

  _renderEvaluationDetail(ev) {
    const eff = ev.efficiency;
    let html = '<div class="doe__eval-detail">';

    // Efficiency cards
    html += `
      <div class="doe__eval-section">
        <h4 class="doe__eval-heading">
          ${this._t('efficiencyTitle')}
        </h4>
        <div class="dmike-kpi-strip">
          ${[
            { label: this._t('dEff'), val: eff.dEfficiency, tip: this._t('tipDEff'), algoId: ALGO_ID_DEFF },
            { label: this._t('aEff'), val: eff.aEfficiency, tip: this._t('tipAEff'), algoId: ALGO_ID_DEFF },
            { label: this._t('gEff'), val: eff.gEfficiency, tip: this._t('tipGEff'), algoId: ALGO_ID_DEFF },
          ].map(c => {
            const cls = c.val >= 80 ? 'dmike-kpi--good' : c.val >= 50 ? 'dmike-kpi--warn' : 'dmike-kpi--bad';
            return `
            <div class="dmike-kpi ${cls}" title="${this._esc(c.tip)}">
              <div class="dmike-kpi-label">${c.label} <button class="doe__algo-link" data-algo-id="${c.algoId}" type="button">${ALGO_LINK_SVG}</button></div>
              <div class="dmike-kpi-value">${Math.round(c.val)}%</div>
              <div class="doe__eff-bar"><div class="doe__eff-bar-fill ${cls}" style="width:${Math.min(100, c.val)}%"></div></div>
            </div>`;
          }).join('')}
          <div class="dmike-kpi" title="${this._esc(this._t('tipCondNum'))}">
            <div class="dmike-kpi-label">${this._t('condNum')}</div>
            <div class="dmike-kpi-value">${eff.conditionNumber.toFixed(1)}</div>
          </div>
          <div class="dmike-kpi" title="${this._esc(this._t('tipMaxLev'))}">
            <div class="dmike-kpi-label">${this._t('maxLeverage')}</div>
            <div class="dmike-kpi-value">${eff.maxLeverage.toFixed(3)}</div>
          </div>
        </div>
      </div>
    `;

    // VIF table — ev.vif is a flat array [{term, vif}]; split into main effects vs interactions
    const vifArr = Array.isArray(ev.vif) ? ev.vif : [];
    const vifMain = vifArr.filter(v => !v.term.includes('*'));
    const vifInter = vifArr.filter(v => v.term.includes('*'));
    if (vifMain.length || vifInter.length) {
      const vifRating = (v) => v <= 1.01 ? 'doe__vif-perfect' : v <= 5 ? 'doe__vif-ok' : v <= 10 ? 'doe__vif-warn' : 'doe__vif-bad';
      html += `
        <div class="doe__eval-section">
          <h4 class="doe__eval-heading">
            ${this._t('vifTitle')}
            <span class="doe__eval-tooltip" title="${this._esc(this._t('tipVIF'))}">?</span>
            <button class="doe__algo-link" data-algo-id="${ALGO_ID_VIF}" type="button">${ALGO_LINK_SVG}</button>
          </h4>
          <div class="doe__vif-tables">
            ${vifMain.length ? `
              <table class="doe__vif-table">
                <thead><tr><th>${this._t('mainEffects')}</th><th>VIF</th></tr></thead>
                <tbody>
                  ${vifMain.map(v => `
                    <tr class="${vifRating(v.vif)}"><td>${this._esc(v.term)}</td><td>${v.vif.toFixed(2)}</td></tr>
                  `).join('')}
                </tbody>
              </table>
            ` : ''}
            ${vifInter.length ? `
              <table class="doe__vif-table">
                <thead><tr><th>${this._t('interactions')}</th><th>VIF</th></tr></thead>
                <tbody>
                  ${vifInter.map(v => `
                    <tr class="${vifRating(v.vif)}"><td>${this._esc(v.term)}</td><td>${v.vif.toFixed(2)}</td></tr>
                  `).join('')}
                </tbody>
              </table>
            ` : ''}
          </div>
        </div>
      `;
    }

    // Alias structure
    if (ev.aliasStructure) {
      const al = ev.aliasStructure;
      if (al.aliases.length > 0 || al.generators?.length > 0) {
        html += `
          <div class="doe__eval-section">
            <h4 class="doe__eval-heading">
              ${this._t('aliasTitle')}
              <span class="doe__eval-tooltip" title="${this._esc(this._t('tipAlias'))}">?</span>
            </h4>
            ${al.generators?.length ? `
              <div class="doe__alias-gens">
                <span class="doe__alias-gen-label">${this._t('generators')}:</span>
                ${al.generators.map(g => `<code class="doe__alias-gen">${this._esc(g)}</code>`).join(' ')}
              </div>
            ` : ''}
            ${al.aliases.length > 0 ? `
              <table class="doe__alias-table">
                <thead><tr><th>${this._t('term')}</th><th>${this._t('aliasedWith')}</th></tr></thead>
                <tbody>
                  ${al.aliases.map(a => `
                    <tr>
                      <td><code>${this._esc(a.term)}</code></td>
                      <td>${a.aliasedWith.map(w => `<code>${this._esc(w)}</code>`).join(', ')}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            ` : `<p class="doe__eval-note">${this._t('noAliases')}</p>`}
          </div>
        `;
      }
    }

    // Power analysis
    if (ev.power?.length > 0) {
      const powerRating = (p) => p >= 0.8 ? 'doe__power-good' : p >= 0.5 ? 'doe__power-ok' : 'doe__power-low';
      html += `
        <div class="doe__eval-section">
          <h4 class="doe__eval-heading">${this._t('powerTitle')}
            <span class="doe__eval-tooltip" title="${this._esc(this._t('tipPower'))}">?</span>
          </h4>
          <p class="doe__eval-note">${this._t('powerDesc', {
            n: this._design?.runOrder?.length || '?',
            dfError: ev.power[0]?.dfError ?? '?',
            alpha: '0.05',
          })}</p>
          <table class="doe__power-table">
            <thead><tr><th>${this._t('effectSize')}</th><th>${this._t('power')}</th><th></th></tr></thead>
            <tbody>
              ${ev.power.map(row => `
                <tr class="${powerRating(row.power)}">
                  <td>${row.effectSize}</td>
                  <td>${(row.power * 100).toFixed(0)}%</td>
                  <td><div class="doe__power-bar"><div class="doe__power-bar-fill" style="width:${(row.power * 100).toFixed(0)}%"></div></div></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
    }

    html += '</div>';
    return html;
  },

  // ─── Charts ────────────────────────────────────────────────────

  _destroyCharts() {
    if (!this._context?.chartManager) return;
    for (const c of this._charts) {
      try { this._context.chartManager.destroy(c); } catch {}
    }
    this._charts = [];
  },

  // ─── Embedded Grid ─────────────────────────────────────────────

  _mountEmbeddedGrid(el) {
    const container = el.querySelector('.doe__embedded-grid');
    if (!container || !this._worksheetRef) return;

    const ref = this._worksheetRef;
    const ws = this._context.stateManager.getModuleState(ref.instanceId);
    if (!ws?.sheets) return;

    const sheet = ws.sheets.find(s => s.id === ref.sheetId);
    if (!sheet?.state) return;

    this._embeddedGrid = new DataGrid(container, {
      toast: this._context.notify || (() => {}),
      t: (key) => this._context.i18n.t(key),
      openInWorksheet: () => {
        if (this._worksheetRef?.instanceId) {
          this._context.eventBus.emit('module:activated', { instanceId: this._worksheetRef.instanceId });
        }
      },
    });
    this._embeddedGrid.setState(sheet.state);

    this._embeddedGrid.on('cell:changed', () => this._syncEmbeddedGridToWorksheet());
    this._embeddedGrid.on('data:pasted', () => this._syncEmbeddedGridToWorksheet());
    this._embeddedGrid.on('data:imported', () => this._syncEmbeddedGridToWorksheet());
  },

  _syncEmbeddedGridToWorksheet() {
    if (!this._embeddedGrid || !this._worksheetRef) return;

    const ref = this._worksheetRef;
    const ws = this._context.stateManager.getModuleState(ref.instanceId);
    if (!ws?.sheets) return;

    const sheetIdx = ws.sheets.findIndex(s => s.id === ref.sheetId);
    if (sheetIdx < 0) return;

    ws.sheets[sheetIdx].state = this._embeddedGrid.getState();
    this._context.stateManager.setModuleState(ref.instanceId, ws);

    // Update status bar; re-render when all responses are filled to show transfer button
    this._updateResponseStatus();
  },

  /**
   * Update the response status bar (filled count / total) without
   * re-mounting the embedded grid.  When all responses are filled,
   * do a full output re-render to show the transfer button.
   */
  _updateResponseStatus() {
    const resp = readResponsesFromWorksheet(this._context, this._worksheetRef);
    if (!resp) return;

    const pct = resp.totalCount > 0 ? Math.round(resp.filledCount / resp.totalCount * 100) : 0;

    // Update status bar text & progress bar in-place
    const barFill = this._container?.querySelector('.doe__results-bar-fill');
    const statusText = this._container?.querySelector('.doe__results-text');
    if (barFill) barFill.style.width = `${pct}%`;
    if (statusText) statusText.textContent = `${resp.filledCount} / ${resp.totalCount} ${this._t('valuesFilled')} (${pct}%)`;

    // When all responses are now complete, re-render to show transfer button.
    if (resp.complete) {
      this._renderOutput();
    }
  },

  _destroyEmbeddedGrid() {
    if (this._embeddedGrid) {
      this._embeddedGrid.destroy?.();
      this._embeddedGrid = null;
    }
  },

  // ─── Event Binding: Left Panel ─────────────────────────────────

  _bindLeftPanelEvents() {
    const el = this._container;
    if (!el) return;

    // Name input
    el.querySelector('.doe__name-input')?.addEventListener('change', (e) => {
      this._doeName = e.target.value;
      this._save();
    });

    // EVOP toggle
    el.querySelector('.doe__project-check')?.addEventListener('change', (e) => {
      this._projectMode = e.target.checked;
      if (this._projectMode && this._projectPhases.length === 0) {
        this._projectPhases.push({
          cycleNumber: 1,
          doeName: this._doeName || `${this._projectName || 'Projekt'} - Phase 1`,
          factors: JSON.parse(JSON.stringify(this._factors)),
          responses: JSON.parse(JSON.stringify(this._responses)),
          designType: this._designType,
          options: { ...this._options },
          design: null, worksheetRef: null, evaluation: null,
          decision: null, completedAt: null,
        });
        this._activePhaseIdx = 0;
      }
      this._save();
      this._render();
    });

    // Project name
    el.querySelector('.doe__project-name-input')?.addEventListener('change', (e) => {
      this._projectName = e.target.value;
      this._save();
    });

    // Timeline navigation
    el.querySelectorAll('.doe__timeline-item[data-phase-idx]').forEach(btn => {
      btn.addEventListener('click', () => {
        this._viewPhase(parseInt(btn.dataset.phaseIdx, 10));
      });
    });

    // New phase button
    el.querySelector('.doe__new-phase-btn')?.addEventListener('click', () => {
      this._startNewPhase(false);
      this._save();
      this._render();
    });

    // Factor events
    this._bindFactorEvents(el);
    this._markDuplicateFactors(el);

    // Response events
    this._bindResponseEvents(el);

    // Design type events
    this._bindDesignEvents(el);
  },

  _bindFactorEvents(el) {
    el.querySelectorAll('.doe__factor-name').forEach(input => {
      input.addEventListener('change', () => {
        const f = this._factors.find(f => f.id === parseInt(input.dataset.factorId, 10));
        if (f) { f.name = input.value; this._invalidateDesign(); this._save(); this._markDuplicateFactors(el); }
      });
    });
    el.querySelectorAll('.doe__factor-unit').forEach(input => {
      input.addEventListener('change', () => {
        const f = this._factors.find(f => f.id === parseInt(input.dataset.factorId, 10));
        if (f) { f.unit = input.value; this._invalidateDesign(); this._save(); }
      });
    });
    el.querySelectorAll('.doe__factor-kind').forEach(select => {
      select.addEventListener('change', () => {
        const f = this._factors.find(f => f.id === parseInt(select.dataset.factorId, 10));
        if (!f) return;
        f.kind = select.value === 'categorical' ? 'categorical' : 'continuous';
        // Categorical factors carry no physical unit.
        if (f.kind === 'categorical') f.unit = '';
        this._invalidateDesign();
        this._save();
        this._render();
      });
    });
    el.querySelectorAll('.doe__factor-level-input').forEach(input => {
      input.addEventListener('change', () => {
        const fId = parseInt(input.dataset.factorId, 10);
        const li = parseInt(input.dataset.levelIdx, 10);
        const f = this._factors.find(f => f.id === fId);
        if (f && li >= 0 && li < f.levels.length) {
          f.levels[li] = input.value;
          this._invalidateDesign();
          this._save();
        }
      });
    });
    el.querySelectorAll('.doe__insert-level-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const fId = parseInt(btn.dataset.factorId, 10);
        const at = parseInt(btn.dataset.insertAt, 10);
        const f = this._factors.find(f => f.id === fId);
        if (f) { f.levels.splice(at, 0, ''); this._invalidateDesign(); this._save(); this._render(); }
      });
    });
    el.querySelectorAll('.doe__remove-level-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const fId = parseInt(btn.dataset.factorId, 10);
        const li = parseInt(btn.dataset.levelIdx, 10);
        const f = this._factors.find(f => f.id === fId);
        if (f && f.levels.length > 2) {
          f.levels.splice(li, 1);
          this._invalidateDesign();
          this._save();
          this._render();
        }
      });
    });
    el.querySelectorAll('.doe__factor-remove-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = parseInt(btn.dataset.factorId, 10);
        this._factors = this._factors.filter(f => f.id !== id);
        this._invalidateDesign();
        this._save();
        this._render();
      });
    });
    el.querySelector('.doe__add-factor-btn')?.addEventListener('click', () => {
      this._addFactor('', '');
      this._save();
      this._render();
    });
  },

  _bindResponseEvents(el) {
    el.querySelectorAll('.doe__response-name').forEach(input => {
      input.addEventListener('change', () => {
        const idx = parseInt(input.dataset.idx, 10);
        if (this._responses[idx]) { this._responses[idx].name = input.value; this._save(); this._scheduleAutoGenerate(); }
      });
    });
    el.querySelectorAll('.doe__response-unit').forEach(input => {
      input.addEventListener('change', () => {
        const idx = parseInt(input.dataset.idx, 10);
        if (this._responses[idx]) { this._responses[idx].unit = input.value; this._invalidateDesign(); this._save(); }
      });
    });
    el.querySelectorAll('.doe__response-goal').forEach(select => {
      select.addEventListener('change', () => {
        const idx = parseInt(select.dataset.idx, 10);
        if (this._responses[idx]) { this._responses[idx].goal = select.value; this._save(); }
      });
    });
    el.querySelectorAll('.doe__response-remove-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.idx, 10);
        this._responses.splice(idx, 1);
        this._invalidateDesign();
        this._save();
        this._render();
      });
    });
    el.querySelector('.doe__add-response-btn')?.addEventListener('click', () => {
      this._responses.push({ name: '', unit: '', goal: 'max' });
      this._save();
      this._render();
    });
  },

  _bindDesignEvents(el) {
    // Recommendation button
    el.querySelector('.doe__recommendation-btn')?.addEventListener('click', (e) => {
      this._designType = e.currentTarget.dataset.recType;
      this._selectedRes = null;
      this._selectedPBIdx = null;
      this._invalidateDesign();
      this._save();
      this._render();
    });
    // Design type buttons
    el.querySelectorAll('.doe__design-opt').forEach(btn => {
      btn.addEventListener('click', () => {
        this._designType = btn.dataset.type;
        this._selectedRes = null;
        this._selectedPBIdx = null;
        if (['dopt', 'aopt', 'gopt'].includes(this._designType) && !this._options.optimalRuns) {
          this._options.optimalRuns = minRunsForModel(this._factors.length, this._options.optimalQuadratic) + 2;
        }
        this._invalidateDesign();
        this._save();
        this._render();
      });
    });
    // Resolution table
    el.querySelectorAll('.doe__res-cell[data-k]').forEach(cell => {
      cell.addEventListener('click', () => {
        this._selectedRes = {
          k: parseInt(cell.dataset.k, 10),
          runs: parseInt(cell.dataset.runs, 10),
          res: cell.dataset.res,
          p: parseInt(cell.dataset.p, 10),
        };
        this._invalidateDesign();
        this._save();
        this._render();
      });
    });
    // PB table
    el.querySelectorAll('.doe__pb-row').forEach(row => {
      row.addEventListener('click', () => {
        this._selectedPBIdx = parseInt(row.dataset.idx, 10);
        this._invalidateDesign();
        this._save();
        this._render();
      });
    });
    // Taguchi table
    el.querySelectorAll('.doe__taguchi-row').forEach(row => {
      row.addEventListener('click', () => {
        this._options.taguchiArray = row.dataset.oa;
        this._invalidateDesign();
        this._save();
        this._render();
      });
    });
    // Design parameters
    el.querySelector('.doe__randomize-check')?.addEventListener('change', (e) => {
      this._options.randomize = e.target.checked;
      this._invalidateDesign(); this._save();
    });
    el.querySelector('.doe__center-check')?.addEventListener('change', (e) => {
      this._options.centerPoints = e.target.checked;
      this._invalidateDesign(); this._save();
    });
    el.querySelector('.doe__replicates-input')?.addEventListener('change', (e) => {
      this._options.replicates = Math.max(1, Math.min(10, parseInt(e.target.value, 10) || 1));
      this._invalidateDesign(); this._save();
    });
    el.querySelector('.doe__alpha-type-select')?.addEventListener('change', (e) => {
      this._options.alphaType = e.target.value;
      this._invalidateDesign(); this._save();
    });
    el.querySelector('.doe__ccd-cp-input')?.addEventListener('change', (e) => {
      this._options.ccdCenterPoints = Math.max(1, parseInt(e.target.value, 10) || 3);
      this._invalidateDesign(); this._save();
    });
    el.querySelector('.doe__bb-cp-input')?.addEventListener('change', (e) => {
      this._options.bbCenterPoints = Math.max(1, parseInt(e.target.value, 10) || 3);
      this._invalidateDesign(); this._save();
    });
    // Optimal design options
    el.querySelector('.doe__optimal-runs-input')?.addEventListener('change', (e) => {
      const k = this._factors.length;
      const minR = minRunsForModel(k, this._options.optimalQuadratic);
      this._options.optimalRuns = Math.max(minR, parseInt(e.target.value, 10) || minR);
      this._invalidateDesign(); this._save();
      this._render();
    });
    el.querySelector('.doe__optimal-quad-check')?.addEventListener('change', (e) => {
      this._options.optimalQuadratic = e.target.checked;
      const k = this._factors.length;
      const minR = minRunsForModel(k, this._options.optimalQuadratic);
      if ((this._options.optimalRuns || 0) < minR) this._options.optimalRuns = minR;
      this._invalidateDesign(); this._save();
      this._render();
    });
  },

  // ─── Event Binding: Right Panel ────────────────────────────────

  _bindOutputEvents() {
    const el = this._container;
    if (!el) return;

    // Embedded grid
    this._mountEmbeddedGrid(el);

    // Algorithm Lab links
    el.querySelectorAll('.doe__algo-link').forEach(link => {
      link.addEventListener('click', (e) => {
        e.stopPropagation();
        const algoId = link.dataset.algoId;
        if (algoId && this._context.eventBus) {
          this._context.eventBus.emit('lab:navigate', { algoId, tab: 'docs' });
        }
      });
    });

    // Transfer to Regression
    el.querySelector('.doe__transfer-regression-btn')?.addEventListener('click', () => this._transferToRegression());
  },

  // ─── Transfer to Regression ─────────────────────────────────────

  /**
   * Create a new Regression module instance and pre-populate it with
   * the factor columns (X) and the active response column (Y) from
   * the DoE worksheet.
   */
  _transferToRegression() {
    const ref = this._worksheetRef;
    if (!ref || !isWorksheetValid(this._context, ref)) return;

    const { stateManager: sm, eventBus } = this._context;

    // Build column refs for factor columns (X predictors)
    const colRefs = ref.factorColumnIds.map(colId => ({
      instanceId: ref.instanceId,
      sheetId: ref.sheetId,
      columnId: colId,
    }));

    // Build Y column ref (active response)
    const respColId = ref.responseColumnIds[this._analysisResponseIdx] || ref.responseColumnIds[0];
    const yKey = `${ref.instanceId}|${ref.sheetId}|${respColId}`;

    // Determine max feasible polynomial degree based on data size
    const resp = readResponsesFromWorksheet(this._context, ref);
    const nRuns = resp.totalCount / Math.max(ref.responseColumnIds.length, 1);
    const k = ref.factorColumnIds.length;
    const polyDegree = maxFeasiblePolyDegree(nRuns, k);

    // Find the phase the DoE instance actually belongs to. Cycle-agnostic.
    let phase = 'improve';
    for (const p of Object.keys(sm.get('phases') || {})) {
      const items = sm.get(`phases.${p}`) ?? [];
      if (items.some(i => i.instanceId === this._context.instanceId)) {
        phase = p;
        break;
      }
    }

    // Create regression module instance — use a fresh array copy to avoid
    // stale-reference issues when the array was replaced by filter/splice.
    const regInstanceId = crypto.randomUUID();
    const existing = sm.get(`phases.${phase}`) ?? [];
    sm.set(`phases.${phase}`, [
      ...existing,
      { instanceId: regInstanceId, moduleId: 'regression', order: existing.length, state: {} },
    ]);

    // Pre-populate regression state
    sm.setModuleState(regInstanceId, {
      colRefs,
      yKey,
      regType: 'polynomial',
      polyDegree,
      confLevel: (sm.get('settings.confidenceLevel') ?? 95) / 100,
      alpha: +((100 - (sm.get('settings.confidenceLevel') ?? 95)) / 100).toFixed(4),
      showCI: true,
      result: null,
      perXResults: null,
      activeXKey: null,
      activeTab: 'scatter',
      excludedTerms: [],
      coefSortByP: false,
    });

    // Add the regression tab and navigate to it
    eventBus.emit('module:added', {
      moduleId: 'regression',
      phase,
      instanceId: regInstanceId,
    });

    this._context.notify(this._t('transferSuccess'));
  },

  // ─── EVOP / Project Mode ───────────────────────────────────────

  _renderProjectBar() {
    return `
      <div class="doe__project-bar">
        <div class="doe__project-name-row">
          <label class="doe__name-label">${this._t('projectName')}</label>
          <input type="text" class="field doe__project-name-input"
                 value="${this._esc(this._projectName)}"
                 placeholder="${this._t('projectNamePlaceholder')}" />
        </div>
        ${this._projectPhases.length > 0 ? this._renderTimeline() : ''}
        ${this._renderEVOPSummary()}
      </div>
    `;
  },

  _renderTimeline() {
    return `
      <div class="doe__timeline">
        <h4 class="doe__timeline-title">${this._t('phaseHistory')}</h4>
        <div class="doe__timeline-track">
          ${this._projectPhases.map((ph, idx) => {
            const isCurrent = idx === this._activePhaseIdx;
            const isCompleted = !!ph.decision;
            const cls = [
              'doe__timeline-item',
              isCurrent ? 'doe__timeline-item--active' : '',
              isCompleted ? 'doe__timeline-item--done' : '',
            ].filter(Boolean).join(' ');
            const decIcon = ph.decision === 'recenter' ? '\u21bb'
              : ph.decision === 'repeat' ? '\u21ba'
              : ph.decision === 'stop' ? '\u2713' : '';
            return `
              <button class="${cls}" data-phase-idx="${idx}" type="button">
                <span class="doe__timeline-num">${ph.cycleNumber}</span>
                <span class="doe__timeline-label">${this._esc(ph.doeName || `Phase ${ph.cycleNumber}`)}</span>
                ${decIcon ? `<span class="doe__timeline-dec">${decIcon}</span>` : ''}
              </button>
            `;
          }).join('<span class="doe__timeline-arrow">\u2192</span>')}
          ${this._activePhaseIdx === -1 || (this._projectPhases[this._activePhaseIdx]?.decision) ? `
            <span class="doe__timeline-arrow">\u2192</span>
            <button class="doe__timeline-item doe__timeline-item--new doe__new-phase-btn" type="button">
              <span class="doe__timeline-num">+</span>
              <span class="doe__timeline-label">${this._t('newPhase')}</span>
            </button>
          ` : ''}
        </div>
      </div>
    `;
  },

  _renderEVOPSummary() {
    const cycles = this._projectPhases
      .filter(ph => ph.yValues && ph.design)
      .map(ph => ({
        cycleNumber: ph.cycleNumber,
        codedMatrix: ph.design.codedMatrix,
        y: ph.yValues || [],
        factorNames: (ph.factors || []).map((f, i) => f.name || String.fromCharCode(65 + i)),
      }))
      .filter(c => c.y.length > 0);

    if (cycles.length === 0) return '';

    const evop = computeEVOPEffects(cycles);
    if (evop.effects.length === 0) return '';

    return `
      <div class="doe__evop-summary">
        <h4 class="doe__evop-title">${this._t('evopEffectTable')}</h4>
        <div class="doe__evop-meta">
          <span>${this._t('evopCycles', { n: evop.cycleCount })}</span>
          <span>${this._t('evopTotalRuns', { n: evop.totalRuns })}</span>
          <span>${this._t('evopMean')}: ${evop.cycleMean.toFixed(4)}</span>
        </div>
        <table class="doe__evop-table">
          <thead><tr>
            <th>${this._t('term')}</th>
            <th>${this._t('effect')}</th>
            <th>${this._t('evopErrorLimit')}</th>
            <th>${this._t('evopSignificant')}</th>
          </tr></thead>
          <tbody>
            ${evop.effects.map(e => `
              <tr class="${e.significant ? 'doe__evop-sig' : ''}">
                <td>${this._esc(e.term)}</td>
                <td>${e.cumulativeEffect.toFixed(4)}</td>
                <td>\u00b1${e.errorLimit === Infinity ? '\u221e' : e.errorLimit.toFixed(4)}</td>
                <td>${e.significant ? '\u2605' : '\u2014'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        ${evop.bestPointDescription ? `
          <div class="doe__evop-best">
            <span class="doe__evop-best-label">${this._t('evopBestPoint')}:</span>
            <code>${this._esc(evop.bestPointDescription)}</code>
          </div>
        ` : ''}
        <div class="doe__evop-recommendation doe__evop-rec--${evop.overallRecommendation}">
          ${this._t('evopRec_' + evop.overallRecommendation)}
        </div>
      </div>
    `;
  },

  _completePhase(decision) {
    if (this._activePhaseIdx < 0 || this._activePhaseIdx >= this._projectPhases.length) return;

    const phase = this._projectPhases[this._activePhaseIdx];
    phase.decision = decision;
    phase.completedAt = new Date().toISOString();
    phase.design = this._design ? JSON.parse(JSON.stringify(this._design)) : null;
    phase.worksheetRef = this._worksheetRef ? { ...this._worksheetRef } : null;
    phase.evaluation = this._evaluation ? JSON.parse(JSON.stringify(this._evaluation)) : null;

    // Store y-values for EVOP recentering
    if (this._worksheetRef) {
      const resp = readResponsesFromWorksheet(this._context, this._worksheetRef);
      if (resp?.values?.[0]) {
        phase.yValues = [...resp.values[0]];
      }
    }

    if (decision === 'recenter') {
      this._startNewPhase(true);
    } else if (decision === 'repeat') {
      this._startNewPhase(false);
    }

    this._save();
    this._render();
  },

  _startNewPhase(recenter) {
    const prevPhase = this._projectPhases[this._activePhaseIdx];
    const newCycleNum = this._projectPhases.length + 1;

    let newFactors;
    if (recenter && prevPhase?.yValues && this._design) {
      const cycles = this._projectPhases
        .filter(ph => ph.yValues && ph.design)
        .map(ph => ({
          cycleNumber: ph.cycleNumber,
          codedMatrix: ph.design.codedMatrix,
          y: ph.yValues || [],
          factorNames: (ph.factors || []).map((f, i) => f.name || String.fromCharCode(65 + i)),
        }))
        .filter(c => c.y.length > 0);

      const evop = computeEVOPEffects(cycles);
      newFactors = recenteredFactors(this._factors, evop.bestPointCoded);
    } else {
      newFactors = JSON.parse(JSON.stringify(this._factors));
    }

    this._doeName = `${this._projectName} - Phase ${newCycleNum}`;
    this._factors = newFactors;
    this._design = null;
    this._worksheetRef = null;
    this._evaluation = null;

    this._projectPhases.push({
      cycleNumber: newCycleNum,
      doeName: this._doeName,
      factors: JSON.parse(JSON.stringify(newFactors)),
      responses: JSON.parse(JSON.stringify(this._responses)),
      designType: this._designType,
      options: { ...this._options },
      design: null,
      worksheetRef: null,
      evaluation: null,
      decision: null,
      completedAt: null,
    });
    this._activePhaseIdx = this._projectPhases.length - 1;
  },

  _viewPhase(idx) {
    if (idx < 0 || idx >= this._projectPhases.length) return;
    const ph = this._projectPhases[idx];
    this._activePhaseIdx = idx;

    this._doeName = ph.doeName || '';
    this._factors = JSON.parse(JSON.stringify(ph.factors || []));
    this._responses = JSON.parse(JSON.stringify(ph.responses || []));
    this._designType = ph.designType || 'full';
    this._options = { ...this._options, ...(ph.options || {}) };
    this._design = ph.design ? JSON.parse(JSON.stringify(ph.design)) : null;
    this._worksheetRef = ph.worksheetRef ? { ...ph.worksheetRef } : null;
    this._evaluation = ph.evaluation ? JSON.parse(JSON.stringify(ph.evaluation)) : null;

    this._save();
    this._render();
  },
};
