/**
 * D.Mike — Bausteine der Diagramm-Widgets (chart-parts.js)
 *
 * Ein Basisstück mit den Schlüsseln aller Diagrammtypen, dazu je Typ seine
 * Schlüssel und Reihen. `editable: true` markiert, was der Diagramm-Editor
 * ändern darf; daraus entsteht `edits()`, die Feldart der gespeicherten
 * Editor-Einstellungen (alles optional, Reihen mit Namen als Schlüssel).
 * Rein: importiert nur core/model.js.
 */
import { defineWidget, text, number, boolean, oneOf, list, object } from '../core/model.js';

const opt = { optional: true };
const ed = { optional: true, editable: true };

/** Bezugslinie, wie der Diagramm-Editor sie schreibt. */
export const REF_LINE = object({
  dir: oneOf(['h', 'v']), value: number(),
  label: text(opt), showLabel: boolean(opt), dash: oneOf(['solid', 'dash', 'dot', 'dashdot', 'longdash'], opt), width: number(opt), color: text(opt),
});
/** Bezugsbereich, wie der Diagramm-Editor ihn schreibt. */
export const REF_AREA = object({
  dir: oneOf(['x', 'y']), min: number(), max: number(),
  label: text(opt), color: text(opt),
});

/** Schlüssel aller Typen (ChartBase). */
export const BASE = Object.freeze({
  title: text(ed), showTitle: boolean(ed), xLabel: text(ed), yLabel: text(ed),
  showXLabel: boolean(ed), showYLabel: boolean(ed), showLegend: boolean(ed),
  titleSize: number({ ...ed, min: 6, max: 48 }), labelSize: number({ ...ed, min: 6, max: 48 }), tickSize: number({ ...ed, min: 6, max: 48 }),
  showXTicks: boolean(ed), showYTicks: boolean(ed), bgColor: text({ ...ed, nullable: true }),
  refLines: list(REF_LINE, ed), refAreas: list(REF_AREA, ed),
  xMin: number({ ...opt, nullable: true }), xMax: number({ ...opt, nullable: true }),
  yMin: number({ ...opt, nullable: true }), yMax: number({ ...opt, nullable: true }),
  fileName: text(opt),
});

/** @param {Record<string, any>} shape @returns {string[]} */
const editableOf = (shape) => Object.keys(shape).filter((k) => shape[k].editable === true);
/** @param {Record<string, any>} shape @param {string[]} keys @returns {Record<string, any>} */
const pick = (shape, keys) => Object.fromEntries(keys.map((k) => [k, shape[k]]));

/**
 * Ein Diagramm-Widget für einen Typ des Chart-Frameworks.
 * @param {{ name: string, type: string, keys?: Record<string, any>, series?: Record<string, any>|null }} def
 * @returns {Readonly<any>}
 */
export function chartWidget({ name, type, keys = {}, series = null }) {
  const baseShape = { ...BASE, ...keys };
  const shape = { ...baseShape, ...(series ? { series: list(object(series), opt) } : {}) };
  const baseKeys = editableOf(baseShape);
  const seriesKeys = series ? editableOf(series) : [];
  const edits = object({
    ...pick(baseShape, baseKeys),
    ...(series ? { series: list(object({ name: text(), ...pick(series, seriesKeys) }), opt) } : {}),
  });
  return defineWidget({
    name,
    props: { config: object(shape, { nullable: true }), legacyEditKey: text(opt) },
    value: edits,
    api: { chartType: type, edits: () => edits, editable: Object.freeze({ base: Object.freeze(baseKeys), series: Object.freeze(seriesKeys) }) },
  });
}
