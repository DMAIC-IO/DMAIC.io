/**
 * D.Mike — Makigami: Model.
 *
 * Rollen (Zeilen der Matrix) und Prozessschritte (Spalten) mit eigener id; je
 * Schritt die mitwirkenden Rollen, die Bearbeitungs- und Wartezeit als
 * Dauertext und die Verschwendungsarten. Der Katalog der Arten und die
 * Zeiteinheiten, in denen Dauertexte gelesen werden, sind Inhalt und nie
 * leer. Kennzahlen und unlesbare Dauertexte sind abgeleitet. Ohne DOM, ohne
 * i18n.
 *
 * Gespeichert: `{ _schema, title, roles, steps, mudaCategories, timeUnits,
 * collapsed, settingsOpen }`. Dass ids eindeutig sind, Arten und Einheiten
 * nicht fehlen und zugeklappte Karten zu vorhandenen Schritten gehören,
 * sichern die Invarianten — beim Laden repariert, beim Schreiben abgelehnt.
 * `moveStep.to` und `moveRole.to` sind ENDINDIZES.
 */
import {
  defineModel, command, list, object, text, number, boolean, oneOf, idOf, index,
} from '../../../core/model.js';
import { requireForm } from '../../../core/validate.js';
import { uid } from '../../../core/uid.js';
import { from0 } from './migrations.js';
import { analyze } from './kpi.js';
import { canonicalize, parseDuration } from './duration.js';
import { createDefaultMudaCategories, createDefaultTimeUnits } from './defaults.js';

export { MUDA_LABEL_KEYS } from './defaults.js';

/** @typedef {import('./kpi.js').MakigamiKpi} MakigamiKpi */
/** @typedef {import('./kpi.js').TimeIssue} TimeIssue */

/**
 * True, wenn jede id nur einmal vorkommt.
 * @param {ReadonlyArray<{ id: string }>} items @returns {boolean}
 */
function uniqueIds(items) {
  return new Set(items.map((x) => x.id)).size === items.length;
}

/**
 * Die Liste ohne spätere Doppel einer id.
 * @template {{ id: string }} T
 * @param {T[]} items @returns {T[]}
 */
function dropDuplicates(items) {
  const seen = new Set();
  return items.filter((x) => {
    if (seen.has(x.id)) return false;
    seen.add(x.id);
    return true;
  });
}

/**
 * Lehnt das Entfernen des letzten Eintrags einer Liste ab.
 * @param {string} param @param {string} id @param {number} length @param {string} hintKey
 * @throws {Error} mit `param` und dem Hinweis `hintKey` für die Oberfläche
 */
function requireNotLast(param, id, length, hintKey) {
  try {
    requireForm(param, id, length > 1, 'any but the last remaining one');
  } catch (err) {
    throw Object.assign(/** @type {Error} */ (err), { hintKey });
  }
}

/**
 * Der Schritt zu einer id; `idOf` hat sie schon geprüft.
 * @param {{ steps: Array<{ id: string }> }} m @param {string} id @returns {any}
 */
const stepOf = (m, id) => m.steps.find((s) => s.id === id);

/**
 * Setzt einen Dauertext und meldet, ob er lesbar ist.
 * @param {any} m @param {string} stepId @param {'processTime'|'waitTime'} field @param {string} value
 * @returns {boolean}
 */
function setTime(m, stepId, field, value) {
  stepOf(m, stepId)[field] = value;
  return parseDuration(value, m.timeUnits).valid;
}

/**
 * Nimmt `id` in die Liste auf oder heraus, ohne Doppel; die Reihenfolge der
 * übrigen bleibt.
 * @param {string[]} ids @param {string} id @param {boolean} on @returns {string[]}
 */
function withId(ids, id, on) {
  const has = ids.includes(id);
  if (on && !has) return [...ids, id];
  if (!on && has) return ids.filter((x) => x !== id);
  return ids;
}

/**
 * Verschiebt das Element mit `id` an den Endindex `to`.
 * @param {Array<{ id: string }>} items @param {string} id @param {number} to
 */
function moveTo(items, id, to) {
  const from = items.findIndex((x) => x.id === id);
  if (from === to) return;
  const [moved] = items.splice(from, 1);
  items.splice(to, 0, moved);
}

