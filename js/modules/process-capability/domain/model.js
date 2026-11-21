/**
 * D.Mike — Process Capability: Model.
 *
 * Gespeichert werden die Eingaben (Merkmal, Grenzen, Konfidenz, Untergruppen
 * und Schätzer), der Bezug auf Mess- und ID-Spalte und eingebettete
 * Beispieldaten. Ansicht: die Editor-Einstellungen des Histogramms. Das
 * Ergebnis und die davon abhängigen Mengen liefern die Ableitungen aus Model
 * und Arbeitsblatt.
 */
import { defineModel, command, object, text, number, boolean, oneOf, list, columnRef } from '../../../core/model.js';
import { WITHIN_METHODS } from '../../../engines/sigma-within-engine.js';
import { listColumns, columnOption, sourceColumns } from '../../../core/source-columns.js';
import histogramChart from '../../../widgets/histogram-chart/schema.js';
import { analyze } from './analyze.js';
import { subgroupAllowed } from './columns.js';
import { from0 } from './migrations.js';

/**
 * Die Schlüsselfläche von `setParam`, zugleich die Form von `read().params`
 * (Grenzen und Konfidenz als Zahl oder leer). Sätze je Schlüssel unter
 * `types.Params.<schlüssel>`, dieselben am Label (Alt-Taste).
 *
 * @typedef {object} Params
 * @property {string} name  Merkmal
 * @property {number|null} lsl  untere Spezifikationsgrenze
 * @property {number|null} target  Sollwert
 * @property {number|null} usl  obere Spezifikationsgrenze
 * @property {string} unit  Einheit
 * @property {number|null} confidence  Konfidenzniveau in Prozent
 * @property {'size'|'column'} subgroupMode  Untergruppen nach Größe oder Spalte
 * @property {number} subgroupSize  Untergruppengröße, nur Modus Größe
 * @property {''|'pooled'|'rbar'|'sbar'|'averageMR'|'medianMR'|'sqrtMSSD'} withinMethod  Schätzer der Streuung innerhalb
 * @property {number} mrSpan  Spannweite der gleitenden Spannweiten
 * @property {boolean} unbiased  Korrekturfaktor anwenden
 */

