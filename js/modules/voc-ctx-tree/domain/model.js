/**
 * D.Mike — VoC → CTx-Baum: Model.
 *
 * Die Kundenstimmen in Anlegereihenfolge, je Stimme der Baum aus
 * Bedürfnissen, Treibern (CTQ, CTD, CTC) und Anforderungen; dazu die
 * Darstellung (Randstärke, Farbe je Knotenart). Welche Stimme angezeigt wird,
 * steht im Ansichtsfeld `activeVocId`. Ohne DOM, ohne i18n.
 *
 * Gespeichert: `{ _schema, vocs, styles, activeVocId }`. Dass ids im ganzen
 * Baum eindeutig sind, Farben lesbar, die Randstärke auf einer Stufe liegt
 * und `activeVocId` eine vorhandene Stimme nennt, sichern die Invarianten —
 * beim Laden repariert, beim Schreiben abgelehnt. Neue ids: `uid()`.
 */
import {
  defineModel, command, list, object, record, number, text, oneOf, boolean,
} from '../../../core/model.js';
import { requireKnownId } from '../../../core/validate.js';
import { uid } from '../../../core/uid.js';
import { from0 } from './migrations.js';
import {
  VALID_TYPES, COLOR_KEYS, DEFAULT_COLORS, BORDER_WIDTHS, MIN_BORDER, MAX_BORDER,
  isColor, onBorderStep, nearestBorderStep, allIds,
} from './tree.js';

export { VALID_TYPES, COLOR_KEYS, DEFAULT_COLORS, BORDER_WIDTHS, MIN_BORDER, MAX_BORDER };

/** @typedef {import('./tree.js').Voc} Voc */
/** @typedef {import('./tree.js').Need} Need */
/** @typedef {import('./tree.js').Driver} Driver */

/**
 * Die Kundenstimme mit dieser id; eine unbekannte lehnt ab.
 * @param {{ vocs: ReadonlyArray<any> }} m @param {string} vocId @returns {Voc}
 */
function vocOf(m, vocId) {
  requireKnownId('vocId', vocId, m.vocs.map((v) => v.id));
  return m.vocs.find((v) => v.id === vocId);
}

/**
 * Das Bedürfnis mit dieser id; eine unbekannte lehnt ab.
 * @param {{ vocs: ReadonlyArray<any> }} m @param {string} vocId @param {string|undefined} needId @returns {Need}
 */
function needOf(m, vocId, needId) {
  const voc = vocOf(m, vocId);
  requireKnownId('needId', needId, voc.needs.map((n) => n.id));
  return voc.needs.find((n) => n.id === needId);
}

/**
 * Der Treiber mit dieser id; eine unbekannte lehnt ab.
 * @param {{ vocs: ReadonlyArray<any> }} m @param {string} vocId @param {string|undefined} needId @param {string|undefined} drvId
 * @returns {Driver}
 */
function driverOf(m, vocId, needId, drvId) {
  const need = needOf(m, vocId, needId);
  requireKnownId('drvId', drvId, need.drivers.map((d) => d.id));
  return need.drivers.find((d) => d.id === drvId);
}

/**
 * Die Anforderung mit dieser id; eine unbekannte lehnt ab.
 * @param {{ vocs: ReadonlyArray<any> }} m @param {string} vocId @param {string} needId @param {string} drvId @param {string} reqId
 * @returns {import('./tree.js').Requirement}
 */
function reqOf(m, vocId, needId, drvId, reqId) {
  const drv = driverOf(m, vocId, needId, drvId);
  requireKnownId('reqId', reqId, drv.requirements.map((r) => r.id));
  return drv.requirements.find((r) => r.id === reqId);
}

/**
 * Eine neue id, die im Baum noch nicht vorkommt.
 * @param {{ vocs: ReadonlyArray<any> }} m @returns {string}
 */
function newId(m) {
  const ids = new Set(allIds(m.vocs));
  let id = uid();
  while (ids.has(id)) id = uid();
  return id;
}

