/**
 * D.Mike — FMEA: Model.
 *
 * Risiken mit Fehlerkette, Bewertung S/O/D (ganze Zahl 1–10 oder `null` für
 * unbewertet), besonderem Merkmal, Begründung und Maßnahmen; jede Maßnahme mit
 * Zieldatum, Status und den erwarteten Senkungen (0–9). Bewertet wird nach
 * Aufgabenpriorität (AIAG-VDA) oder Risikoprioritätszahl; die Art der FMEA
 * wählt die AP-Skalentexte. Eigene Skalentexte stehen unter den Schlüsseln aus
 * scales.js. Ansicht: die zugeklappten Risiken und die Editor-Einstellungen
 * des Burndowns. Kennzahlen, Bewertung je Risiko und Burndown-Reihen sind
 * abgeleitet (rating.js). Ohne DOM, ohne i18n.
 *
 * Gespeichert: `{ _schema, method, fmeaType, risks, scales, collapsed, burndownEdits }`.
 */
import {
  defineModel, command, list, object, map, text, number, boolean, oneOf, idOf, unchecked,
} from '../../../core/model.js';
import {
  requireEnum, requireBoolean, requireNumber, requireText, requireForm, requireKnownId,
} from '../../../core/validate.js';
import { isIsoDate } from '../../../core/local-date.js';
import { uid } from '../../../core/uid.js';
import scatterChart from '../../../widgets/scatter-chart/schema.js';
import { from0 } from './migrations.js';
import { SCALE_KEYS } from './scales.js';
import {
  rating, rpn, ap, projRpn, projAp, needsJustification, SPECIAL_CHARS,
} from './rating.js';

/** Die Felder eines Risikos, die `setRiskValue` schreibt. */
export const RISK_FIELDS = Object.freeze(['step', 'failureMode', 'effect', 'cause', 'prevention',
  'control', 'specialChar', 'justification', 'sev', 'occ', 'det']);
/** Die Felder einer Maßnahme, die `setActionValue` schreibt. */
export const ACTION_FIELDS = Object.freeze(['text', 'resp', 'date', 'done', 'deltaS', 'deltaO', 'deltaD']);

const SOD_RANGE = { min: 1, max: 10, integer: true };
const DELTA_RANGE = { min: 0, max: 9, integer: true };

/**
 * True, wenn jede id nicht leer ist und nur einmal vorkommt.
 * @param {ReadonlyArray<{ id: string }>} items @returns {boolean}
 */
function validIds(items) {
  const ids = items.map((x) => x.id);
  return ids.every((id) => id !== '') && new Set(ids).size === ids.length;
}

/**
 * Leere und doppelte ids bekommen eine neue; verworfen wird nichts.
 * @param {Array<{ id: string }>} items @param {string} prefix
 * @returns {void}
 */
function repairIds(items, prefix) {
  const taken = new Set(items.map((x) => x.id));
  const seen = new Set();
  for (const x of items) {
    if (x.id === '' || seen.has(x.id)) {
      let id = `${prefix}${uid()}`;
      while (taken.has(id)) id = `${prefix}${uid()}`;
      taken.add(id);
      x.id = id;
    }
    seen.add(x.id);
  }
}

/**
 * Das Risiko zu `riskId` (die id ist über `idOf` geprüft).
 * @param {any} m @param {string} riskId
 */
const riskOf = (m, riskId) => m.risks.find((/** @type {{ id: string }} */ r) => r.id === riskId);

/**
 * Die Maßnahme `actionId` eines Risikos; eine unbekannte id wirft.
 * @param {any} risk @param {string} actionId
 */
function actionOf(risk, actionId) {
  const ids = risk.actions.map((/** @type {{ id: string }} */ a) => a.id);
  requireKnownId('actionId', actionId, ids);
  return risk.actions.find((/** @type {{ id: string }} */ a) => a.id === actionId);
}

/**
 * Die Kennzahlen der aktiven Bewertungsmethode, wie `read().stats` sie
 * liefert. Bei `rpn` fehlen `rated` und `unjustified`, bei `ap` fehlen
 * `critical`, `highSeverity`, `avg` und `max`.
 *
 * @typedef {object} FmeaStats
 * @property {'ap'|'rpn'} kind  aktive Bewertungsmethode
 * @property {number} total  Zahl der Risiken
 * @property {number} [rated]  bewertete Risiken (nur ap)
 * @property {number} [critical]  RPN über 200 (nur rpn)
 * @property {number} high  ap: Stufe H; rpn: RPN 125–200
 * @property {number} medium  ap: Stufe M; rpn: RPN 50–124
 * @property {number} low  ap: Stufe L; rpn: RPN unter 50
 * @property {number} [unjustified]  Stufe H ohne Maßnahme und ohne Begründung (nur ap)
 * @property {number} [highSeverity]  S 9 oder 10 (nur rpn)
 * @property {number|null} [avg]  gerundeter Mittelwert der RPN bewerteter Risiken, ohne solche leer (nur rpn)
 * @property {number} [max]  größte RPN, 0 ohne bewertetes Risiko (nur rpn)
 */

