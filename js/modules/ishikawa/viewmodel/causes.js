/**
 * D.Mike — Ishikawa causes (viewmodel/causes.js)
 *
 * Sub-viewmodel of the hypotheses tab: expert team, cause tree, ratings,
 * filter, category names, the Pareto chart with its editor and the CSV
 * export. Knows the model, the pure ishikawa-*.js helpers and core modules —
 * never a sibling or the shell (spec E2). Tells the others when the causes
 * change; follows comparisons, deletions and loads of snapshots (spec E3).
 *
 * Spec: docs/superpowers/specs/2026-10-25-ishikawa-agent-release-design.md
 */

import { h } from '../../../core/dom.js';
import { MAX_DEPTH_CLASS } from '../ishikawa-model.js';
import { CATS, STATUS_CSS, EVENTS } from '../ishikawa-constants.js';
import { ratingBg } from '../ishikawa-charts.js';
import { catLabel, catColor } from '../ishikawa-labels.js';
import { requireEnum, requireKnownId, requireNumber, requireText } from '../../../core/agent/agent-argcheck.js';

/**
 * Fields of a cause.
 * @typedef {object} RowFields
 * @property {string} name  short name of the cause
 * @property {''|'man'|'machine'|'environment'|'material'|'measurement'|'method'} category  6M category of a main cause, "" for none; sub-causes inherit it
 * @property {string} description  what the cause is and why it is suspected
 * @property {'open'|'testing'|'confirmed'|'rejected'} status  how far the check of the cause has got
 */

const ROW_KEYS = ['name', 'category', 'description', 'status'];
const CATEGORY_VALUES = ['', 'man', 'machine', 'environment', 'material', 'measurement', 'method'];
const ROW_STATUS = ['open', 'testing', 'confirmed', 'rejected'];
const ROW_CHECKS = {
  name: (v) => requireText('value', v),
  category: (v) => { requireEnum('value', v, CATEGORY_VALUES); return v; },
  description: (v) => requireText('value', v),
  status: (v) => { requireEnum('value', v, ROW_STATUS); return v; },
};

/** The six category keys (CATS), for own names and the filter. */
const CATEGORY_KEYS = ['man', 'machine', 'environment', 'material', 'measurement', 'method'];
/** Filter values: all, or one category. */
const FILTERS = ['all', ...CATEGORY_KEYS];

/**
 * The CSV export: problem statement, cause tree with ratings, facts. Pure —
 * the download happens in CausesViewModel.exportCSV.
 * @param {object} model the State
 * @param {function(string, object=): string} t translation function of the module
 * @returns {string} CSV text with a UTF-8 byte order mark
 */
