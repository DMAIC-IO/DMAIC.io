/**
 * D.Mike — Zielgrößenoptimierung: Model.
 *
 * Gespeichert werden die Vorgaben je Modell (`specs`, Schlüssel ist die
 * Modell-id, Einträge teilweise: fehlende Schlüssel kommen aus der Saat) und
 * das letzte Optimum mit den Modellen, über die es gerechnet wurde
 * (`optimization`, nur der Lauf `runOptimize` schreibt es). Ansicht: die
 * Editor-Einstellungen der Wirkungsfläche. Die Modelle selbst gehören den
 * Regressions- und GLM-Instanzen; die Ableitungen lesen sie über den Leser
 * und liefern Auswahl, wirksame Vorgaben, Sperrgründe und den Stand des
 * Ergebnisses.
 */
import { defineModel, command, text, number, boolean, oneOf, list, object, map, cell, unchecked } from '../../../core/model.js';
import { requireBoolean, requireEnum, requireNumber } from '../../../core/validate.js';
import contourChart from '../../../widgets/contour-chart/schema.js';
import { from0 } from './migrations.js';
import { readOwners, yRangeOf, effectiveSpec, selectedIdsOf } from './models.js';
import { diagnose, reasonText } from './diagnose.js';

/** @typedef {import('../../../core/source-reader.js').Source} Source */
/** @typedef {(key: string, params?: object) => string} T */

/** Zahlen in den Texten von `read()` wie die Altform mit Punkt. */
const READ_LANG = 'en';

/**
 * Ein gespeichertes Modell, wie diese Instanz es sieht.
 * @typedef {object} ModelRef
 * @property {string} id  Kennung des Modells
 * @property {string} name  Name des Modells
 * @property {string} instanceId  die Instanz, die es gespeichert hat
 * @property {string} moduleId  deren Modul
 * @property {number|null} rSqAdj  bereinigtes R²
 * @property {number|null} lofPValue  p-Wert des Anpassungsmangels
 * @property {string[]} factorNames  Faktoren
 * @property {number[]} yRange  kleinster und größter Trainingswert
 */

/**
 * Ein wählbares Modell.
 * @typedef {object} SelectableModel
 * @property {string} id  Kennung des Modells
 * @property {string} name  Name des Modells
 * @property {string} instanceId  die Instanz, die es gespeichert hat
 */

/**
 * Die wirksame Vorgabe einer Zielgröße.
 * @typedef {object} Spec
 * @property {boolean} selected  einbezogen
 * @property {'max'|'min'|'target'} kind  Wunschfunktion
 * @property {number} lower  Untergrenze
 * @property {number} upper  Obergrenze
 * @property {number} target  Zielwert
 * @property {number} weight  Gewicht
 */

/**
 * Das gespeicherte Optimum.
 * @typedef {object} Result
 * @property {Array<number|string|null>} xOpt  Faktoreinstellungen
 * @property {Array<number|null>} yPredictions  Vorhersagen je Zielgröße
 * @property {Array<number|null>} dPerResponse  Einzelwunschbarkeiten
 * @property {number} D  Gesamtwunschbarkeit
 * @property {string[]} factorNames  Faktoren
 * @property {string[]} modelNames  Zielgrößen
 * @property {number} iter  Iterationen
 */

/**
 * Die Modellsicht aus den gelesenen Datensätzen.
 * @param {Source} src
 * @returns {{ refs: ModelRef[], unread: string[] }}
 */
function modelView(src) {
  const { records, unread } = readOwners(src);
  return {
    unread,
    refs: records.map((r) => ({
      id: r.id,
      name: r.name,
      instanceId: r.instanceId,
      moduleId: r.moduleId,
      rSqAdj: typeof r.rSqAdj === 'number' && Number.isFinite(r.rSqAdj) ? r.rSqAdj : null,
      lofPValue: typeof r.lofPValue === 'number' && Number.isFinite(r.lofPValue) ? r.lofPValue : null,
      factorNames: Array.isArray(r.factorSpec) ? r.factorSpec.map((/** @type {any} */ f) => String(f?.name ?? '')) : [],
      yRange: yRangeOf(r),
    })),
  };
}