/**
 * Die Bewertung eines Risikos, wie Karte und Abzeichen sie zeigen.
 *
 * @typedef {object} RiskRating
 * @property {string} riskId  Kennung des Risikos
 * @property {number} rpn  S × O × D, 0 solange eine Stufe fehlt
 * @property {'H'|'M'|'L'|null} ap  Aufgabenpriorität, leer solange eine Stufe fehlt
 * @property {number} projRpn  RPN nach allen Senkungen der Maßnahmen, 0 ohne RPN
 * @property {'H'|'M'|'L'|null} projAp  Aufgabenpriorität nach allen Senkungen
 * @property {boolean} needsJustification  Stufe H ohne Maßnahme und ohne Begründung
 */

/**
 * Die Reihen des Burndowns der aktiven Methode. Zeitpunkte in Millisekunden
 * seit 1970; der erste liegt einen Tag vor der frühesten Maßnahme.
 *
 * @typedef {object} Burndown
 * @property {'ap'|'rpn'} kind  aktive Bewertungsmethode
 * @property {number[]} planX  Zeitpunkte des Plans (alle datierten Maßnahmen)
 * @property {number[]} actX  Zeitpunkte des Ist (nur erledigte Maßnahmen)
 * @property {number[]} [planY]  RPN-Summe im Plan (nur rpn)
 * @property {number[]} [actY]  RPN-Summe im Ist (nur rpn)
 * @property {number} [totalRPN]  RPN-Summe vor allen Maßnahmen (nur rpn)
 * @property {number[]} [planH]  Zahl der H-Risiken im Plan (nur ap)
 * @property {number[]} [planHM]  Zahl der H- und M-Risiken im Plan (nur ap)
 * @property {number[]} [actH]  Zahl der H-Risiken im Ist (nur ap)
 * @property {number[]} [actHM]  Zahl der H- und M-Risiken im Ist (nur ap)
 */