export const State = defineModel({
  version: '1.0',
  migrations: { '0→1.0': from0 },
  fields: {
    /** die Kundenstimmen in Anlegereihenfolge, je mit Bedürfnissen, Treibern und Anforderungen */
    vocs: list(object({
      id: text(),
      text: text(),
      source: text(),
      needs: list(object({
        id: text(),
        text: text(),
        drivers: list(object({
          id: text(),
          text: text(),
          type: oneOf(['ctq', 'ctd', 'ctc']),
          requirements: list(object({
            id: text(),
            text: text(),
            target: text(),
            measure: text(),
          })),
        })),
      })),
    }), { bulk: true, bulkKind: 'tree', agentWrite: false }),
    /** die Darstellung des Baums: Randstärke der Knoten und Farbe je Knotenart */
    styles: object({
      borderWidth: number({ min: 0, max: 4, default: 1 }),
      colors: record(['voc', 'need', 'ctq', 'ctd', 'ctc', 'req'], text(), {
        default: {
          voc: 'rgba(230,126,34,1)',
          need: 'rgba(155,89,182,1)',
          ctq: 'rgba(39,174,96,1)',
          ctd: 'rgba(41,128,185,1)',
          ctc: 'rgba(231,76,139,1)',
          req: 'rgba(94,88,216,1)',
        },
      }),
    }),
  },
  view: {
    /** die id der angezeigten Kundenstimme; ohne Auswahl die erste */
    activeVocId: text({ nullable: true }),
  },
  invariants: {
    uniqueIds: {
      fields: ['vocs'],
      test(m) {
        const ids = allIds(m.vocs);
        return ids.every((id) => id !== '') && new Set(ids).size === ids.length;
      },
      repair(m) {
        const all = allIds(m._v.vocs);
        const taken = new Set(all);
        const seen = new Set();
        /** @param {{ id: string }} n */
        const fix = (n) => {
          if (n.id === '' || seen.has(n.id)) {
            let id = n.id === '' ? '_' : `${n.id}_`;
            while (taken.has(id)) id += '_';
            n.id = id;
            taken.add(id);
          }
          seen.add(n.id);
        };
        for (const v of m._v.vocs) {
          fix(v);
          for (const n of v.needs) {
            fix(n);
            for (const d of n.drivers) {
              fix(d);
              for (const r of d.requirements) fix(r);
            }
          }
        }
      },
    },
    validColors: {
      fields: ['styles'],
      test(m) {
        return COLOR_KEYS.every((k) => isColor(m.styles.colors[k]));
      },
      repair(m) {
        const { colors } = m._v.styles;
        for (const k of COLOR_KEYS) if (!isColor(colors[k])) colors[k] = DEFAULT_COLORS[k];
      },
    },
    borderWidthStep: {
      fields: ['styles'],
      test(m) {
        return onBorderStep(m.styles.borderWidth);
      },
      repair(m) {
        m._v.styles.borderWidth = nearestBorderStep(m._v.styles.borderWidth);
      },
    },
    knownActiveVoc: {
      fields: ['activeVocId'],
      test(m) {
        return m.activeVocId === null || m.vocs.some((v) => v.id === m.activeVocId);
      },
      repair(m) {
        m._v.activeVocId = null;
      },
    },
  },
  commands: {
    addVoc: command({
      params: {
        text: text({ trim: true, nonEmpty: true }),
        source: text({ trim: true, optional: true }),
      },
      returns: text(),
      run({ text: t, source = '' }) {
        const id = newId(this);
        this.vocs.push({ id, text: t, source, needs: [] });
        this.activeVocId = id;
        return id;
      },
    }),
    updateVoc: command({
      params: {
        vocId: text(),
        text: text({ trim: true, nonEmpty: true }),
        source: text({ trim: true }),
      },
      /** @type {import('./model.types.js').UpdateVocCurrent} */
      current({ vocId }) {
        const v = vocOf(this, /** @type {string} */ (vocId));
        return { text: v.text, source: v.source };
      },
      run({ vocId, text: t, source }) {
        const v = vocOf(this, vocId);
        v.text = t;
        v.source = source;
      },
    }),
    removeVoc: command({
      params: { vocId: text() },
      /** @type {import('./model.types.js').RemoveVocConfirm} */
      confirm() {
        return { key: 'confirm.removeVoc' };
      },
      run({ vocId }) {
        vocOf(this, vocId);
        const at = this.vocs.findIndex((v) => v.id === vocId);
        this.vocs.splice(at, 1);
        if (this.activeVocId === vocId) this.activeVocId = this.vocs.length > 0 ? this.vocs[0].id : null;
      },
    }),
    setActiveVoc: command({
      params: { vocId: text({ nullable: true, agentWrite: false }) },
      run({ vocId }) {
        if (vocId !== null) vocOf(this, vocId);
        this.activeVocId = vocId;
      },
    }),
    addNeed: command({
      params: { vocId: text(), text: text({ trim: true, nonEmpty: true }) },
      returns: text(),
      run({ vocId, text: t }) {
        const voc = vocOf(this, vocId);
        const id = newId(this);
        voc.needs.push({ id, text: t, drivers: [] });
        return id;
      },
    }),
    updateNeed: command({
      params: { vocId: text(), needId: text(), text: text({ trim: true, nonEmpty: true }) },
      /** @type {import('./model.types.js').UpdateNeedCurrent} */
      current({ vocId, needId }) {
        return { text: needOf(this, /** @type {string} */ (vocId), needId).text };
      },
      run({ vocId, needId, text: t }) {
        needOf(this, vocId, needId).text = t;
      },
    }),
    removeNeed: command({
      params: { vocId: text(), needId: text() },
      run({ vocId, needId }) {
        const voc = vocOf(this, vocId);
        needOf(this, vocId, needId);
        voc.needs.splice(voc.needs.findIndex((n) => n.id === needId), 1);
      },
    }),
    addDriver: command({
      params: {
        vocId: text(),
        needId: text(),
        text: text({ trim: true, nonEmpty: true }),
        type: oneOf(['ctq', 'ctd', 'ctc'], { default: 'ctq', optional: true }),
      },
      returns: text(),
      run({ vocId, needId, text: t, type = 'ctq' }) {
        const need = needOf(this, vocId, needId);
        const id = newId(this);
        need.drivers.push({ id, text: t, type, requirements: [] });
        return id;
      },
    }),
    updateDriver: command({
      params: {
        vocId: text(),
        needId: text(),
        drvId: text(),
        text: text({ trim: true, nonEmpty: true }),
        type: oneOf(['ctq', 'ctd', 'ctc']),
      },
      /** @type {import('./model.types.js').UpdateDriverCurrent} */
      current({ vocId, needId, drvId }) {
        const d = driverOf(this, /** @type {string} */ (vocId), needId, drvId);
        return { text: d.text, type: /** @type {any} */ (d.type) };
      },
      run({ vocId, needId, drvId, text: t, type }) {
        const d = driverOf(this, vocId, needId, drvId);
        d.text = t;
        d.type = type;
      },
    }),
    removeDriver: command({
      params: { vocId: text(), needId: text(), drvId: text() },
      run({ vocId, needId, drvId }) {
        const need = needOf(this, vocId, needId);
        driverOf(this, vocId, needId, drvId);
        need.drivers.splice(need.drivers.findIndex((d) => d.id === drvId), 1);
      },
    }),
    addRequirement: command({
      params: {
        vocId: text(),
        needId: text(),
        drvId: text(),
        text: text({ trim: true, nonEmpty: true }),
        target: text({ trim: true, optional: true }),
        measure: text({ trim: true, optional: true }),
      },
      returns: text(),
      run({ vocId, needId, drvId, text: t, target = '', measure = '' }) {
        const drv = driverOf(this, vocId, needId, drvId);
        const id = newId(this);
        drv.requirements.push({ id, text: t, target, measure });
        return id;
      },
    }),
    updateRequirement: command({
      params: {
        vocId: text(),
        needId: text(),
        drvId: text(),
        reqId: text(),
        text: text({ trim: true, nonEmpty: true }),
        target: text({ trim: true }),
        measure: text({ trim: true }),
      },
      /** @type {import('./model.types.js').UpdateRequirementCurrent} */
      current({ vocId, needId, drvId, reqId }) {
        const r = reqOf(this, /** @type {string} */ (vocId), /** @type {string} */ (needId),
          /** @type {string} */ (drvId), /** @type {string} */ (reqId));
        return { text: r.text, target: r.target, measure: r.measure };
      },
      run({ vocId, needId, drvId, reqId, text: t, target, measure }) {
        const r = reqOf(this, vocId, needId, drvId, reqId);
        r.text = t;
        r.target = target;
        r.measure = measure;
      },
    }),
    removeReq: command({
      params: { vocId: text(), needId: text(), drvId: text(), reqId: text() },
      run({ vocId, needId, drvId, reqId }) {
        const drv = driverOf(this, vocId, needId, drvId);
        reqOf(this, vocId, needId, drvId, reqId);
        drv.requirements.splice(drv.requirements.findIndex((r) => r.id === reqId), 1);
      },
    }),
    reorderNodes: command({
      params: {
        kind: oneOf(['need', 'driver', 'req']),
        vocId: text(),
        needId: text({ optional: true }),
        drvId: text({ optional: true }),
        fromId: text(),
        toId: text(),
      },
      returns: boolean(),
      run({ kind, vocId, needId, drvId, fromId, toId }) {
        /** @type {Array<{ id: string }>} */
        let siblings;
        if (kind === 'need') siblings = vocOf(this, vocId).needs;
        else if (kind === 'driver') siblings = needOf(this, vocId, needId).drivers;
        else siblings = driverOf(this, vocId, needId, drvId).requirements;
        const ids = siblings.map((x) => x.id);
        requireKnownId('fromId', fromId, ids);
        requireKnownId('toId', toId, ids);
        if (fromId === toId) return false;
        const [moved] = siblings.splice(ids.indexOf(fromId), 1);
        siblings.splice(ids.indexOf(toId), 0, moved);
        return true;
      },
    }),
  },
});

