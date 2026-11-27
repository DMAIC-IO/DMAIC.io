/**
 * D.Mike — Regression: Übernahme aus dem Versuchsplaner (domain/design-preset.js). Rein.
 *
 * `experimentOptions` bildet aus den Versuchen der Planer-Instanzen die
 * Übernahme-Optionen (je Planer × Antwort × Variante, wie die Altform
 * `listExperimentImports`). `designPreset` rechnet aus den geplanten Termen
 * und den Daten die Polynom-Vorgabe (wie die Altform `applyDesignTerms`):
 * Grad = höchste Termordnung; ausgeschlossen sind erzeugte Terme außerhalb
 * des Plans, Terme, die die Daten nicht schätzen können (vermengt), und —
 * ließe das Modell keinen Restfreiheitsgrad — die letzten Terme in
 * hierarchischer Folge. `importArgsOf` macht aus einer Option die Angaben des
 * Kommandos `importExperiment`; `pendingPresetFields` rechnet die offene
 * Vorgabe, die das Kommando hinterlässt, sobald die Daten lesbar sind.
 */
import { generatePolynomialTerms, compileModelSpec, estimableTerms } from '../../../engines/regression-engine.js';
import { defaultActiveTerms, quadTermId, parseTermId, compareTermIds } from '../../../engines/doe-terms.js';
import { readInputs, polyData } from './analyze.js';
import { noticeBasis } from './columns.js';

/**
 * Der Versuch einer Planer-Instanz; `experiment` ist `null`, solange der
 * Planer kein Arbeitsblatt hat.
 * @typedef {{ plannerId: string, experiment: any }} PlannerExperiment
 */

/**
 * Eine Übernahme-Option.
 * @typedef {object} ImportOption
 * @property {string} key  `<planner>|raw|mean|lnvar|<Antwort>`
 * @property {string} label  Versuchsname — Antwort (Variante)
 * @property {Array<{ instanceId: string, sheetId: string, columnId: string }>} factorRefs  Faktorspalten
 * @property {{ instanceId: string, sheetId: string, columnId: string }} yRef  Antwortspalte
 * @property {string[]} designTerms  geplante Terme (kanonisch)
 * @property {string} experimentId  Planer-Instanz
 * @property {string} sourceColumn  Spalten-id der Antwort
 * @property {'identity'|'mean'|'lnvar'} transform  Variante
 */

/**
 * @param {PlannerExperiment[]} experiments
 * @returns {ImportOption[]}
 */
export function experimentOptions(experiments) {
  /** @type {ImportOption[]} */
  const out = [];
  for (const { plannerId: expId, experiment: exp } of experiments ?? []) {
    if (!exp) continue;
    const wsRef = exp?.runMatrix?.worksheetRef;
    const tags = exp?.runMatrix?.columnTags;
    if (!wsRef || !tags) continue;
    const at = (/** @type {string} */ columnId) => ({ instanceId: wsRef.instanceId, sheetId: wsRef.sheetId, columnId });
    const factorRefs = tags.factors.map(at);
    const k = tags.factors.length;
    const designTerms = Array.isArray(exp.plannedTerms?.terms)
      ? [...exp.plannedTerms.terms]
      : [...defaultActiveTerms(k),
        ...Array.from({ length: k }, (_, i) => (exp.factors?.[i]?.kind === 'categorical' ? null : quadTermId(i))).filter(Boolean)]
        .sort(compareTermIds);
    const expLabel = exp.name || `DoE ${expId.slice(0, 6)}`;
    (exp.responseColumns || []).forEach((/** @type {any} */ resp, /** @type {number} */ i) => {
      const base = { factorRefs, designTerms, experimentId: expId };
      out.push({ ...base, key: `${expId}|raw|${i}`, label: `${expLabel} — ${resp.name}`, yRef: at(resp.columnId), sourceColumn: resp.columnId, transform: 'identity' });
      if (resp.meanColumnId) {
        out.push({ ...base, key: `${expId}|mean|${i}`, label: `${expLabel} — ${resp.name} (Mean)`, yRef: at(resp.meanColumnId), sourceColumn: resp.meanColumnId, transform: 'mean' });
      }
      if (resp.lnVarColumnId) {
        out.push({ ...base, key: `${expId}|lnvar|${i}`, label: `${expLabel} — ${resp.name} (lnVar)`, yRef: at(resp.lnVarColumnId), sourceColumn: resp.lnVarColumnId, transform: 'lnvar' });
      }
    });
  }
  return out;
}

/**
 * Die Vorgabe aus dem Versuch.
 * @typedef {object} Preset
 * @property {1|2|3} polyDegree  Grad
 * @property {string[]} excludedTerms  ausgeschlossene Terme
 * @property {{ aliased: Array<{ term: string, with: string[] }>, saturated: string[] }} notice  Hinweis
 */

/**
 * @param {string[]} designTerms  kanonische Term-ids des Plans
 * @param {any[]} predictors  in der Folge der X
 * @param {{ columns: Record<string, any[]>, y: number[] }} data  gefilterte Zeilen
 * @returns {Preset}
 */