export const State = defineModel({
  version: '1.0',
  migrations: { '0→1.0': from0 },
  fields: {
    /** die Bewertungsmethode: `ap` nach Aufgabenpriorität (AIAG-VDA), `rpn` nach Risikoprioritätszahl */
    method: oneOf(['ap', 'rpn'], { default: 'ap' }),
    /** die Art der FMEA; sie wählt die Skalentexte der Aufgabenpriorität */
    fmeaType: oneOf(['process', 'design'], { default: 'process' }),
    /** die Risiken in Bearbeitungsreihenfolge */
    risks: list(object({
      id: text(),
      step: text(),
      failureMode: text(),
      effect: text(),
      cause: text(),
      prevention: text(),
      control: text(),
      specialChar: oneOf(['', 'CC', 'SC'], { default: '' }),
      justification: text(),
      sev: number({ integer: true, min: 1, max: 10, nullable: true }),
      occ: number({ integer: true, min: 1, max: 10, nullable: true }),
      det: number({ integer: true, min: 1, max: 10, nullable: true }),
      actions: list(object({
        id: text(),
        text: text(),
        resp: text(),
        date: text(),
        done: boolean(),
        deltaS: number({ integer: true, min: 0, max: 9, default: 0 }),
        deltaO: number({ integer: true, min: 0, max: 9, default: 0 }),
        deltaD: number({ integer: true, min: 0, max: 9, default: 0 }),
      })),
    }), { bulk: true }),
    /** die eigenen Skalentexte, je Schlüssel einer Skalenzelle ein Text */
    scales: map(text(), text()),
  },
  view: {
    /** die ids der zugeklappten Risikokarten */
    collapsed: list(text()),
    /** Editor-Einstellungen des Burndown-Diagramms */
    burndownEdits: scatterChart.edits(),
  },
  invariants: {
    riskIds: {
      fields: ['risks'],
      test(m) { return validIds(m.risks); },
      repair(m) { repairIds(m._v.risks, 'f'); },
    },
    actionIds: {
      fields: ['risks'],
      test(m) { return m.risks.every((/** @type {any} */ r) => validIds(r.actions)); },
      repair(m) { for (const r of m._v.risks) repairIds(r.actions, ''); },
    },
    knownCollapsed: {
      fields: ['collapsed'],
      test(m) {
        const ids = new Set(m.risks.map((/** @type {{ id: string }} */ r) => r.id));
        return m.collapsed.every((/** @type {string} */ id) => ids.has(id));
      },
      repair(m) {
        const ids = new Set(m._v.risks.map((/** @type {{ id: string }} */ r) => r.id));
        m._v.collapsed = m._v.collapsed.filter((/** @type {string} */ id) => ids.has(id));
      },
    },
    knownScaleKeys: {
      fields: ['scales'],
      test(m) { return Object.keys(m.scales).every((k) => SCALE_KEYS.includes(k)); },
      repair(m) {
        m._v.scales = Object.fromEntries(Object.entries(m._v.scales).filter(([k]) => SCALE_KEYS.includes(k)));
      },
    },
  },
  commands: {
    addRisk: command({
      returns: text(),
      run() {
        let id = `f${uid()}`;
        while (riskOf(this, id)) id = `f${uid()}`;
        this.risks.push({
          id, step: '', failureMode: '', effect: '', cause: '', prevention: '', control: '',
          specialChar: '', justification: '', sev: null, occ: null, det: null, actions: [],
        });
        return id;
      },
    }),
    removeRisk: command({
      params: { id: idOf('risks') },
      run({ id }) {
        this.risks = this.risks.filter((/** @type {{ id: string }} */ r) => r.id !== id);
        if (this.collapsed.includes(id)) this.collapsed = this.collapsed.filter((/** @type {string} */ c) => c !== id);
      },
    }),
    setRiskValue: command({
      params: {
        riskId: idOf('risks'),
        field: oneOf(['step', 'failureMode', 'effect', 'cause', 'prevention', 'control', 'specialChar', 'justification', 'sev', 'occ', 'det']),
        value: unchecked({ type: 'string|number|null' }),
      },
      run({ riskId, field, value }) {
        let clean = value;
        if (field === 'specialChar') requireEnum('value', value, SPECIAL_CHARS);
        else if (field === 'sev' || field === 'occ' || field === 'det') {
          clean = value === '' || value === null ? null : requireNumber('value', value, SOD_RANGE);
        } else requireText('value', value);
        riskOf(this, riskId)[field] = clean;
      },
    }),
    addRiskAction: command({
      params: { riskId: idOf('risks') },
      returns: text(),
      run({ riskId }) {
        const risk = riskOf(this, riskId);
        let id = uid();
        while (risk.actions.some((/** @type {{ id: string }} */ a) => a.id === id)) id = uid();
        risk.actions.push({ id, text: '', resp: '', date: '', done: false, deltaS: 0, deltaO: 0, deltaD: 0 });
        return id;
      },
    }),
    removeRiskAction: command({
      params: { riskId: idOf('risks'), actionId: text() },
      run({ riskId, actionId }) {
        const risk = riskOf(this, riskId);
        actionOf(risk, actionId);
        risk.actions = risk.actions.filter((/** @type {{ id: string }} */ a) => a.id !== actionId);
      },
    }),
    setActionValue: command({
      params: {
        riskId: idOf('risks'),
        actionId: text(),
        field: oneOf(['text', 'resp', 'date', 'done', 'deltaS', 'deltaO', 'deltaD']),
        value: unchecked({ type: 'string|number|boolean' }),
      },
      run({ riskId, actionId, field, value }) {
        const act = actionOf(riskOf(this, riskId), actionId);
        let clean = value;
        if (field === 'done') requireBoolean('value', value);
        else if (field === 'date') {
          requireText('value', value);
          requireForm('value', value, value === '' || isIsoDate(value), 'YYYY-MM-DD or ""');
        } else if (field === 'deltaS' || field === 'deltaO' || field === 'deltaD') {
          clean = requireNumber('value', value, DELTA_RANGE);
        } else requireText('value', value);
        act[field] = clean;
      },
    }),
    setScaleValue: command({
      params: { key: text(), text: text() },
      run({ key, text: value }) {
        requireForm('key', key, SCALE_KEYS.includes(key),
          'a scale cell key — sevNone, sevNoneDesc, sevLow … detVLowDesc, occUnlikelyRate … occVHighRate, '
          + 'or ap.<process|design>.<sev|occ|det>.<1..10>.<meaning|criterion>');
        this.scales = { ...this.scales, [key]: value };
      },
    }),
    resetScales: command({
      run() { this.scales = {}; },
    }),
    sortByPriority: command({
      run() {
        this.risks = [...this.risks].sort(rating(this.method).compare);
      },
    }),
    toggleRiskCollapsed: command({
      params: { riskId: idOf('risks', { agentWrite: false }) },
      run({ riskId }) {
        this.collapsed = this.collapsed.includes(riskId)
          ? this.collapsed.filter((/** @type {string} */ c) => c !== riskId)
          : [...this.collapsed, riskId];
      },
    }),
  },
  derived: {
    /**
     * Die Kennzahlen der aktiven Bewertungsmethode.
     *
     * @this {import('./model.types.js').StateModel}
     * @returns {FmeaStats}
     */
    stats() {
      return rating(this.method).stats(this.risks);
    },
    /**
     * Je Risiko in Listenreihenfolge RPN, Aufgabenpriorität, deren Zielwerte
     * nach allen Maßnahmen und ob eine Begründung fehlt.
     *
     * @this {import('./model.types.js').StateModel}
     * @returns {RiskRating[]}
     */
    riskRatings() {
      return this.risks.map((r) => ({
        riskId: r.id,
        rpn: rpn(r),
        ap: ap(r),
        projRpn: projRpn(r),
        projAp: projAp(r),
        needsJustification: needsJustification(r),
      }));
    },
    /**
     * Die Burndown-Reihen der aktiven Methode; `null`, solange kein
     * bewertetes Risiko eine datierte Maßnahme mit Wirkung hat.
     *
     * @this {import('./model.types.js').StateModel}
     * @returns {Burndown|null}
     */
    burndown() {
      return rating(this.method).burndownSeries(this.risks);
    },
  },
});
