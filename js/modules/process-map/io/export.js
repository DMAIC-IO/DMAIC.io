/**
 * D.Mike — Process Map Export: die Kette als Zeilen (für `exports.table()`
 * und `exports.tables()`; der Exporter macht daraus CSV und XLSX) und als
 * JSON-Baum (für `exports.tree()`). Reine Funktionen.
 */
import { stepNumber } from '../domain/loops.js';

/** Blattname der XLSX-Datei, wie in der Altform. */
export const XLSX_SHEET = 'Process Map';

/**
 * @typedef {import('../domain/model.types.js').StateFields['steps']} Steps
 * @typedef {Steps[number]} Step
 * @typedef {(key: string, params?: Record<string, unknown>) => string} T
 */

/** @param {Step['inputs'][number]} io @returns {string} Name mit „(x)“/„(n)“ je Input-Typ */
function inputText(io) {
  if (!io.name) return '';
  if (io.inputType === 'param') return `${io.name} (x)`;
  if (io.inputType === 'noise') return `${io.name} (n)`;
  return io.name;
}

/**
 * Loop-Spalte: Bedingung, Ziel „→ Schritt NN“ und Rework-Schritte in Klammern.
 * @param {Steps} steps @param {Step} s @param {T} t @returns {string}
 */
function loopText(steps, s, t) {
  if (!s.loop) return '';
  const parts = [];
  if (s.loop.condition) parts.push(s.loop.condition);
  if (s.loop.targetStepId) {
    const at = steps.findIndex((x) => x.id === s.loop?.targetStepId);
    if (at !== -1) parts.push(t('csvLoopTarget', { step: t('csvStep'), n: stepNumber(at) }));
  }
  const rework = s.loop.steps.map((l) => l.title).filter(Boolean);
  if (rework.length) parts.push(`[${rework.join(', ')}]`);
  return parts.join(' ');
}

/**
 * Kopf und je Schritt eine Zeile (Nummer als Zahl), darunter je Unterschritt
 * eine Zeile mit der Nummer „i.k“ als Text und dem eingerückten Titel.
 * Die Wertart steht als Langtext, Inputs mit Typ-Kürzel, leere Namen fehlen.
 * @param {Steps} steps @param {T} t Übersetzer des Moduls
 * @returns {Array<Array<string|number>>}
 */
export function toRows(steps, t) {
  /** @type {Array<Array<string|number>>} */
  const rows = [[t('csvStep'), t('csvTitle'), t('csvDescription'), t('csvValueType'),
    t('inputs'), t('outputs'), t('loopLabel')]];
  steps.forEach((s, i) => {
    rows.push([
      i + 1,
      s.title,
      s.description,
      s.valueType ? t(`${s.valueType}Long`) : '',
      s.inputs.map(inputText).filter(Boolean).join(', '),
      s.outputs.map((io) => io.name).filter(Boolean).join(', '),
      loopText(steps, s, t),
    ]);
    s.substeps.forEach((ss, k) => {
      rows.push([`${i + 1}.${k + 1}`, `  ${ss.title}`, '', '', '', '', '']);
    });
  });
  return rows;
}

/**
 * Strukturierter JSON-Export der Altform (`tool: 'ProcessMap'`).
 * @param {Steps} steps @param {string} timestamp ISO-Zeitstempel des Exports
 * @returns {object}
 */
export function toExportJSON(steps, timestamp) {
  return {
    tool: 'ProcessMap',
    timestamp,
    steps: steps.map((s, i) => ({
      step: i + 1,
      title: s.title,
      description: s.description,
      valueType: s.valueType || null,
      inputs: s.inputs.filter((io) => io.name).map((io) => ({
        name: io.name,
        ...(io.inputType ? { type: io.inputType } : {}),
      })),
      outputs: s.outputs.map((io) => io.name).filter(Boolean),
      substeps: s.substeps.map((ss, k) => ({ step: `${i + 1}.${k + 1}`, title: ss.title })),
      ...(s.loop ? {
        loop: {
          condition: s.loop.condition || '',
          targetStep: s.loop.targetStepId ? steps.findIndex((x) => x.id === s.loop?.targetStepId) + 1 : null,
          steps: s.loop.steps.map((ls) => ls.title),
        },
      } : {}),
    })),
  };
}
