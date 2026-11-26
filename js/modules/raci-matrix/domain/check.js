/**
 * D.Mike — RACI-Matrix: Rollen, Zellschlüssel und die Prüfung je Aktivität.
 *
 * Rein: keine Texte, kein DOM. Die Befunde sind Codes (`noR`, `noA`,
 * `multiA`); übersetzt werden sie in der Ansicht.
 */

/** Die vier Rollen in der Reihenfolge des Zellenklicks. */
export const ROLES = Object.freeze(['R', 'A', 'C', 'I']);

/**
 * Der Schlüssel einer Zelle in `assignments`.
 * @param {string} activityId @param {string} stakeholderId
 * @returns {string} `<activityId>:<stakeholderId>`
 */
export function cellKey(activityId, stakeholderId) {
  return `${activityId}:${stakeholderId}`;
}

/**
 * Die nächste Rolle im Zyklus `'' → R → A → C → I → ''`. Ein fremder Wert gilt
 * als „ohne Rolle“ und wird `R`.
 * @param {string} role @returns {string}
 */
export function nextRole(role) {
  const i = ROLES.indexOf(role);
  if (i < 0) return ROLES[0];
  return i + 1 < ROLES.length ? ROLES[i + 1] : '';
}

/**
 * Die Befunde je Aktivität, in Zeilenreihenfolge; nur Zeilen mit Befund. Die
 * Codes stehen in der Reihenfolge `noR`, `noA`, `multiA`. Ohne Beteiligte hat
 * jede Aktivität `noR` und `noA`.
 * @param {{ activities: ReadonlyArray<{ id: string }>, stakeholders: ReadonlyArray<{ id: string }>, assignments: Readonly<Record<string, string>> }} m
 * @returns {{ activityId: string, issues: string[] }[]}
 */
export function checkRows(m) {
  const out = [];
  for (const a of m.activities) {
    const count = { R: 0, A: 0 };
    for (const s of m.stakeholders) {
      const r = m.assignments[cellKey(a.id, s.id)];
      if (r === 'R' || r === 'A') count[r] += 1;
    }
    const issues = [];
    if (count.R === 0) issues.push('noR');
    if (count.A === 0) issues.push('noA');
    if (count.A > 1) issues.push('multiA');
    if (issues.length) out.push({ activityId: a.id, issues });
  }
  return out;
}
