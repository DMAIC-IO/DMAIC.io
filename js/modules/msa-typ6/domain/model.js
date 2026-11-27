/**
 * D.Mike — MSA Typ 6: Model.
 *
 * Gespeichert werden die neun Eingaben (`params`), die drei Spaltenbezüge
 * (`columns`), die übernommene Typ-1-Instanz und das Beispiel-Arbeitsblatt;
 * Ansicht: die Editor-Einstellungen der zwei Regelkarten und der Driftgrafik.
 * Das Ergebnis rechnet die Ableitung `result` aus Model und Arbeitsblatt.
 *
 * Gespeichert: `{ _schema, params: { measurementName, unit, chartType,
 * limitsMode, baselineK, mu0, sigma0, enabledRules, alpha }, columns:
 * { timestamp, value, subgroup }, sourceTyp1InstanceId, exampleWorksheetId,
 * primaryChart, secondaryChart, driftChart }` — `params.*` und `columns.*`
 * an den Pfaden der Altform.
 */
import {
  defineModel, command, object, text, number, oneOf, list, boolean, columnRef,
} from '../../../core/model.js';
import { requireForm } from '../../../core/validate.js';
import ControlChart from '../../../widgets/control-chart/schema.js';
import ScatterChart from '../../../widgets/scatter-chart/schema.js';
import { from0 } from './migrations.js';
import { readInputs, analyzeTyp6 } from './analyze.js';

/** Kartentypen. */
export const CHART_TYPES = ['i-mr', 'xbar-r'];
/** Herkunft der Eingriffsgrenzen. */
export const LIMITS_MODES = ['from-study', 'given'];
/** Signifikanzniveaus des Drift-Tests. */
export const ALPHA_OPTIONS = [0.01, 0.05, 0.1];
/** Nelson-Regeln. */
export const RULE_IDS = [1, 2, 3, 4, 5, 6, 7, 8];
/** Vorgabe der angehakten Regeln. */
export const DEFAULT_ENABLED_RULES = [1, 2, 3, 4, 5, 6];

/**
 * Die Schlüsselfläche von `instance.set` auf `params`, zugleich die Form von
 * `read().params`. Sätze je Schlüssel unter `types.Params.<schlüssel>`,
 * dieselben am Label (Alt-Taste).
 *
 * @typedef {object} Params
 * @property {string} measurementName  Bezeichnung des Merkmals
 * @property {string} unit  Maßeinheit
 * @property {'i-mr'|'xbar-r'} chartType  Kartentyp
 * @property {'from-study'|'given'} limitsMode  Herkunft der Eingriffsgrenzen
 * @property {number} baselineK  Basis-Untergruppen, wirkt nur bei from-study
 * @property {number|null} mu0  vorgegebene Lage, wirkt nur bei given
 * @property {number|null} sigma0  vorgegebene Streuung, wirkt nur bei given
 * @property {number[]} enabledRules  angehakte Nelson-Regeln 1–8
 * @property {0.01|0.05|0.1} alpha  Signifikanzniveau des Drift-Tests
 */

/**
 * Die drei Spaltenbezüge, zugleich die Form von `read().columns`.
 *
 * @typedef {object} Columns
 * @property {object|null} timestamp  Zeitstempel oder Reihenfolge
 * @property {object|null} value  Messwert
 * @property {object|null} subgroup  Untergruppe, wirkt nur bei xbar-r
 */

/**
 * Das gerechnete Ergebnis (`analyze()` aus `engines/msa-typ6-engine.js`),
 * wie `read().result` es liefert. Lehnt die Engine die Eingaben ab, steht nur
 * `invalid` da.
 *
 * @typedef {object} Result
 * @property {Meta} meta  Rahmendaten und Warnungen
 * @property {PrimaryChart} primary  Einzelwert- bzw. Mittelwertkarte
 * @property {SecondaryChart} secondary  Spannweitenkarte
 * @property {Drift} drift  Regression über die Zeit
 * @property {RuleViolation[]} ruleViolations  je verletztem Punkt
 * @property {Verdict} verdict  Urteil zur Stabilität
 * @property {Interpretation} interpretation  Deutung als Satz
 * @property {Invalid} [invalid]  Ablehnung der Engine
 */