export function designPreset(designTerms, predictors, data) {
  const names = predictors.map((p) => p.id);
  /** @type {string[]} */
  const wanted = [];
  for (const canon of [...designTerms].sort(compareTermIds)) {
    const t = parseTermId(canon);
    if (!t || t.factors.some((/** @type {number} */ f) => f >= names.length)) continue;
    if (t.kind === 'main') wanted.push(names[t.factors[0]]);
    else if (t.kind === 'quad') {
      if (predictors[t.factors[0]].kind === 'categorical') continue;
      wanted.push(`${names[t.factors[0]]}²`);
    } else wanted.push(t.factors.map((/** @type {number} */ f) => names[f]).join('·'));
  }
  // X → 1, X² oder X·Y → 2, X·Y·Z → 3 (kanonische ids ergeben nie X³ oder X²·Y).
  const order = (/** @type {string} */ id) => {
    const parts = id.split('·').length;
    if (parts >= 3) return 3;
    return (parts === 2 || id.endsWith('²')) ? 2 : 1;
  };
  const degree = /** @type {1|2|3} */ (Math.min(3, Math.max(1, ...wanted.map(order))));
  const generated = generatePolynomialTerms(predictors, degree);
  const byId = new Map(generated.map((/** @type {any} */ term) => [term.id, term]));
  const wantedTerms = wanted.filter((id) => byId.has(id)).map((id) => byId.get(id));

  const compiled = compileModelSpec({ predictors, terms: wantedTerms }, data);
  const n = data.y.length;
  const blocks = compiled.blockMap.map((/** @type {any} */ b) => ({
    id: b.id, columns: b.columnIndices.map((/** @type {number} */ ci) => compiled.X.map((/** @type {number[]} */ row) => row[ci])),
  }));
  const { kept, aliased } = estimableTerms(blocks, n);

  const width = new Map(compiled.blockMap.map((/** @type {any} */ b) => [b.id, b.columnIndices.length]));
  let used = kept.reduce((/** @type {number} */ sum, /** @type {string} */ id) => sum + width.get(id), 0);
  const keptTerms = kept.filter((/** @type {string} */ id) => id !== 'Intercept');
  /** @type {string[]} */
  const saturated = [];
  while (n - used < 1 && keptTerms.length > 0) {
    const dropped = keptTerms.pop();
    used -= width.get(dropped);
    saturated.unshift(dropped);
  }
  const keepSet = new Set(keptTerms);
  return {
    polyDegree: degree,
    excludedTerms: generated.map((/** @type {any} */ term) => term.id).filter((/** @type {string} */ id) => !keepSet.has(id)),
    notice: { aliased: aliased.map((/** @type {any} */ a) => ({ term: a.id, with: [...a.with] })), saturated },
  };
}

/**
 * Die Vorgabe aus den Spalten des Arbeitsblatts; `null`, wenn eine Spalte
 * nicht lesbar ist oder unter drei Zeilen gelten (dann rechnete die Altform
 * die Vorgabe nicht, sie blieb offen).
 * @param {string[]} designTerms
 * @param {import('../../../core/source-reader.js').Source} src
 * @param {{ colRefs: readonly any[], yRef: any }} refs
 * @returns {Preset|null}
 */
export function presetFromColumns(designTerms, src, refs) {
  if (!Array.isArray(designTerms) || designTerms.length === 0 || refs.colRefs.length === 0 || !refs.yRef) return null;
  const cols = readInputs(/** @type {any} */ (refs), src);
  if (!cols) return null;
  const { predictors, data } = polyData(cols.xs, cols.y);
  if (data.y.length < 3) return null;
  return designPreset(designTerms, predictors, data);
}

/**
 * Die Angaben des Kommandos `importExperiment` zu einer Option.
 * @param {ImportOption} o
 * @returns {import('./model.js').ImportArgs}
 */
export function importArgsOf(o) {
  return {
    colRefs: o.factorRefs.map((r) => ({ ...r })),
    yRef: { ...o.yRef },
    designTerms: [...o.designTerms],
    source: { experimentId: o.experimentId, sourceColumn: o.sourceColumn, transform: o.transform },
  };
}

/**
 * Die Felder, mit denen eine offene Vorgabe aufgeht: Grad, ausgeschlossene
 * Terme, Hinweis (mit `basis` zum neuen Grad) und die geleerte Vorgabe;
 * `null`, solange keine offen ist, die Form kein Polynom ist oder die Daten
 * sie nicht tragen (Spalte fehlt, unter drei Zeilen) — dann bleibt sie offen.
 * @param {{ pendingDesignTerms: readonly string[], regType: string, colRefs: readonly any[], yRef: any }} model
 * @param {import('../../../core/source-reader.js').Source} src
 * @returns {{ polyDegree: 1|2|3, excludedTerms: string[], designNotice: { aliased: Array<{ term: string, with: string[] }>, saturated: string[], basis: string }, pendingDesignTerms: string[] }|null}
 */
export function pendingPresetFields(model, src) {
  const terms = model.pendingDesignTerms;
  if (!terms || terms.length === 0 || model.regType !== 'polynomial') return null;
  const p = presetFromColumns([...terms], src, { colRefs: model.colRefs, yRef: model.yRef });
  if (!p) return null;
  return {
    polyDegree: p.polyDegree,
    excludedTerms: p.excludedTerms,
    designNotice: { ...p.notice, basis: noticeBasis(model.colRefs, model.yRef, p.polyDegree) },
    pendingDesignTerms: [],
  };
}