export const State = defineModel({
  version: '1.0',
  migrations: { '0→1.0': from0 },
  fields: {
    /** der Name des betrachteten Prozesses */
    title: text(),
    /** die beteiligten Rollen (Zeilen der Matrix) in Anzeigereihenfolge, je mit id und Namen */
    roles: list(object({ id: text({ nonEmpty: true }), label: text() })),
    /**
     * die Prozessschritte (Spalten der Matrix) in Ablaufreihenfolge, je mit id, Titel, Tätigkeit,
     * mitwirkenden Rollen, Bearbeitungs- und Wartezeit als Dauertext, Verschwendungsarten und Notiz
     */
    steps: list(object({
      id: text({ nonEmpty: true }),
      title: text(),
      description: text(),
      roleIds: list(idOf('roles')),
      processTime: text(),
      waitTime: text(),
      mudaIds: list(idOf('mudaCategories')),
      notes: text(),
    }), { bulk: true }),
    /** die Verschwendungsarten, auf die ein Schritt zeigen kann; vorbelegt mit TIMWOODS+S, nie leer */
    mudaCategories: list(object({
      id: text({ nonEmpty: true }),
      code: text(),
      labelKey: oneOf([
        'muda.transport', 'muda.inventory', 'muda.motion', 'muda.waiting',
        'muda.overproduction', 'muda.overprocessing', 'muda.defects', 'muda.skills',
      ], { optional: true }),
      label: text(),
      color: text(),
    }), {
      default: [
        { id: 'muda-transport', code: 'T', labelKey: 'muda.transport', label: '', color: '#4a90e2' },
        { id: 'muda-inventory', code: 'I', labelKey: 'muda.inventory', label: '', color: '#f5a623' },
        { id: 'muda-motion', code: 'M', labelKey: 'muda.motion', label: '', color: '#9b59b6' },
        { id: 'muda-waiting', code: 'W', labelKey: 'muda.waiting', label: '', color: '#d0021b' },
        { id: 'muda-overproduction', code: 'O', labelKey: 'muda.overproduction', label: '', color: '#50e3c2' },
        { id: 'muda-overprocessing', code: 'O+', labelKey: 'muda.overprocessing', label: '', color: '#f8a01c' },
        { id: 'muda-defects', code: 'D', labelKey: 'muda.defects', label: '', color: '#bd10e0' },
        { id: 'muda-skills', code: 'S', labelKey: 'muda.skills', label: '', color: '#7ed321' },
      ],
    }),
    /** die Zeiteinheiten, in denen Dauertexte gelesen werden; nie leer */
    timeUnits: list(object({
      id: text({ nonEmpty: true }),
      label: text(),
      factorSeconds: number({ exclusiveMin: 0 }),
    }), {
      default: [
        { id: 'unit-s', label: 's', factorSeconds: 1 },
        { id: 'unit-min', label: 'min', factorSeconds: 60 },
        { id: 'unit-h', label: 'h', factorSeconds: 3600 },
        { id: 'unit-d', label: 'd', factorSeconds: 28800 },
      ],
    }),
  },
  view: {
    /** die ids der zugeklappten Schrittkarten */
    collapsed: list(text()),
    /** ob der Einstellungsbereich offen steht */
    settingsOpen: boolean(),
  },
  invariants: {
    uniqueIds: {
      fields: ['roles', 'steps', 'mudaCategories', 'timeUnits'],
      test(m) {
        return uniqueIds(m.roles) && uniqueIds(m.steps) && uniqueIds(m.mudaCategories) && uniqueIds(m.timeUnits);
      },
      repair(m) {
        for (const f of ['roles', 'steps', 'mudaCategories', 'timeUnits']) m._v[f] = dropDuplicates(m._v[f]);
      },
    },
    mudaNotEmpty: {
      fields: ['mudaCategories'],
      test(m) { return m.mudaCategories.length > 0; },
      repair(m) { m._v.mudaCategories = createDefaultMudaCategories(); },
    },
    unitsNotEmpty: {
      fields: ['timeUnits'],
      test(m) { return m.timeUnits.length > 0; },
      repair(m) { m._v.timeUnits = createDefaultTimeUnits(); },
    },
    knownRefs: {
      fields: ['steps', 'roles', 'mudaCategories'],
      test(m) {
        const roles = new Set(m.roles.map((/** @type {{ id: string }} */ r) => r.id));
        const cats = new Set(m.mudaCategories.map((/** @type {{ id: string }} */ c) => c.id));
        return m.steps.every((/** @type {{ roleIds: string[], mudaIds: string[] }} */ s) => (
          s.roleIds.every((id) => roles.has(id)) && s.mudaIds.every((id) => cats.has(id))));
      },
      repair(m) {
        const roles = new Set(m._v.roles.map((/** @type {{ id: string }} */ r) => r.id));
        const cats = new Set(m._v.mudaCategories.map((/** @type {{ id: string }} */ c) => c.id));
        m._v.steps = m._v.steps.map((/** @type {{ roleIds: string[], mudaIds: string[] }} */ s) => ({
          ...s, roleIds: s.roleIds.filter((id) => roles.has(id)), mudaIds: s.mudaIds.filter((id) => cats.has(id)),
        }));
      },
    },
    knownCollapsed: {
      fields: ['collapsed'],
      test(m) {
        const ids = new Set(m.steps.map((/** @type {{ id: string }} */ s) => s.id));
        return m.collapsed.every((/** @type {string} */ id) => ids.has(id));
      },
      repair(m) {
        const ids = new Set(m._v.steps.map((/** @type {{ id: string }} */ s) => s.id));
        m._v.collapsed = m._v.collapsed.filter((/** @type {string} */ id) => ids.has(id));
      },
    },
  },
  commands: {
    addRole: command({
      returns: text(),
      run() {
        const id = `r-${uid()}`;
        this.roles.push({ id, label: '' });
        return id;
      },
    }),
    addStep: command({
      returns: text(),
      run() {
        const id = `s-${uid()}`;
        this.steps.push({
          id, title: '', description: '', roleIds: [], processTime: '', waitTime: '', mudaIds: [], notes: '',
        });
        return id;
      },
    }),
    addMudaCategory: command({
      returns: text(),
      run() {
        const id = `muda-${uid()}`;
        this.mudaCategories.push({ id, code: '', label: '', color: '#888888' });
        return id;
      },
    }),
    addTimeUnit: command({
      returns: text(),
      run() {
        const id = `unit-${uid()}`;
        this.timeUnits.push({ id, label: '', factorSeconds: 1 });
        return id;
      },
    }),
    setParticipation: command({
      params: { stepId: idOf('steps'), roleId: idOf('roles'), participates: boolean() },
      run({ stepId, roleId, participates }) {
        const step = stepOf(this, stepId);
        step.roleIds = withId(step.roleIds, roleId, participates);
      },
    }),
    setMuda: command({
      params: { stepId: idOf('steps'), mudaId: idOf('mudaCategories'), marked: boolean() },
      run({ stepId, mudaId, marked }) {
        const step = stepOf(this, stepId);
        step.mudaIds = withId(step.mudaIds, mudaId, marked);
      },
    }),
    setRoleLabel: command({
      params: { roleId: idOf('roles'), label: text() },
      run({ roleId, label }) {
        this.roles.find((r) => r.id === roleId).label = label;
      },
    }),
    setStepTitle: command({
      params: { stepId: idOf('steps'), text: text() },
      run({ stepId, text: value }) { stepOf(this, stepId).title = value; },
    }),
    setStepDescription: command({
      params: { stepId: idOf('steps'), text: text() },
      run({ stepId, text: value }) { stepOf(this, stepId).description = value; },
    }),
    setStepNotes: command({
      params: { stepId: idOf('steps'), text: text() },
      run({ stepId, text: value }) { stepOf(this, stepId).notes = value; },
    }),
    setStepProcessTime: command({
      params: { stepId: idOf('steps'), text: text() },
      returns: boolean(),
      run({ stepId, text: value }) { return setTime(this, stepId, 'processTime', value); },
    }),
    setStepWaitTime: command({
      params: { stepId: idOf('steps'), text: text() },
      returns: boolean(),
      run({ stepId, text: value }) { return setTime(this, stepId, 'waitTime', value); },
    }),
    normalizeStepTime: command({
      params: { stepId: idOf('steps'), field: oneOf(['processTime', 'waitTime']) },
      run({ stepId, field }) {
        const step = stepOf(this, stepId);
        const current = step[field];
        if (current.trim() === '') return;
        const r = canonicalize(current, this.timeUnits);
        if (r.valid && r.text !== current) step[field] = r.text;
      },
    }),
    setMudaCategory: command({
      params: {
        mudaId: idOf('mudaCategories'),
        code: text({ optional: true }),
        label: text({ optional: true }),
        color: text({ optional: true }),
      },
      run({ mudaId, code, label, color }) {
        requireForm('code', undefined, code !== undefined || label !== undefined || color !== undefined,
          'at least one of code, label, color');
        const cat = this.mudaCategories.find((m) => m.id === mudaId);
        if (code !== undefined) cat.code = code;
        if (label !== undefined) cat.label = label;
        if (color !== undefined) cat.color = color;
      },
    }),
    setTimeUnit: command({
      params: {
        unitId: idOf('timeUnits'),
        label: text({ optional: true }),
        factorSeconds: number({ exclusiveMin: 0, optional: true }),
      },
      run({ unitId, label, factorSeconds }) {
        requireForm('label', undefined, label !== undefined || factorSeconds !== undefined,
          'at least one of label, factorSeconds');
        const unit = this.timeUnits.find((u) => u.id === unitId);
        if (label !== undefined) unit.label = label;
        if (factorSeconds !== undefined) unit.factorSeconds = factorSeconds;
      },
    }),
    removeStep: command({
      params: { stepId: idOf('steps') },
      confirm({ stepId }) {
        const idx = this.steps.findIndex((s) => s.id === stepId);
        if (idx < 0) return null;
        return { key: 'confirm.removeStep', params: { title: this.steps[idx].title || `S${idx + 1}` } };
      },
      run({ stepId }) {
        this.steps = this.steps.filter((s) => s.id !== stepId);
        if (this.collapsed.includes(stepId)) this.collapsed = this.collapsed.filter((id) => id !== stepId);
      },
    }),
    removeRole: command({
      params: { roleId: idOf('roles') },
      confirm({ roleId }) {
        const role = this.roles.find((r) => r.id === roleId);
        if (!role) return null;
        return role.label
          ? { key: 'confirm.removeRole', params: { label: role.label } }
          : { key: 'confirm.removeRoleUnnamed' };
      },
      run({ roleId }) {
        for (const s of this.steps) {
          if (s.roleIds.includes(roleId)) s.roleIds = s.roleIds.filter((id) => id !== roleId);
        }
        this.roles = this.roles.filter((r) => r.id !== roleId);
      },
    }),
    removeMudaCategory: command({
      params: { mudaId: idOf('mudaCategories') },
      run({ mudaId }) {
        requireNotLast('mudaId', mudaId, this.mudaCategories.length, 'hints.lastMuda');
        for (const s of this.steps) {
          if (s.mudaIds.includes(mudaId)) s.mudaIds = s.mudaIds.filter((id) => id !== mudaId);
        }
        this.mudaCategories = this.mudaCategories.filter((m) => m.id !== mudaId);
      },
    }),
    removeTimeUnit: command({
      params: { unitId: idOf('timeUnits') },
      run({ unitId }) {
        requireNotLast('unitId', unitId, this.timeUnits.length, 'hints.lastUnit');
        this.timeUnits = this.timeUnits.filter((u) => u.id !== unitId);
      },
    }),
    moveStep: command({
      params: { stepId: idOf('steps'), to: index('steps', { afterRemovalFrom: 'steps' }) },
      run({ stepId, to }) { moveTo(this.steps, stepId, to); },
    }),
    moveRole: command({
      params: { roleId: idOf('roles'), to: index('roles', { afterRemovalFrom: 'roles' }) },
      run({ roleId, to }) { moveTo(this.roles, roleId, to); },
    }),
    resetSettingsToDefaults: command({
      confirm() { return { key: 'confirm.resetSettings' }; },
      run() {
        const defaults = createDefaultMudaCategories();
        const valid = new Set(defaults.map((m) => m.id));
        for (const s of this.steps) {
          if (s.mudaIds.some((id) => !valid.has(id))) s.mudaIds = s.mudaIds.filter((id) => valid.has(id));
        }
        this.mudaCategories = defaults;
        this.timeUnits = createDefaultTimeUnits();
      },
    }),
  },
  derived: {
    /**
     * Die Kennzahlen: Summe der Bearbeitungs- und der Wartezeiten, Lead Time
     * und Prozess-Zykluseffizienz. Unlesbare Dauertexte zählen nicht mit.
     *
     * @this {import('./model.types.js').StateModel}
     * @returns {MakigamiKpi}
     */
    kpi() {
      return analyze(this).kpi;
    },
    /**
     * Die Dauertexte, die sich mit den Zeiteinheiten nicht lesen lassen, in
     * Schrittreihenfolge, je Schritt erst die Bearbeitungs-, dann die
     * Wartezeit.
     *
     * @this {import('./model.types.js').StateModel}
     * @returns {TimeIssue[]}
     */
    invalidTimes() {
      return analyze(this).invalid;
    },
  },
});
