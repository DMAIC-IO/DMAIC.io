/**
 * DMAIC.io — Makigami Model (makigami-model.js)
 *
 * Pure state + business logic for the Makigami swim-lane process analysis:
 * roles, steps (with participation, durations, waste markers, notes), the
 * configurable Muda categories and time units, plus KPI computation.
 *
 * No DOM, no i18n, no CSS — view concerns live in the data-fn (makigami.js).
 * The free-text duration parser lives in the pure helper makigami-duration.js.
 */

import { parseDuration } from './makigami-duration.js';

/**
 * Default Muda categories (TIMWOODS+S). Each carries an i18n `labelKey` and an
 * optional user-override `label`; the view prefers `label` when set.
 * @returns {Array<{id:string,code:string,labelKey?:string,label:string,color:string}>}
 */
export function createDefaultMudaCategories() {
  return [
    { id: 'muda-transport',      code: 'T',  labelKey: 'muda.transport',      label: '', color: '#4a90e2' },
    { id: 'muda-inventory',      code: 'I',  labelKey: 'muda.inventory',      label: '', color: '#f5a623' },
    { id: 'muda-motion',         code: 'M',  labelKey: 'muda.motion',         label: '', color: '#9b59b6' },
    { id: 'muda-waiting',        code: 'W',  labelKey: 'muda.waiting',        label: '', color: '#d0021b' },
    { id: 'muda-overproduction', code: 'O',  labelKey: 'muda.overproduction', label: '', color: '#50e3c2' },
    { id: 'muda-overprocessing', code: 'O+', labelKey: 'muda.overprocessing', label: '', color: '#f8a01c' },
    { id: 'muda-defects',        code: 'D',  labelKey: 'muda.defects',        label: '', color: '#bd10e0' },
    { id: 'muda-skills',         code: 'S',  labelKey: 'muda.skills',         label: '', color: '#7ed321' },
  ];
}

/**
 * Default time units. `factorSeconds` controls conversion in the free-text parser.
 * Workday convention: 1 d = 8 h = 28800 s (office Makigami).
 * @returns {Array<{id:string,label:string,factorSeconds:number}>}
 */
export function createDefaultTimeUnits() {
  return [
    { id: 'unit-s',   label: 's',   factorSeconds: 1     },
    { id: 'unit-min', label: 'min', factorSeconds: 60    },
    { id: 'unit-h',   label: 'h',   factorSeconds: 3600  },
    { id: 'unit-d',   label: 'd',   factorSeconds: 28800 },
  ];
}