export function causesCsv(model, t) {
  const label = (key) => catLabel(model, key, t);
  const ord = model.ordered();
  const nums = model.buildNums();
  let csv = '﻿';
  csv += `"${t('problemStatement')}","${(model.problem || '').replace(/"/g, '""')}"\n\n`;
  csv += `"#","${t('level')}","${t('category')}","${t('effCat')}","${t('name')}","${t('description')}"`;
  model.experts.forEach(e => { csv += `,"${e.name.replace(/"/g, '""')}"`; });
  csv += `,"${t('avgScore')}","${t('status')}"\n`;
  ord.forEach(r => {
    const d = model.getDepth(r);
    const s = model.calcScore(r);
    const catName = r.category ? label(r.category) : '';
    const effCatName = model.effCat(r) ? label(model.effCat(r)) : '';
    const lvl = d === 0 ? t('main') : 'Sub';
    csv += `"${nums[r.id]}","${lvl}","${catName}","${effCatName}","${(r.name || '').replace(/"/g, '""')}","${'  '.repeat(d)}${(r.description || '').replace(/"/g, '""')}"`;
    model.experts.forEach(e => { csv += `,"${r.ratings[e.id] !== undefined ? r.ratings[e.id] : ''}"`; });
    csv += `,"${s !== null ? s.toFixed(1) : ''}","${r.status ? t(`status.${r.status}`) : ''}"\n`;
  });
  if (model.facts.length) {
    csv += '\n';
    csv += `"${t('tabFacts')}"\n`;
    csv += `"#","${t('factName')}","${t('factDescription')}","${t('factDate')}","${t('factOwner')}"\n`;
    model.facts.forEach((f, idx) => {
      const e = (v) => String(v ?? '').replace(/"/g, '""');
      csv += `"${idx + 1}","${e(f.name)}","${e(f.description)}","${e(f.date)}","${e(f.owner)}"\n`;
    });
  }
  return csv;
}

export class CausesViewModel {
  /**
   * Gets only what exists before the mount; the model comes with attach().
   * @param {{t: function(string, object=): string, context: object, container: function(): ?Element}} deps
   */
  constructor({ t, context, container }) {
    this._t = t;
    this._context = context;
    this._container = container;
    /** @type {?object} the component's State, set by attach() */
    this.model = null;
    /** @type {Array<{key: string, color: string}>} the six 6M categories, for the template */
    this.cats = CATS;
    /** @type {string} name typed for the next expert */
    this.expertDraft = '';
    /** @type {Object<number, boolean>} collapsed rows by id */
    this.collapsed = {};
    /** @type {string} 'all' or the category the tree is filtered to */
    this.activeFilter = 'all';
    /** @type {?number} snapshot the tree is compared with (from snapshot:compared) */
    this.compareSnapId = null;
    /** @type {string} 'current' or 'snap-<id>': the data of the Pareto chart */
    this.paretoSource = 'current';
    /** @type {string} empty-state message of the Pareto chart */
    this.paretoEmptyMsg = '';
    /** @type {Array<{key: string, color: string, def: string, name: string}>} draft of the rename form */
    this.catRenameDraft = [];
    this._paretoChart = null;
    this._paretoGen = 0;
    this._activeColorPicker = null;
    this._offs = [];
    this._emit = () => {};
    this._nextTick = (cb) => cb();
    this._ref = () => null;
  }

  /**
   * Binds the model and subscribes to the snapshot events (spec E3). Called
   * through the Alpine proxy, so the listeners write reactive state.
   * @noagent lifecycle
   * @param {{model: object, events: object, watch: function, nextTick: function, ref: function(string): ?Element}} binding
   */
  attach({ model, events, nextTick, ref }) {
    this.model = model;
    this._nextTick = nextTick;
    this._ref = ref;
    this._emit = (name, payload) => events.emit(name, payload);
    const onCompared = ({ id }) => { this.compareSnapId = id; };
    const onRemoved = ({ id }) => {
      if (this.paretoSource === `snap-${id}`) this.paretoSource = 'current';
      this._nextTick(() => this.renderPareto());
    };
    const onLoaded = () => {
      this.collapsed = {};
      this._nextTick(() => this.renderPareto());
    };
    events.on(EVENTS.snapshotCompared, onCompared);
    events.on(EVENTS.snapshotRemoved, onRemoved);
    events.on(EVENTS.snapshotLoaded, onLoaded);
    this._offs = [
      () => events.off(EVENTS.snapshotCompared, onCompared),
      () => events.off(EVENTS.snapshotRemoved, onRemoved),
      () => events.off(EVENTS.snapshotLoaded, onLoaded),
    ];
  }

  /**
   * Unsubscribes and destroys the Pareto chart.
   * @noagent lifecycle
   */
  detach() {
    this._offs.forEach((off) => off());
    this._offs = [];
    this._emit = () => {};
    // A create() still in flight sees a stale generation and destroys its chart.
    ++this._paretoGen;
    this._destroyPareto();
  }

  /**
   * Draws the Pareto chart.
   * @noagent chart
   */
  render() { this.renderPareto(); }

  /** Tells the others that causes, experts or ratings changed (spec E3). */
  _changed() { this._emit(EVENTS.causesChanged); }

  // ── Glyphs (Unicode via data-Fn, never \u in template) ────

  /** @noagent view transform @returns {string} en dash */
  glyphNdash() { return '–'; }

  /** @noagent view transform @returns {string} minus sign */
  glyphMinus() { return '−'; }

  /** @noagent view transform @returns {string} changed marker */
  glyphChanged() { return '~'; }

  /** @noagent view transform @returns {string} duplicate glyph */
  glyphDupe() { return '⎘'; }

  /** @noagent view transform @param {{collapsed: boolean}} vr visible row @returns {string} toggle title */
  toggleRowTitle(vr) { return this._t(vr.collapsed ? 'toggleRowExpand' : 'toggleRowCollapse'); }

  // ── Category / expert view helpers ────────────────────────

  /** @noagent view transform @param {string} key category @returns {string} CSS colour */
  catColor(key) { return catColor(key); }

  /** @noagent view transform @param {string} key category @returns {string} own or translated name */
  catLabel(key) { return catLabel(this.model, key, this._t); }

  /** @noagent view transform @param {string} name expert name @returns {string} initials */
  ini(name) {
    const p = (name || '').trim().split(/\s+/);
    return p.length >= 2 ? (p[0][0] + p[1][0]).toUpperCase() : (name || '').substring(0, 2).toUpperCase();
  }

  /** @noagent view transform @param {string} key category @returns {number} causes in it */
  catCount(key) {
    let n = 0;
    this.model.rows.forEach(r => { if (this.model.effCat(r) === key) n++; });
    return n;
  }

  /** @noagent view transform @param {string} key category @returns {number} its share in percent */
  catBarPct(key) {
    const total = this.model.rows.length;
    return total > 0 ? this.catCount(key) / total * 100 : 0;
  }

  // ── Experts ───────────────────────────────────────────────

  /** @param {string} name @param {?number} [exceptId] @returns {boolean} name taken (case-insensitive) */
  _expertExists(name, exceptId = null) {
    const lc = name.toLowerCase();
    return this.model.experts.some(e => e.id !== exceptId && e.name.toLowerCase() === lc);
  }

  /**
   * Add a member to the expert team. Every member rates every cause 0..9.
   * @agent
   * @param {string} name the name; must differ from the others, case-insensitive
   * @returns {number} id of the new expert
   * @throws {Error} if the name is empty, taken or not a string
   */
  addExpert(name) {
    const text = requireText('name', name).trim();
    if (!text) throw new Error('invalid name ""; allowed: a non-empty name');
    if (this._expertExists(text)) throw new Error(`expert ${JSON.stringify(text)} already exists`);
    const added = this.model.addExpert(text);
    this._changed();
    return added.id;
  }

  /** @noagent template handler: adds the typed name; a duplicate only notifies */
  submitExpertDraft() {
    const name = (this.expertDraft || '').trim();
    if (!name) return;
    if (this._expertExists(name)) { this._context.notify(this._t('expertDuplicate')); return; }
    this.addExpert(name);
    this.expertDraft = '';
  }

  /**
   * Rename a member of the expert team; their ratings stay.
   * @agent
   * @param {number} expertId the expert
   * @param {string} name the new name; must differ from the others
   * @returns {void}
   * @throws {Error} if the expert is unknown, or the name is empty or taken
   */
  renameExpert(expertId, name) {
    requireKnownId('expertId', expertId, this.model.experts.map((e) => e.id));
    const text = requireText('name', name).trim();
    if (!text) throw new Error('invalid name ""; allowed: a non-empty name');
    if (this._expertExists(text, expertId)) throw new Error(`expert ${JSON.stringify(text)} already exists`);
    this.model.renameExpert(expertId, text);
    this._changed();
  }

  /**
   * @noagent template handler: Enter commits, Escape restores
   * @param {number} id expert id
   * @param {KeyboardEvent} $event
   */
  expertEditKey(id, $event) {
    if ($event.key === 'Enter') { $event.preventDefault(); $event.target.blur(); }
    else if ($event.key === 'Escape') {
      const exp = this.model.experts.find(x => x.id === id);
      if (exp) $event.target.value = exp.name;
      $event.target.blur();
    }
  }

  /**
   * @noagent template handler: blur of the name field; agents call renameExpert
   * @param {number} id expert id
   * @param {Event} $event
   */
  commitExpertRename(id, $event) {
    const exp = this.model.experts.find(e => e.id === id);
    if (!exp) return;
    const newName = ($event.target.value || '').trim();
    if (!newName) { $event.target.value = exp.name; return; }
    if (newName === exp.name) return;
    if (this._expertExists(newName, id)) {
      this._context.notify(this._t('expertDuplicate'));
      $event.target.value = exp.name;
      $event.target.focus();
      $event.target.select();
      return;
    }
    this.renameExpert(id, newName);
  }

  /**
   * Remove a member from the expert team, with their ratings.
   * @agent
   * @param {number} expertId the expert
   * @returns {void}
   * @throws {Error} if the expert is unknown
   */
  removeExpert(expertId) {
    requireKnownId('expertId', expertId, this.model.experts.map((e) => e.id));
    this.model.removeExpert(expertId);
    this._changed();
  }

  // ── Rows / tree ───────────────────────────────────────────

  /** @noagent view transform @param {number} id row id @returns {boolean} */
  isCollapsed(id) { return Boolean(this.collapsed[id]); }

  /** @noagent view transform @param {object} row @returns {boolean} an ancestor is collapsed */
  isHidden(row) {
    let c = row;
    while (c && c.parentId !== null) {
      if (this.collapsed[c.parentId]) return true;
      c = this.model.rows.find(x => x.id === c.parentId);
    }
    return false;
  }

  /** @noagent view transform @returns {?object} diff against the compared snapshot */
  diff() { return this.compareSnapId !== null ? this.model.getDiff(this.compareSnapId) : null; }

  /** @noagent view transform @returns {Array<object>} enriched, filtered, ordered rows for the table */
  visibleRows() {
    const ord = this.model.ordered();
    const nums = this.model.buildNums();
    const d = this.diff();
    return ord
      .filter(r => this.activeFilter === 'all' || this.model.effCat(r) === this.activeFilter)
      .filter(r => !this.isHidden(r))
      .map(r => {
        const depth = this.model.getDepth(r);
        const ec = this.model.effCat(r);
        const chg = d ? d.changedMap[r.stableId] : null;
        return {
          row: r,
          depth,
          num: nums[r.id] || '',
          hasKids: this.model.hasKids(r.id),
          collapsed: Boolean(this.collapsed[r.id]),
          effCatLabel: ec ? this.catLabel(ec) : '',
          borderColor: ec ? this.catColor(ec) : 'var(--color-border-secondary)',
          defOpt: (!r.category && ec) ? (`↳ ${this.catLabel(ec)}`) : this._t('catChoose'),
          score: this.model.calcScore(r),
          chg,
        };
      });
  }

  /** @noagent view transform @param {object} vr visible row @returns {string} depth and diff classes */
  rowClass(vr) {
    const d = this.diff();
    let diffCls = '';
    if (d) {
      if (d.addedSet.has(vr.row.stableId)) diffCls = 'ishikawa__diff-new';
      else if (d.changedMap[vr.row.stableId]) diffCls = 'ishikawa__diff-chg';
    }
    return `ishikawa__depth-${Math.min(vr.depth, MAX_DEPTH_CLASS)} ${diffCls}`.trim();
  }

  /** @noagent view transform @returns {number} grip + nr + category + name + description + experts + score + status + actions */
  emptyColspan() { return 6 + this.model.experts.length + 2; }

  /** @noagent view transform @returns {string} */
  emptyMessage() { return this.model.rows.length ? this._t('noCategoryHyp') : this._t('emptyHint'); }

  /** @noagent view transform @param {object} row @returns {boolean} */
  isNameDup(row) { return this.model.isNameDuplicate(row.name, row.id); }

  /**
   * Add a main cause at the end of the tree.
   * @agent
   * @returns {number} id of the new cause
   */
  addRow() {
    const row = this.model.addRow(null);
    this._changed();
    return row.id;
  }

  /**
   * Add a sub-cause under a cause; it inherits the category.
   * @agent
   * @param {number} parentId the cause above it
   * @returns {number} id of the new sub-cause
   * @throws {Error} if the parent is unknown
   */
  addSubRow(parentId) {
    requireKnownId('parentId', parentId, this.model.rows.map((r) => r.id));
    this.collapsed[parentId] = false;
    const row = this.model.addRow(parentId);
    this._changed();
    return row.id;
  }

  /** @noagent template handler: adds a main cause and focuses its name */
  addRowAndFocus() { this._focusRow(this.addRow()); }

  /** @noagent template handler @param {number} parentId */
  addSubAndFocus(parentId) { this._focusRow(this.addSubRow(parentId)); }

  /** @param {number} id row id */
  _focusRow(id) {
    this._nextTick(() => {
      const inp = this._container()?.querySelector(`tr[data-id="${id}"] .ishikawa__name-input`);
      if (inp) inp.focus();
    });
  }

  /**
   * Set one field of a cause. Only main causes carry a category.
   * @agent
   * @param {number} rowId the cause
   * @param {keyof RowFields} key which field
   * @param {string} value the new value
   * @returns {void}
   * @throws {Error} if the cause is unknown, `key` is no cause field, the value does not fit it, or a sub-cause gets a category
   */
  setRowField(rowId, key, value) {
    requireKnownId('rowId', rowId, this.model.rows.map((r) => r.id));
    requireEnum('key', key, ROW_KEYS);
    const next = ROW_CHECKS[key](value);
    const row = this.model.rows.find((r) => r.id === rowId);
    if (key === 'category' && row.parentId !== null && next !== '') {
      throw new Error(`row ${rowId} is a sub-cause; it inherits the category of its main cause`);
    }
    row[key] = next;
    this._changed();
  }

  /**
   * Delete a cause and its sub-causes, without asking. Links from experiments go.
   * @agent
   * @param {number} rowId the cause
   * @returns {void}
   * @throws {Error} if the cause is unknown
   */
  deleteRow(rowId) {
    requireKnownId('rowId', rowId, this.model.rows.map((r) => r.id));
    this.model.descIds(rowId).concat(rowId).forEach(x => delete this.collapsed[x]);
    this.model.delRow(rowId);
    this._changed();
  }

  /**
   * @noagent asks first; agents call deleteRow
   * @param {number} id row id
   * @returns {Promise<void>}
   */
  async confirmDeleteRow(id) {
    const row = this.model.rows.find(r => r.id === id);
    if (!row) return;
    const descIds = this.model.descIds(id);
    const label = this.model.dName(row);
    const message = descIds.length > 0
      ? this._t('delRowConfirmWithSubs', { name: label, count: descIds.length })
      : this._t('delRowConfirm', { name: label });
    const confirmed = await this._context.dialog.confirm({
      message,
      title: this._context.i18n.t('common.delete'),
      confirmLabel: this._context.i18n.t('common.delete'),
      danger: true,
    });
    // The row may have gone while the dialog was open (an agent call).
    if (!confirmed || !this.model.rows.some(r => r.id === id)) return;
    this.deleteRow(id);
  }

  /**
   * Copy a cause with its sub-causes and ratings, right after it.
   * @agent
   * @param {number} rowId the cause
   * @returns {void}
   * @throws {Error} if the cause is unknown
   */
  duplicateRow(rowId) {
    requireKnownId('rowId', rowId, this.model.rows.map((r) => r.id));
    this.model.dupeRow(rowId, ` (${this._t('copy')})`);
    this._changed();
  }

  /**
   * Move a cause with its sub-causes before another; it takes that cause's parent.
   * @agent
   * @param {number} rowId the cause to move
   * @param {number} targetRowId the cause it goes before
   * @returns {boolean} false if the target lies inside the moved subtree (nothing moves)
   * @throws {Error} if either cause is unknown
   */
  moveRowBefore(rowId, targetRowId) {
    const ids = this.model.rows.map((r) => r.id);
    requireKnownId('rowId', rowId, ids);
    requireKnownId('targetRowId', targetRowId, ids);
    if (rowId === targetRowId || this.model.descIds(rowId).includes(targetRowId)) return false;
    this.model.moveRowBefore(rowId, targetRowId);
    this._changed();
    return true;
  }

  /** @noagent view only @param {number} id row id */
  toggleRow(id) {
    if (this.collapsed[id]) delete this.collapsed[id];
    else this.collapsed[id] = true;
  }

  /** @noagent view only */
  expandAll() { this.collapsed = {}; }

  /** @noagent view only */
  collapseAll() {
    const next = {};
    this.model.rows.forEach(r => { if (this.model.hasKids(r.id)) next[r.id] = true; });
    this.collapsed = next;
  }

  /**
   * Show only the causes of one category, or all.
   * @agent
   * @param {'all'|'man'|'machine'|'environment'|'material'|'measurement'|'method'} category the filter
   * @returns {void}
   * @throws {Error} if `category` is no filter value
   */
  setFilter(category) {
    requireEnum('category', category, FILTERS);
    this.activeFilter = category;
  }

  // ── Ratings ───────────────────────────────────────────────

  /** @noagent view transform @param {object} row @param {number} expertId @returns {number|string} */
  ratingVal(row, expertId) { return row.ratings[expertId] !== undefined ? row.ratings[expertId] : ''; }

  /** @noagent view transform @param {object} row @param {number} expertId @returns {string} cell style */
  ratingStyle(row, expertId) {
    const v = row.ratings[expertId];
    return (v !== undefined && v !== '') ? ratingBg(v) : '';
  }

  /** @noagent template handler: blocks non-digit keys @param {KeyboardEvent} $event */
  ratingKeydown($event) {
    if (['e', 'E', '+', '-', '.', ','].includes($event.key)) $event.preventDefault();
  }

  /**
   * Rate a cause by one expert, 0 (unlikely) to 9 (very likely).
   * @agent
   * @param {number} rowId the cause
   * @param {number} expertId the expert
   * @param {number|null} value a whole number 0..9; null clears the rating
   * @returns {void}
   * @throws {Error} if the cause or expert is unknown, or the value is no whole number 0..9
   */
  setRating(rowId, expertId, value) {
    requireKnownId('rowId', rowId, this.model.rows.map((r) => r.id));
    requireKnownId('expertId', expertId, this.model.experts.map((e) => e.id));
    const next = value === null ? '' : requireNumber('value', value, { min: 0, max: 9, integer: true });
    this.model.setRating(rowId, expertId, next);
    this.renderPareto();
    this._changed();
  }

  /**
   * Writes what the input typed (clamped by the model) and restyles the cell
   * without rebuilding the table.
   * @noagent template handler; agents call setRating
   * @param {number} rowId
   * @param {number} expertId
   * @param {Event} $event change event of the rating input
   */
  ratingChanged(rowId, expertId, $event) {
    this.model.setRating(rowId, expertId, $event.target.value);
    const r = this.model.rows.find(x => x.id === rowId);
    const val = r && r.ratings[expertId] !== undefined ? r.ratings[expertId] : '';
    $event.target.value = val;
    $event.target.style.cssText = val !== '' ? ratingBg(val) : '';
    this.renderPareto();
    this._changed();
  }

  // ── Score cell view helpers ───────────────────────────────

  /** @noagent view transform @param {number} score @returns {string} */
  scoreCls(score) {
    return score >= 6 ? 'ishikawa__score-high' : score >= 3 ? 'ishikawa__score-mid' : 'ishikawa__score-low';
  }

  /** @noagent view transform @param {number} score @returns {string} */
  scoreBarStyle(score) {
    const pct = score / 9 * 100;
    const barCol = score >= 6 ? '#dc2626' : score >= 3 ? '#d97706' : '#16a34a';
    return `width:${pct}%;background:${barCol}`;
  }

  /** @noagent view transform @param {{delta: number}} chg @returns {string} */
  deltaCls(chg) { return chg.delta > 0 ? 'ishikawa__delta-up' : 'ishikawa__delta-down'; }

  /** @noagent view transform @param {{delta: number}} chg @returns {string} */
  deltaText(chg) { return (chg.delta > 0 ? '+' : '') + chg.delta.toFixed(1); }

  /** @noagent view transform @param {string} status @returns {string} */
  statusCss(status) { return STATUS_CSS[status] || ''; }

  // ── Linked experiments (row) ──────────────────────────────

  /** @noagent view transform @param {object} row @returns {number} experiments checking this cause */
  linkedExpCount(row) {
    return this.model.experiments.reduce(
      (acc, x) => acc + (Array.isArray(x.hypothesisIds) && x.hypothesisIds.includes(row.stableId) ? 1 : 0), 0);
  }

  /** @noagent view transform @param {object} row @returns {string} */
  linkExpTitle(row) {
    const c = this.linkedExpCount(row);
    return c > 0 ? this._t('linkedExperimentsTooltip', { count: c }) : this._t('linkExperimentsTitle');
  }

  // ── Summary ───────────────────────────────────────────────

  /** @noagent view transform @returns {string} "(2 main · 3 sub)" */
  summaryBreakdown() {
    const total = this.model.rows.length;
    const roots = this.model.rows.filter(r => r.parentId === null).length;
    return `(${roots} ${this._t('main')} · ${total - roots} ${this._t('sub')})`;
  }

  /** @noagent view transform @returns {string} the highest score or '–' */
  topScore() {
    const scored = this.model.rows
      .map(r => this.model.calcScore(r))
      .filter(s => s !== null)
      .sort((a, b) => b - a);
    return scored.length ? scored[0].toFixed(1) : '–';
  }

  /** @noagent view transform @returns {number} */
  confirmedCount() { return this.model.rows.filter(r => r.status === 'confirmed').length; }

  // ── Category names ────────────────────────────────────────

  /** @param {Object<string, string>} next own names @returns {boolean} two categories would show the same name */
  _duplicateLabel(next) {
    const seen = new Set();
    for (const c of CATS) {
      const eff = (next[c.key] || this._t(`cat.${c.key}`)).toLowerCase();
      if (seen.has(eff)) return true;
      seen.add(eff);
    }
    return false;
  }

  /**
   * Give the six categories own names. Categories not named keep theirs.
   * @agent
   * @param {Object<string, string>} labels new name per category key (man, machine, environment, material, measurement, method); "" restores the default name
   * @returns {void}
   * @throws {Error} if a key is no category, a name is no string, or two categories would show the same name
   */
  setCategoryLabels(labels) {
    if (!labels || typeof labels !== 'object' || Array.isArray(labels)) {
      throw new Error(`invalid labels ${JSON.stringify(labels)}; allowed: an object with category keys`);
    }
    const next = { ...this.model.catLabels };
    for (const [key, name] of Object.entries(labels)) {
      requireEnum('key', key, CATEGORY_KEYS);
      next[key] = requireText('name', name).trim();
    }
    if (this._duplicateLabel(next)) throw new Error('two categories would show the same name');
    this.model.catLabels = next;
  }

  /** @noagent form; agents call setCategoryLabels */
  openCatRename() {
    this.catRenameDraft = CATS.map(c => ({
      key: c.key,
      color: c.color,
      def: this._t(`cat.${c.key}`),
      name: (this.model.catLabels && this.model.catLabels[c.key]) || '',
    }));
    this._context.dialog.form({
      title: this._t('renameCatsTitle'),
      content: this._ref('catRenameForm'),
      confirmLabel: this._context.i18n.t('common.save'),
      onConfirm: () => {
        const next = {};
        this.catRenameDraft.forEach(c => { next[c.key] = (c.name || '').trim(); });
        if (this._duplicateLabel(next)) { this._context.notify(this._t('renameCatsDuplicate')); return false; }
        this.setCategoryLabels(next);
      },
    });
  }

  // ── CSV export ────────────────────────────────────────────

  /**
   * Download problem statement, cause tree with ratings and facts as CSV.
   * @agent
   * @returns {string} the CSV text, as downloaded
   */
  exportCSV() {
    const csv = causesCsv(this.model, this._t);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'ishikawa-6m-export.csv';
    a.click();
    URL.revokeObjectURL(url);
    this._context.notify(this._t('exportedCSV'));
    return csv;
  }

  // ── Pareto chart (chartManager) ───────────────────────────

  /**
   * Show the current ratings or those of a snapshot in the Pareto chart.
   * @agent
   * @param {?number} snapshotId a snapshot; null shows the current state
   * @returns {void}
   * @throws {Error} if the snapshot is unknown
   */
  setParetoSource(snapshotId) {
    if (snapshotId !== null) requireKnownId('snapshotId', snapshotId, this.model.snapshots.map((s) => s.id));
    this.paretoSource = snapshotId === null ? 'current' : `snap-${snapshotId}`;
    this.renderPareto();
  }

  _destroyPareto() {
    if (this._paretoChart) {
      try { this._context.chartManager.destroy(this._paretoChart); } catch { /* ignore */ }
      this._paretoChart = null;
    }
  }

  /**
   * @noagent chart
   * @returns {Promise<void>}
   */
  async renderPareto() {
    const root = this._container();
    const container = root && root.querySelector('[data-ref="paretoContent"]');
    if (!container) return;
    this._destroyPareto();
    const data = this.model.paretoData(this.paretoSource);
    if (!data.length) {
      container.replaceChildren();
      this.paretoEmptyMsg = this._t('paretoNoData');
      return;
    }
    this.paretoEmptyMsg = '';
    const items = data.map(d => {
      const catObj = CATS.find(c => c.key === d.cat);
      return { name: d.name, value: d.avg, color: catObj ? catObj.color : undefined };
    });
    container.replaceChildren();
    const gen = ++this._paretoGen;
    const chart = await this._context.chartManager.create(container, 'pareto', {
      items,
      otherBucket: true,
      title: this._t('paretoTitle'),
      yLabel: this._t('paretoYAxisLabel'),
      rightYLabel: this._t('paretoCumLabel'),
      showXTicks: false,
      onEditorToggle: (open) => {
        const panel = root.querySelector('[data-ref="paretoEditorPanel"]');
        const body = root.querySelector('.ishikawa__pareto-body');
        if (panel) panel.classList.toggle('open', open);
        if (body) body.classList.toggle('ishikawa__pareto-body--editor-open', open);
        if (open) this._buildParetoEditor();
        setTimeout(() => { if (this._paretoChart) this._paretoChart.render(); }, 340);
      },
    });
    if (gen !== this._paretoGen) { this._context.chartManager.destroy(chart); return; }
    this._paretoChart = chart;
  }

  _buildParetoEditor() {
    const inner = this._container()?.querySelector('[data-ref="paretoEditorInner"]');
    if (!inner || !this._paretoChart) return;
    inner.replaceChildren();
    const chart = this._paretoChart;
    const cfg = chart.config;
    const te = (k) => this._context.i18n.t(`chart.editor.${k}`);
    const rerender = () => chart.render();
    import('../../../core/chart/chart-editor.js').then(({
      edTitleSection, edFontSizeSection, edCheckboxRow, edSection,
      edRangeRow, edSelectRow, edColorPair, openColorPicker,
    }) => {
      const cpOpen = (e, color, cb) => {
        if (this._activeColorPicker) this._activeColorPicker.close();
        this._activeColorPicker = openColorPicker(e, color, cb);
      };
      const DASH_OPTS = [
        { value: 'solid', label: 'Solid' }, { value: 'dash', label: 'Dash' },
        { value: 'dot', label: 'Dot' }, { value: 'dashdot', label: 'Dash-Dot' },
        { value: 'longdash', label: 'Long Dash' },
      ];
      const MARKER_OPTS = [
        { value: 'circle', label: '● Circle' }, { value: 'square', label: '■ Square' },
        { value: 'diamond', label: '◆ Diamond' }, { value: 'triangle', label: '▲ Triangle' },
        { value: 'triangle-down', label: '▼ Triangle ▼' }, { value: 'cross', label: '✚ Cross' },
        { value: 'star', label: '★ Star' },
      ];
      inner.appendChild(edTitleSection(cfg, rerender, te));
      inner.appendChild(edFontSizeSection(cfg, rerender, te));
      const axSec = edSection(this._t('paretoAxes'));
      axSec.appendChild(edCheckboxRow(te('showYLabel'), cfg.showYLabel !== false, (v) => { cfg.showYLabel = v; rerender(); }));
      axSec.appendChild(edCheckboxRow(te('showYTicks'), cfg.showYTicks !== false, (v) => { cfg.showYTicks = v; rerender(); }));
      inner.appendChild(axSec);
      const PATTERN_OPTS = [
        { value: '', label: this._t('paretoPatNone') }, { value: '/', label: `/ ${  this._t('paretoPatDiag')}` },
        { value: '\\', label: `\\ ${  this._t('paretoPatDiagR')}` }, { value: '-', label: `— ${  this._t('paretoPatHoriz')}` },
        { value: '|', label: `| ${  this._t('paretoPatVert')}` }, { value: 'x', label: `× ${  this._t('paretoPatCross')}` },
        { value: '+', label: `+ ${  this._t('paretoPatPlus')}` }, { value: '.', label: `· ${  this._t('paretoPatDots')}` },
      ];
      const barSec = edSection(this._t('paretoBars'));
      barSec.appendChild(edRangeRow(this._t('paretoBarOpacity'), Math.round((cfg.barOpacity ?? 0.75) * 100), (v) => { cfg.barOpacity = v / 100; rerender(); }, 10, 100, 5));
      (cfg.items || []).forEach((d) => {
        const barItem = document.createElement('div');
        barItem.className = 'dmike-chart-ed-ref-item';
        const header = document.createElement('div');
        header.className = 'dmike-chart-ed-ref-header';
        const colorBar = document.createElement('div');
        colorBar.className = 'dmike-chart-ed-ref-color';
        colorBar.style.background = d.color || 'var(--color-chart-1)';
        const info = document.createElement('div');
        info.className = 'dmike-chart-ed-ref-info';
        const label = d.name.length > 20 ? `${d.name.substring(0, 18)  }…` : d.name;
        info.replaceChildren(
          h('div', { class: 'name' }, label),
          h('div', { class: 'detail' }, d.value.toFixed(1)));
        header.appendChild(colorBar);
        header.appendChild(info);
        barItem.appendChild(header);
        const detail = document.createElement('div');
        detail.className = 'dmike-chart-ed-inline-editor open';
        const { el: cEl, swatch: cSw } = edColorPair(te('color'), d.color || 'rgba(100,100,100,1)', (ev) => {
          cpOpen(ev, d.color || 'rgba(100,100,100,1)', (c) => { d.color = c; cSw.style.background = c; colorBar.style.background = c; rerender(); });
        });
        detail.appendChild(cEl);
        detail.appendChild(edSelectRow(this._t('paretoPattern'), PATTERN_OPTS, d.pattern || '', (v) => { d.pattern = v; rerender(); }));
        barItem.appendChild(detail);
        barSec.appendChild(barItem);
      });
      inner.appendChild(barSec);
      const refSec = edSection(this._t('paretoRefLine'));
      refSec.appendChild(edRangeRow(this._t('paretoRefValue'), cfg.refLineValue ?? 80, (v) => { cfg.refLineValue = v; rerender(); }, 0, 100, 5));
      refSec.appendChild(edSelectRow(te('lineStyle'), DASH_OPTS, cfg.refLineDash || 'dash', (v) => { cfg.refLineDash = v; rerender(); }));
      refSec.appendChild(edRangeRow(this._t('paretoRefWidth'), cfg.refLineWidth ?? 1, (v) => { cfg.refLineWidth = v; rerender(); }, 0.5, 5, 0.5));
      const { el: refColorEl, swatch: refSw } = edColorPair(te('color'), cfg.refLineColor || '#ef4444', (e) => {
        cpOpen(e, cfg.refLineColor || '#ef4444', (c) => { cfg.refLineColor = c; refSw.style.background = c; rerender(); });
      });
      refSec.appendChild(refColorEl);
      inner.appendChild(refSec);
      const lineSec = edSection(this._t('paretoCumLine'));
      lineSec.appendChild(edSelectRow(te('lineStyle'), DASH_OPTS, cfg.cumDash || 'solid', (v) => { cfg.cumDash = v; rerender(); }));
      lineSec.appendChild(edRangeRow(this._t('paretoCumWidth'), cfg.cumWidth ?? 2, (v) => { cfg.cumWidth = v; rerender(); }, 0.5, 6, 0.5));
      const { el: cumColorEl, swatch: cumSw } = edColorPair(te('color'), cfg.cumulativeColor || '#ef4444', (e) => {
        cpOpen(e, cfg.cumulativeColor || '#ef4444', (c) => { cfg.cumulativeColor = c; cumSw.style.background = c; rerender(); });
      });
      lineSec.appendChild(cumColorEl);
      inner.appendChild(lineSec);
      const dotSec = edSection(this._t('paretoCumDots'));
      dotSec.appendChild(edSelectRow(this._t('paretoDotSymbol'), MARKER_OPTS, cfg.cumDotSymbol || 'circle', (v) => { cfg.cumDotSymbol = v; rerender(); }));
      dotSec.appendChild(edRangeRow(this._t('paretoDotSize'), cfg.cumDotSize ?? 3.5, (v) => { cfg.cumDotSize = v; rerender(); }, 1, 10, 0.5));
      const { el: dotFillEl, swatch: dotFillSw } = edColorPair(this._t('paretoDotFill'), cfg.cumDotFill || '#ef4444', (e) => {
        cpOpen(e, cfg.cumDotFill || '#ef4444', (c) => { cfg.cumDotFill = c; dotFillSw.style.background = c; rerender(); });
      });
      dotSec.appendChild(dotFillEl);
      const { el: dotStrokeEl, swatch: dotStrokeSw } = edColorPair(this._t('paretoDotStroke'), cfg.cumDotStroke || '#ffffff', (e) => {
        cpOpen(e, cfg.cumDotStroke || '#ffffff', (c) => { cfg.cumDotStroke = c; dotStrokeSw.style.background = c; rerender(); });
      });
      dotSec.appendChild(dotStrokeEl);
      dotSec.appendChild(edRangeRow(this._t('paretoDotStrokeWidth'), cfg.cumDotStrokeWidth ?? 1.5, (v) => { cfg.cumDotStrokeWidth = v; rerender(); }, 0, 5, 0.5));
      inner.appendChild(dotSec);
    });
  }
}