/**
 * @typedef {object} Invalid
 * @property {string} code  Fehlercode der Engine
 * @property {object|null} params  Werte im Fehlertext
 */

/**
 * @typedef {object} Meta
 * @property {'i-mr'|'xbar-r'} chartType  Kartentyp
 * @property {'from-study'|'given'} limitsMode  Herkunft der Grenzen
 * @property {number} n  Untergruppengröße
 * @property {number} subgroupCount  Anzahl Untergruppen
 * @property {number} pointCount  Anzahl Messwerte
 * @property {number} baselineK  Basis-Untergruppen
 * @property {Warning[]} warnings  Hinweise zur Auswertung
 */

/**
 * @typedef {object} Warning
 * @property {string} code  Kennung der Warnung
 * @property {object} [params]  Werte im Warnungstext
 */

/**
 * @typedef {object} PrimaryChart
 * @property {number[]} series  Punkte der Karte
 * @property {number} cl  Mittellinie
 * @property {number} ucl  obere Eingriffsgrenze
 * @property {number} lcl  untere Eingriffsgrenze
 * @property {number} sigma  Streuung der Punkte
 * @property {'i'|'xbar'} label  Kartenart
 * @property {Violation[]} violations  Regelverletzungen je Regel
 */

/**
 * @typedef {object} Violation
 * @property {number} index  Punkt, ab 0
 * @property {number} ruleId  Nelson-Regel
 */

/**
 * @typedef {object} SecondaryChart
 * @property {Array<number|null>} series  Spannweiten
 * @property {number} cl  Mittellinie
 * @property {number} ucl  obere Eingriffsgrenze
 * @property {number} lcl  untere Eingriffsgrenze
 * @property {'MR'|'R'} label  Kartenart
 */

/**
 * @typedef {object} Drift
 * @property {number} slope  Steigung je Punkt
 * @property {number} se  Standardfehler
 * @property {number} tStat  Prüfgröße
 * @property {number} pValue  p-Wert
 * @property {number} intercept  Achsenabschnitt
 * @property {number} df  Freiheitsgrade
 * @property {number[]} ciSlope  Konfidenzintervall der Steigung
 * @property {string} slopeUnit  Einheit der Steigung
 * @property {'timestamp'|'index'} tScale  Zeitachse
 */

/**
 * @typedef {object} RuleViolation
 * @property {number} primaryIndex  Punkt, ab 0
 * @property {number|string|null} time  Zeitpunkt oder laufende Nummer
 * @property {number} value  Wert des Punkts
 * @property {number[]} ruleIds  verletzte Regeln
 */

/**
 * @typedef {object} Verdict
 * @property {'stable'|'marginal'|'unstable'} level  Urteil
 * @property {'none'|'nelson'|'drift'|'both'} driver  Auslöser
 * @property {number} nelsonCount  verletzte Punkte
 * @property {number} driftP  p-Wert des Drift-Tests
 * @property {Thresholds} thresholds  Urteilsgrenzen
 */

/**
 * @typedef {object} Thresholds
 * @property {number} nelsonUnstable  Punkte ab instabil
 * @property {number} driftStrong  p-Grenze starker Drift
 * @property {number} alpha  Signifikanzniveau
 */

/**
 * @typedef {object} Interpretation
 * @property {string} textKey  Textschlüssel der Deutung
 * @property {InterpretationParams} params  Werte im Satz
 */

/**
 * @typedef {object} InterpretationParams
 * @property {number} nelsonCount  verletzte Punkte
 * @property {string} driftP  p-Wert als Text
 * @property {string} slope  Steigung als Text
 */

/** Die neun Parameter in der Reihenfolge der Altform. @type {(keyof Params)[]} */
const PARAM_KEYS = ['measurementName', 'unit', 'chartType', 'limitsMode', 'baselineK', 'mu0', 'sigma0', 'enabledRules', 'alpha'];

/** Die drei Spalten-Slots. @type {(keyof Columns)[]} */
const COLUMN_SLOTS = ['timestamp', 'value', 'subgroup'];