/**
 * Das Fähigkeitsergebnis (Engine `analyze`), wie `read().result` es liefert.
 * Alle Schlüssel sind immer da; was für eine fehlende Grenze nicht gilt, ist leer.
 *
 * @typedef {object} Result
 * @property {number} n  Zahl der Werte
 * @property {number} xbar  Mittelwert
 * @property {number} s  Gesamt-Standardabweichung (n − 1)
 * @property {number|null} sigmaWithin  Streuung innerhalb (Schätzer)
 * @property {number|null} sigmaOverall  Gesamtstreuung, gleich s
 * @property {string} withinMethod  verwendeter Schätzer
 * @property {number} withinDf  Freiheitsgrade des Schätzers
 * @property {number} subgroupSize  Untergruppengröße (Modus Spalte: 1)
 * @property {number} xmin  kleinster Wert
 * @property {number} xmax  größter Wert
 * @property {number} subgroupCount  Zahl der Untergruppen bzw. Werte
 * @property {number} nBar  mittlere Untergruppengröße
 * @property {boolean} unbiased  Korrekturfaktor angewandt
 * @property {number} mrSpan  Spannweite der gleitenden Spannweiten
 * @property {number|null} T  Toleranz OSG − USG
 * @property {number|null} mid  Toleranzmitte
 * @property {number|null} targetVal  Sollwert oder Toleranzmitte
 * @property {boolean} hasLsl  untere Grenze gesetzt
 * @property {boolean} hasUsl  obere Grenze gesetzt
 * @property {boolean} twoSided  beide Grenzen gesetzt
 * @property {number|null} lsl  untere Grenze
 * @property {number|null} usl  obere Grenze
 * @property {number|null} Cp  potenzielle Fähigkeit
 * @property {number|null} CPU  Fähigkeit zur oberen Grenze
 * @property {number|null} CPL  Fähigkeit zur unteren Grenze
 * @property {number|null} Cpk  tatsächliche Fähigkeit
 * @property {number|null} Pp  potenzielle Gesamtleistung
 * @property {number|null} PPU  Gesamtleistung zur oberen Grenze
 * @property {number|null} PPL  Gesamtleistung zur unteren Grenze
 * @property {number|null} Ppk  tatsächliche Gesamtleistung
 * @property {Array<number|null>|null} CpCI  Konfidenzintervall Cp
 * @property {Array<number|null>|null} CpkCI  Konfidenzintervall Cpk
 * @property {Array<number|null>|null} PpCI  Konfidenzintervall Pp
 * @property {Array<number|null>|null} PpkCI  Konfidenzintervall Ppk
 * @property {number} confidence  Konfidenzniveau als Anteil
 * @property {number|null} ppmAboveUsl  erwartete PPM über OSG, gesamt
 * @property {number|null} ppmBelowLsl  erwartete PPM unter USG, gesamt
 * @property {number|null} ppmTotal  erwartete PPM gesamt
 * @property {number|null} ppmWithinBelowLsl  erwartete PPM unter USG, innerhalb
 * @property {number|null} ppmWithinAboveUsl  erwartete PPM über OSG, innerhalb
 * @property {number|null} ppmWithinTotal  erwartete PPM innerhalb
 * @property {number|null} ppmObservedBelowLsl  beobachtete PPM unter USG
 * @property {number|null} ppmObservedAboveUsl  beobachtete PPM über OSG
 * @property {number|null} ppmObservedTotal  beobachtete PPM gesamt
 * @property {number|null} zBenchWithin  Z.bench innerhalb
 * @property {number|null} zBenchOverall  Z.bench gesamt
 * @property {number|null} sigmaLevel  Sigma-Niveau
 * @property {number|null} sigmaLevelShifted  Sigma-Niveau mit 1,5-Verschiebung
 * @property {'pass'|'warn'|'fail'} cpkStatus  Urteil zu Cpk
 * @property {'pass'|'warn'|'fail'|null} cpStatus  Urteil zu Cp
 * @property {'pass'|'warn'|'fail'} overall  Gesamturteil
 */

/**
 * Die Analyse zum Stand von Model und Arbeitsblatt (`analyze`).
 *
 * @typedef {object} Analysis
 * @property {Result|null} result  das Fähigkeitsergebnis, `null` solange die Eingaben nicht reichen
 * @property {string[]} methods  die für die Daten wählbaren Schätzer
 * @property {string} method  der verwendete Schätzer
 * @property {{ key: string, params: Record<string, any> }|null} hint  Hinweis zu Schätzer oder ID-Spalte, `null` ohne
 * @property {boolean} empty  weder Messspalte noch Beispieldaten gesetzt
 */

/**
 * Je Slot die wählbaren Spalten.
 *
 * @typedef {object} PickableColumns
 * @property {{ key: string, name: string }[]} value  Messspalten (numerisch)
 * @property {{ key: string, name: string }[]} subgroup  ID-Spalten: Blatt der Messspalte ohne diese
 */

/** Die elf Parameter in der Reihenfolge der Oberfläche. */
const PARAM_KEYS = ['name', 'lsl', 'target', 'usl', 'unit', 'confidence',
  'subgroupMode', 'subgroupSize', 'withinMethod', 'mrSpan', 'unbiased'];

/** Die Untergruppen-Arten. */
const SUBGROUP_MODES = ['size', 'column'];

/** Schätzer, deren Korrekturfaktor schaltbar ist. */
const UNBIASED_METHODS = ['pooled', 'sbar', 'sqrtMSSD'];