export class State extends defineModel({
  version: '1.0',
  migrations: { '0→1.0': from0 },
  fields: {
    specs: map(text(), object({
      selected: boolean({ optional: true }),
      kind: oneOf(['max', 'min', 'target'], { optional: true }),
      lower: number({ optional: true }),
      upper: number({ optional: true }),
      target: number({ optional: true }),
      weight: number({ optional: true, exclusiveMin: 0 }),
    }), { default: {} }),
    optimization: object({
      modelRefs: list(text()),
      result: object({
        xOpt: list(cell()),
        yPredictions: list(number({ nullable: true })),
        dPerResponse: list(number({ nullable: true })),
        D: number(),
        factorNames: list(text()),
        modelNames: list(text()),
        iter: number(),
      }),
    }, { nullable: true, agentWrite: false }),
  },
  view: {
    contourEdits: contourChart.edits(),
  },
  invariants: {
    specBounds: {
      fields: ['specs'],
      test(m) {
        return Object.values(m.specs).every((e) => !(typeof e.lower === 'number' && typeof e.upper === 'number') || e.lower < e.upper);
      },
      repair(m) {
        /** @type {Record<string, any>} */
        const next = {};
        for (const [id, e] of Object.entries(m._v.specs)) {
          const bad = typeof e?.lower === 'number' && typeof e?.upper === 'number' && e.lower >= e.upper;
          if (!bad) { next[id] = e; continue; }
          const { upper: _drop, ...rest } = e;
          next[id] = rest;
        }
        m._v.specs = next;
      },
    },
  },
  commands: {
    setSpec: command({
      params: { modelId: text({ nonEmpty: true }), key: oneOf(['selected', 'kind', 'lower', 'upper', 'target', 'weight']), value: unchecked() },
      /**
       * Eine Vorgabe eines Modells setzen; nur dieser Schlüssel wird gespeichert.
       * @param {{ modelId: string, key: 'selected'|'kind'|'lower'|'upper'|'target'|'weight', value: unknown }} p
       */
      run({ modelId, key, value }) {
        /** @type {boolean|string|number} */
        let v;
        if (key === 'selected') v = requireBoolean('value', value);
        else if (key === 'kind') { requireEnum('value', value, ['max', 'min', 'target']); v = /** @type {string} */ (value); }
        else if (key === 'weight') v = requireNumber('value', value, { exclusiveMin: 0 });
        else v = requireNumber('value', value);
        this.specs = { ...this.specs, [modelId]: { ...(this.specs[modelId] ?? {}), [key]: v } };
      },
    }),
  },
  derived: {
    /**
     * Die gespeicherten Modelle der Regressions- und GLM-Instanzen in
     * Projektreihenfolge.
     * @param {Source} src Leser fremder Instanzen
     * @returns {ModelRef[]}
     */
    models(src) {
      return modelView(src).refs;
    },
    /**
     * Die Instanzen mit Modellen, die noch nicht gelesen werden konnten (Modul
     * nicht geladen); leer, sobald alle gelesen sind.
     * @param {Source} src Leser fremder Instanzen
     * @returns {string[]}
     */
    unreadOwners(src) {
      return modelView(src).unread;
    },
    /**
     * Die wählbaren Modelle als Verweise.
     * @param {Source} _src
     * @param {any} d
     * @returns {SelectableModel[]}
     */
    selectableModels(_src, d) {
      return /** @type {ModelRef[]} */ (d.models).map((m) => ({ id: m.id, name: m.name, instanceId: m.instanceId }));
    },
    /**
     * Die wirksame Vorgabe je wählbarem Modell: gespeicherte Schlüssel über
     * der Saat aus den Modelldaten.
     * @param {Source} _src
     * @param {any} d
     * @this {import('./model.types.js').StateModel}
     * @returns {Record<string, Spec>}
     */
    effectiveSpecs(_src, d) {
      /** @type {Record<string, Spec>} */
      const out = {};
      for (const m of /** @type {ModelRef[]} */ (d.models)) {
        out[m.id] = /** @type {Spec} */ (effectiveSpec(this.specs[m.id], /** @type {[number, number]} */ (m.yRange)));
      }
      return out;
    },
    /**
     * Gespeicherte Vorgaben ohne lesbares Modell; leer, solange ein Besitzer
     * ungelesen ist.
     * @param {Source} _src
     * @param {any} d
     * @this {import('./model.types.js').StateModel}
     * @returns {string[]}
     */
    missingModels(_src, d) {
      if (/** @type {string[]} */ (d.unreadOwners).length > 0) return [];
      const have = new Set(/** @type {ModelRef[]} */ (d.models).map((m) => m.id));
      return Object.keys(this.specs).filter((id) => !have.has(id));
    },
    /**
     * Die Gründe, die das Optimieren der gewählten Modelle sperren, als Texte.
     * @param {Source} _src
     * @param {any} d
     * @param {T} t Übersetzer des Moduls
     * @this {import('./model.types.js').StateModel}
     * @returns {string[]}
     */
    diagnosticReasons(_src, d, t) {
      const models = /** @type {ModelRef[]} */ (d.models);
      return diagnose(selectedIdsOf(this.specs, models.map((m) => m.id)), models).map((r) => reasonText(r, t, READ_LANG));
    },
    /**
     * Optimieren rechnet: mindestens ein gewähltes Modell und kein Sperrgrund.
     * @param {Source} _src
     * @param {any} d
     * @this {import('./model.types.js').StateModel}
     * @returns {boolean}
     */
    canOptimize(_src, d) {
      const models = /** @type {ModelRef[]} */ (d.models);
      const ids = models.map((m) => m.id);
      // Ein gewähltes Modell, dessen Besitzer noch ungelesen ist, fehlte sonst
      // still im Optimum der übrigen.
      if (/** @type {string[]} */ (d.unreadOwners).length > 0
        && Object.entries(this.specs).some(([id, e]) => e.selected === true && !ids.includes(id))) return false;
      const selected = selectedIdsOf(this.specs, ids);
      return selected.length > 0 && diagnose(selected, models).length === 0;
    },
    /**
     * Das gespeicherte Optimum; `null` vor dem ersten Lauf.
     * @this {import('./model.types.js').StateModel}
     * @returns {Result|null}
     */
    result() {
      return this.optimization ? /** @type {Result} */ (JSON.parse(JSON.stringify(this.optimization.result))) : null;
    },
    /**
     * Ein Modell des Optimums ist nicht mehr vorhanden; falsch ohne Optimum
     * und solange ein Besitzer ungelesen ist.
     * @param {Source} _src
     * @param {any} d
     * @this {import('./model.types.js').StateModel}
     * @returns {boolean}
     */
    resultStale(_src, d) {
      if (!this.optimization || /** @type {string[]} */ (d.unreadOwners).length > 0) return false;
      const have = new Set(/** @type {ModelRef[]} */ (d.models).map((m) => m.id));
      return this.optimization.modelRefs.some((id) => !have.has(id));
    },
  },
}) {
  /**
   * Inhalt hat die Instanz mit einem Optimum oder einem gewählten Modell.
   * @returns {boolean}
   */
  hasContent() {
    return this.optimization != null || Object.values(this.specs).some((e) => e.selected === true);
  }
}
