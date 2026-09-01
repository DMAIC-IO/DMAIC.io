/**
 * D.Mike — Multi-Vari Model (multi-vari-model.js)
 *
 * Reiner Zustandsbehälter: die referenzierte Messwertspalte, die **geordnete**
 * Faktorliste, Modellform, Schätzer und die Darstellungsschalter.
 *
 * Die Reihenfolge der Faktoren ist die zentrale Eingabe des Moduls — sie legt
 * Achse, Serie, Panel-Spalte und Panel-Zeile fest und zugleich, was im
 * geschachtelten Modell in was steckt. Deshalb halten die Zeilen eine eigene
 * `id`: `x-for :key` und `draggableRows` adressieren beide über Ids, über den
 * Arrayindex gekoppelt verlöre die Liste beim Umsortieren ihren DOM-Zustand.
 *
 * Enthält keine Statistik und kein i18n. Gruppierung:
 * `js/engines/multi-vari-engine.js`, Varianzzerlegung:
 * `js/engines/variance-components-engine.js`.
 */

import { uid } from '../../core/uid.js';
import { MIN_FACTORS, MAX_FACTORS } from '../../engines/multi-vari-engine.js';

/** Gültige Modellformen. */
export const MODEL_FORMS = ['nested', 'crossed'];

/** Gültige Schätzer. */
export const ESTIMATORS = ['anova', 'reml'];

/**
 * Spaltenreferenz aus persistiertem JSON, oder null.
 * @param {*} d
 * @returns {{instanceId:string,sheetId:string,columnId:string}|null}
 */
function columnRefFromJSON(d) {
  if (!d || typeof d !== 'object') return null;
  if (d.instanceId == null || d.sheetId == null || d.columnId == null) return null;
  return {
    instanceId: String(d.instanceId),
    sheetId: String(d.sheetId),
    columnId: String(d.columnId),
  };
}

export class State {
  /** Referenzierte Messwertspalte. */
  columnRefs = { measurement: null };

  /**
   * Geordnete Faktorzeilen. Position 0 → X-Achse und äußerste Schachtelung,
   * 1 → Serie, 2 → Panel-Spalte, 3 → Panel-Zeile.
   * @type {Array<{id: string, ref: object|null}>}
   */
  factors = [{ id: uid(), ref: null }, { id: uid(), ref: null }];

  /** `'nested'` (A > B(A) > …) oder `'crossed'` (A, B, A×B, …). */
  modelForm = 'nested';

  /** `'anova'` (Henderson I) oder `'reml'`. */
  estimator = 'anova';

  showPoints = true;
  connectMeans = true;
  showGroupMean = true;
  showRefLine = true;

  /** Instanz-Id eines von loadExample bereitgestellten Worksheets. */
  exampleWorksheetId = null;

  /** @returns {boolean} true, sobald Messwert und mindestens zwei Faktoren stehen. */
  hasContent() {
    return Boolean(this.columnRefs.measurement)
      && this.selectedFactors().length >= MIN_FACTORS;
  }

  /** @returns {Array<{id: string, ref: object}>} belegte Faktorzeilen in Reihenfolge. */
  selectedFactors() {
    return this.factors.filter(f => f.ref);
  }

  /** Eine leere Faktorzeile anhängen, bis MAX_FACTORS erreicht ist. */
  addFactor() {
    if (this.factors.length >= MAX_FACTORS) return;
    this.factors.push({ id: uid(), ref: null });
  }

  /** Zeile entfernen, solange MIN_FACTORS Zeilen bleiben. */
  removeFactor(id) {
    if (this.factors.length <= MIN_FACTORS) return;
    this.factors = this.factors.filter(f => f.id !== id);
  }

  /** Zeile `sourceId` direkt vor `targetId` einsortieren. */
  moveFactorBefore(sourceId, targetId) {
    if (sourceId === targetId) return;
    const from = this.factors.findIndex(f => f.id === sourceId);
    const to = this.factors.findIndex(f => f.id === targetId);
    if (from < 0 || to < 0) return;
    const [row] = this.factors.splice(from, 1);
    this.factors.splice(this.factors.findIndex(f => f.id === targetId), 0, row);
  }

  /** Spaltenreferenz einer Zeile setzen. */
  setFactorRef(id, ref) {
    const row = this.factors.find(f => f.id === id);
    if (row) row.ref = ref || null;
  }

  /**
   * Serialisiert den Zustand. `factorRows` hält die Zeilen mit ihren Ids,
   * `columnRefs.factors` spiegelt dieselben Referenzen zusätzlich flach.
   * @returns {object} Persistierbarer Zustand.
   */
  toJSON() {
    return {
      columnRefs: {
        measurement: this.columnRefs.measurement ? { ...this.columnRefs.measurement } : null,
        // Zusätzlich flach — so laden die in der Spec beschriebenen
        // Beispiel-JSONs unverändert.
        factors: this.selectedFactors().map(f => ({ ...f.ref })),
      },
      factorRows: this.factors.map(f => ({ id: f.id, ref: f.ref ? { ...f.ref } : null })),
      modelForm: this.modelForm,
      estimator: this.estimator,
      showPoints: this.showPoints,
      connectMeans: this.connectMeans,
      showGroupMean: this.showGroupMean,
      showRefLine: this.showRefLine,
      exampleWorksheetId: this.exampleWorksheetId,
    };
  }

  /**
   * Deserialisieren und validieren. Liefert immer einen gültigen State.
   * @param {*} d
   * @returns {State}
   */
  static fromJSON(d) {
    const s = new State();
    if (!d || typeof d !== 'object') return s;

    const refs = d.columnRefs && typeof d.columnRefs === 'object' ? d.columnRefs : {};
    s.columnRefs.measurement = columnRefFromJSON(refs.measurement);

    let rows = null;
    if (Array.isArray(d.factorRows)) {
      rows = d.factorRows.map(r => ({
        id: typeof r?.id === 'string' ? r.id : uid(),
        ref: columnRefFromJSON(r?.ref),
      }));
    } else if (Array.isArray(refs.factors)) {
      rows = refs.factors.map(r => ({ id: uid(), ref: columnRefFromJSON(r) }));
    }
    if (rows) {
      rows = rows.slice(0, MAX_FACTORS);
      while (rows.length < MIN_FACTORS) rows.push({ id: uid(), ref: null });
      s.factors = rows;
    }

    if (MODEL_FORMS.includes(d.modelForm)) s.modelForm = d.modelForm;
    if (ESTIMATORS.includes(d.estimator)) s.estimator = d.estimator;

    s.showPoints = d.showPoints !== false;
    s.connectMeans = d.connectMeans !== false;
    s.showGroupMean = d.showGroupMean !== false;
    s.showRefLine = d.showRefLine !== false;

    s.exampleWorksheetId = typeof d.exampleWorksheetId === 'string' ? d.exampleWorksheetId : null;
    return s;
  }
}