export const State = defineModel({
  version: '1.0',
  migrations: { '0→1.0': from0 },
  fields: {
    params: object({
      name: text(),
      unit: text({ default: 'mm' }),
      lsl: number({ nullable: true }),
      target: number({ nullable: true }),
      usl: number({ nullable: true }),
      confidence: number({ exclusiveMin: 0, nullable: true, default: (c) => c.confidenceLevel }),
      subgroupMode: oneOf(SUBGROUP_MODES, { default: 'size' }),
      subgroupSize: number({ integer: true, min: 1, default: 1 }),
      withinMethod: oneOf(['', ...WITHIN_METHODS], { default: '' }),
      unbiased: boolean({ default: true }),
      mrSpan: number({ integer: true, min: 2, max: 100, default: 2 }),
    }),
    columnRef: columnRef({ types: ['numeric'] }),
    subgroupColumnRef: columnRef(),
    embeddedValues: list(number(), { nullable: true }),
    embeddedLabel: text(),
  },
  view: {
    histogramChart: histogramChart.edits(),
  },
  invariants: {
    embeddedOrColumn: {
      fields: ['embeddedValues', 'columnRef'],
      test(m) { return !(m.embeddedValues && m.columnRef); },
    },
  },
  derived: {
    /**
     * Die Fähigkeitsanalyse: Ergebnis, wählbare Schätzer, Hinweis.
     *
     * @param {import('../../../core/source-reader.js').Source} src Leser des Arbeitsblatts
     * @this {import('./model.types.js').StateModel}
     * @returns {Analysis}
     */
    analysis(src) {
      return analyze(this, sourceColumns(src));
    },
    /**
     * Die Schlüssel, die `setParam` im aktuellen Stand annimmt.
     *
     * @param {import('../../../core/source-reader.js').Source} _src
     * @param {{ analysis: Analysis, subgroupModeValues: string[] }} d
     * @this {import('./model.types.js').StateModel}
     * @returns {(keyof Params)[]}
     */
    activeParams(_src, d) {
      const method = d.analysis.method;
      const sizeMode = this.embeddedValues || this.params.subgroupMode === 'size';
      return PARAM_KEYS.filter((key) => {
        if (key === 'subgroupSize') return sizeMode;
        if (key === 'mrSpan') return method === 'averageMR' || method === 'medianMR';
        if (key === 'unbiased') return UNBIASED_METHODS.includes(method);
        return true;
      });
    },
    /**
     * Die Werte von `subgroupMode`: Spalte nur ohne Beispieldaten.
     *
     * @this {import('./model.types.js').StateModel}
     * @returns {string[]}
     */
    subgroupModeValues() {
      return SUBGROUP_MODES.filter((m) => m !== 'column' || !this.embeddedValues);
    },
    /**
     * Die Werte von `withinMethod`: leer (Vorgabe der Daten) und die passenden Schätzer.
     *
     * @param {import('../../../core/source-reader.js').Source} _src
     * @param {{ analysis: Analysis }} d
     * @returns {string[]}
     */
    withinMethodOptions(_src, d) {
      return ['', ...d.analysis.methods];
    },
    /**
     * Die Spalten-Slots, die `setColumn` im aktuellen Stand annimmt.
     *
     * @this {import('./model.types.js').StateModel}
     * @returns {('value'|'subgroup')[]}
     */
    activeColumnSlots() {
      const columnMode = !this.embeddedValues && this.params.subgroupMode === 'column';
      return columnMode ? ['value', 'subgroup'] : ['value'];
    },
    /**
     * Je Slot die wählbaren Spalten; die ID-Spalte liegt auf dem Blatt der
     * Messspalte und ist nicht diese.
     *
     * @param {import('../../../core/source-reader.js').Source} src Leser des Arbeitsblatts
     * @this {import('./model.types.js').StateModel}
     * @returns {PickableColumns}
     */
    pickableColumns(src) {
      return {
        value: listColumns(src, { types: ['numeric'] }).map(columnOption),
        subgroup: listColumns(src, {})
          .filter((c) => subgroupAllowed(this.columnRef, c))
          .map(columnOption),
      };
    },
  },
  commands: {
    clearEmbedded: command({
      params: {},
      run() {
        this.embeddedValues = null;
        this.embeddedLabel = '';
      },
    }),
  },
});