/** Generate a short unique id with a prefix. */
export function uid(prefix) {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

export class State {
  /** @type {string} */
  title = '';
  /** @type {Array<{id:string,label:string}>} */
  roles = [];
  /** @type {Array<{id:string,title:string,description:string,roleIds:string[],processTime:string,waitTime:string,mudaIds:string[],notes:string,expanded:boolean}>} */
  steps = [];
  /** @type {Array<{id:string,code:string,labelKey?:string,label:string,color:string}>} */
  mudaCategories = createDefaultMudaCategories();
  /** @type {Array<{id:string,label:string,factorSeconds:number}>} */
  timeUnits = createDefaultTimeUnits();
  /** @type {boolean} */
  settingsOpen = false;

  // ─── Roles & steps ─────────────────────────────────────────

  addRole() {
    this.roles.push({ id: uid('r-'), label: '' });
  }

  addStep() {
    this.steps.push({
      id: uid('s-'),
      title: '',
      description: '',
      roleIds: [],
      processTime: '',
      waitTime: '',
      mudaIds: [],
      notes: '',
      expanded: true,
    });
  }

  /** @param {string} stepId @param {string} roleId */
  toggleParticipation(stepId, roleId) {
    const step = this.steps.find(s => s.id === stepId);
    if (!step) return;
    if (step.roleIds.includes(roleId)) {
      step.roleIds = step.roleIds.filter(id => id !== roleId);
    } else {
      step.roleIds.push(roleId);
    }
  }

  /** @param {string} stepId @param {string} mudaId */
  toggleMuda(stepId, mudaId) {
    const step = this.steps.find(s => s.id === stepId);
    if (!step) return;
    if (step.mudaIds.includes(mudaId)) {
      step.mudaIds = step.mudaIds.filter(id => id !== mudaId);
    } else {
      step.mudaIds.push(mudaId);
    }
  }

  /** @param {string} stepId */
  toggleStepExpanded(stepId) {
    const step = this.steps.find(s => s.id === stepId);
    if (!step) return;
    step.expanded = step.expanded === false;
  }

  /** @param {string} stepId */
  deleteStep(stepId) {
    const idx = this.steps.findIndex(s => s.id === stepId);
    if (idx < 0) return;
    this.steps.splice(idx, 1);
  }

  /** @param {string} roleId */
  deleteRole(roleId) {
    this.roles = this.roles.filter(r => r.id !== roleId);
    this.steps.forEach(s => {
      s.roleIds = s.roleIds.filter(id => id !== roleId);
    });
  }

  /**
   * Move the dragged step to sit before the target step.
   * @param {string} draggedId @param {string} targetId
   */
  reorderSteps(draggedId, targetId) {
    if (draggedId === targetId) return;
    const from = this.steps.findIndex(s => s.id === draggedId);
    const to   = this.steps.findIndex(s => s.id === targetId);
    if (from < 0 || to < 0) return;
    const [moved] = this.steps.splice(from, 1);
    const newTo = this.steps.findIndex(s => s.id === targetId);
    this.steps.splice(newTo, 0, moved);
  }

  /**
   * Move the dragged role to sit before the target role.
   * @param {string} draggedId @param {string} targetId
   */
  reorderRoles(draggedId, targetId) {
    if (draggedId === targetId) return;
    const from = this.roles.findIndex(r => r.id === draggedId);
    const to   = this.roles.findIndex(r => r.id === targetId);
    if (from < 0 || to < 0) return;
    const [moved] = this.roles.splice(from, 1);
    const newTo = this.roles.findIndex(r => r.id === targetId);
    this.roles.splice(newTo, 0, moved);
  }

  // ─── Settings: muda categories & time units ────────────────

  addMudaCategory() {
    this.mudaCategories.push({
      id: uid('muda-'),
      code: '',
      label: '',
      color: '#888888',
    });
  }

  addTimeUnit() {
    this.timeUnits.push({
      id: uid('unit-'),
      label: '',
      factorSeconds: 1,
    });
  }

  /** @param {string} mudaId */
  deleteMudaCategory(mudaId) {
    const idx = this.mudaCategories.findIndex(m => m.id === mudaId);
    if (idx < 0) return;
    this.mudaCategories.splice(idx, 1);
    this.steps.forEach(s => {
      s.mudaIds = s.mudaIds.filter(id => id !== mudaId);
    });
  }

  /** @param {string} unitId */
  deleteTimeUnit(unitId) {
    const idx = this.timeUnits.findIndex(u => u.id === unitId);
    if (idx < 0) return;
    this.timeUnits.splice(idx, 1);
  }

  /** Restore the default Muda categories and time units; drop stale muda refs. */
  resetSettings() {
    this.mudaCategories = createDefaultMudaCategories();
    this.timeUnits = createDefaultTimeUnits();
    const validIds = new Set(this.mudaCategories.map(m => m.id));
    this.steps.forEach(s => {
      s.mudaIds = s.mudaIds.filter(id => validIds.has(id));
    });
  }

  // ─── KPI ───────────────────────────────────────────────────

  /**
   * Sum processing and waiting seconds across steps (invalid durations skipped),
   * compute lead time and process-cycle efficiency.
   * @returns {{process:number,wait:number,lead:number,pce:(number|null)}}
   */
  computeKPI() {
    let process = 0;
    let wait = 0;
    for (const s of this.steps) {
      const p = parseDuration(s.processTime, this.timeUnits);
      if (p.valid) process += p.seconds;
      const w = parseDuration(s.waitTime, this.timeUnits);
      if (w.valid) wait += w.seconds;
    }
    const lead = process + wait;
    const pce = lead > 0 ? process / lead : null;
    return { process, wait, lead, pce };
  }

  // ─── loadExample guard ─────────────────────────────────────

  hasContent() {
    return this.roles.length > 0 || this.steps.length > 0;
  }

  // ─── Serialization ─────────────────────────────────────────

  toJSON() {
    return {
      title: this.title,
      roles: this.roles.map(r => ({ id: r.id, label: r.label })),
      steps: this.steps.map(s => ({
        id: s.id,
        title: s.title,
        description: s.description,
        roleIds: [...s.roleIds],
        processTime: s.processTime,
        waitTime: s.waitTime,
        mudaIds: [...s.mudaIds],
        notes: s.notes,
        expanded: s.expanded,
      })),
      mudaCategories: this.mudaCategories.map(m => {
        const out = { id: m.id, code: m.code, label: m.label, color: m.color };
        if (m.labelKey) out.labelKey = m.labelKey;
        return out;
      }),
      timeUnits: this.timeUnits.map(u => ({ id: u.id, label: u.label, factorSeconds: u.factorSeconds })),
      settingsOpen: this.settingsOpen,
    };
  }

  /**
   * Deserialize and validate; always returns a valid default-backed State,
   * even for null/undefined/malformed input.
   * @param {*} d
   * @returns {State}
   */
  static fromJSON(d) {
    const s = new State();
    if (!d || typeof d !== 'object') return s;

    if (typeof d.title === 'string') s.title = d.title;

    if (Array.isArray(d.roles)) {
      s.roles = d.roles
        .filter(r => r && typeof r.id === 'string')
        .map(r => ({ id: r.id, label: String(r.label || '') }));
    }

    if (Array.isArray(d.steps)) {
      s.steps = d.steps
        .filter(st => st && typeof st.id === 'string')
        .map(st => ({
          id: st.id,
          title: String(st.title || ''),
          description: String(st.description || ''),
          roleIds: Array.isArray(st.roleIds) ? st.roleIds.filter(x => typeof x === 'string') : [],
          processTime: String(st.processTime || ''),
          waitTime: String(st.waitTime || ''),
          mudaIds: Array.isArray(st.mudaIds) ? st.mudaIds.filter(x => typeof x === 'string') : [],
          notes: String(st.notes || ''),
          expanded: typeof st.expanded === 'boolean' ? st.expanded : true,
        }));
    }

    if (Array.isArray(d.mudaCategories) && d.mudaCategories.length > 0) {
      s.mudaCategories = d.mudaCategories.map(m => {
        const cat = {
          id: String(m.id || uid('muda-')),
          code: String(m.code || ''),
          label: String(m.label || ''),
          color: String(m.color || '#888888'),
        };
        if (m.labelKey) cat.labelKey = String(m.labelKey);
        return cat;
      });
    }

    if (Array.isArray(d.timeUnits) && d.timeUnits.length > 0) {
      const units = d.timeUnits
        .filter(u => u && Number.isFinite(Number(u.factorSeconds)) && Number(u.factorSeconds) > 0)
        .map(u => ({
          id: String(u.id || uid('unit-')),
          label: String(u.label || ''),
          factorSeconds: Number(u.factorSeconds),
        }));
      if (units.length > 0) s.timeUnits = units;
    }

    if (typeof d.settingsOpen === 'boolean') s.settingsOpen = d.settingsOpen;

    return s;
  }
}
