/**
 * D.Mike — RACI-Matrix Export: die Matrix als Zeilen (für `exports.table()`);
 * der Exporter macht daraus CSV und XLSX.
 */
import { cellKey } from '../domain/check.js';

/**
 * Kopf `[Aktivität, …Beteiligte]`, je Aktivität `[Name, …Rolle oder '']`.
 * Ohne Aktivitäten oder ohne Beteiligte `null`: dann entsteht keine Datei.
 * @param {{ activities: ReadonlyArray<{ id: string, name: string }>, stakeholders: ReadonlyArray<{ id: string, name: string }>, assignments: Readonly<Record<string, string>> }} m
 * @param {(key: string) => string} t Übersetzer des Moduls
 * @returns {string[][]|null}
 */
export function toRows(m, t) {
  if (m.activities.length === 0 || m.stakeholders.length === 0) return null;
  return [
    [t('activity'), ...m.stakeholders.map((s) => s.name)],
    ...m.activities.map((a) => [a.name, ...m.stakeholders.map((s) => m.assignments[cellKey(a.id, s.id)] ?? '')]),
  ];
}