export class State extends defineModel({
  version: '1.0',
  migrations: { '0→1.0': from0 },
  fields: {
    params: object({
      measurementName: text(),
      unit: text({ default: 'mm' }),
      chartType: oneOf(['i-mr', 'xbar-r'], { default: 'i-mr' }),
      limitsMode: oneOf(['from-study', 'given'], { default: 'from-study' }),
      baselineK: number({ integer: true, min: 1, default: 20 }),
      mu0: number({ nullable: true }),
      sigma0: number({ nullable: true }),
      enabledRules: list(oneOf([1, 2, 3, 4, 5, 6, 7, 8]), { unique: true, sorted: true, default: [1, 2, 3, 4, 5, 6] }),
      alpha: oneOf([0.01, 0.05, 0.1], { default: 0.05 }),
    }),
    columns: object({
      timestamp: columnRef({ types: ['numeric', 'date'] }),
      value: columnRef({ types: ['numeric', 'currency', 'percent'] }),
      subgroup: columnRef(),
    }),
    sourceTyp1InstanceId: text({ nullable: true, agentWrite: false }),
    exampleWorksheetId: text({ nullable: true }),
  },
  view: {
    primaryChart: ControlChart.edits(),
    secondaryChart: ControlChart.edits(),
    driftChart: ScatterChart.edits(),
  },
  derived: {
    /**
     * Die Studie aus Spalten und Parametern; null, solange die Messwertspalte
     * oder lesbare Messwerte fehlen.
     * @param {import('../../../core/source-reader.js').Source} src Leser des Arbeitsblatts
     * @this {import('./model.types.js').StateModel}
     * @returns {Result|null}
     */
    result(src) { return analyzeTyp6(this.params, readInputs(this, src)); },
    /**
     * Die Parameter, die im aktuellen Zustand wirken: `baselineK` nur bei
     * Grenzen aus der Studie, `mu0` und `sigma0` nur bei vorgegebenen Grenzen.
     * @this {import('./model.types.js').StateModel}
     * @returns {(keyof Params)[]}
     */
    activeParams() {
      const given = this.params.limitsMode === 'given';
      return PARAM_KEYS.filter((k) => (k !== 'baselineK' || !given) && ((k !== 'mu0' && k !== 'sigma0') || given));
    },
    /**
     * Die Spalten-Slots, die im aktuellen Zustand wirken: `subgroup` nur bei x̄-R.
     * @this {import('./model.types.js').StateModel}
     * @returns {(keyof Columns)[]}
     */
    activeColumnSlots() {
      return COLUMN_SLOTS.filter((s) => s !== 'subgroup' || this.params.chartType === 'xbar-r');
    },
  },
  commands: {
    toggleRule: command({
      params: { ruleId: oneOf([1, 2, 3, 4, 5, 6, 7, 8]), on: boolean() },
      run({ ruleId, on }) {
        const rules = this.params.enabledRules.filter((r) => r !== ruleId);
        this.params = { ...this.params, enabledRules: on ? [...rules, ruleId] : rules };
      },
    }),
    adoptTyp1: command({
      params: {
        instanceId: text({ nullable: true }),
        mu0: number({ nullable: true, optional: true }),
        sigma0: number({ nullable: true, optional: true }),
      },
      run({ instanceId, mu0, sigma0 }) {
        if (!instanceId) { this.sourceTyp1InstanceId = null; return; }
        // Eine Quelle nur zusammen mit ihren Werten (Spec, Offene Frage 3).
        requireForm('mu0', mu0, Number.isFinite(mu0), 'a finite number when instanceId is set');
        requireForm('sigma0', sigma0, Number.isFinite(sigma0), 'a finite number when instanceId is set');
        this.sourceTyp1InstanceId = instanceId;
        this.params = { ...this.params, mu0, sigma0 };
      },
    }),
  },
}) {
  /** @returns {boolean} wahr bei einer gewählten Spalte oder einem Merkmalsnamen (steuert die Rückfrage vor dem Überschreiben) */
  hasContent() {
    const c = this.columns;
    return Boolean(c.timestamp) || Boolean(c.value) || Boolean(c.subgroup) || Boolean(this.params.measurementName);
  }
}
