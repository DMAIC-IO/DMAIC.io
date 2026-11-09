/**
 * D.Mike — Morphologischer Kasten: Kombinationen zählen.
 *
 * Reine Funktionen ohne Model: Schlüssel eines Optionspaars und die Zahl der
 * widerspruchsfreien Kombinationen (je Parameter eine Option).
 */

/** Suchschritte, nach denen die Zählung der widerspruchsfreien Kombinationen mit einer Untergrenze endet. */
export const COUNT_BUDGET = 200000;

/**
 * Schlüssel eines ungeordneten Optionspaars.
 * @param {string} a
 * @param {string} b
 * @returns {string}
 */
export function pairKey(a, b) {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/**
 * Die Kombinationen (je Parameter mit Optionen eine Option) zählen, die kein
 * unverträgliches Paar enthalten. Backtracking, das einen Zweig abschneidet,
 * sobald die neue Wahl mit einer früheren kollidiert; nach `budget` besuchten
 * Knoten endet es und meldet die bisherige Zahl als Untergrenze.
 * @param {ReadonlyArray<{ options: ReadonlyArray<{ id: string }> }>} parameters
 * @param {Set<string>} conflictKeys Schlüssel aus `pairKey`
 * @param {number} [budget]
 * @returns {{ count: number, exact: boolean }}
 */
export function countConsistent(parameters, conflictKeys, budget = COUNT_BUDGET) {
  const levels = parameters.filter(p => p.options.length > 0).map(p => p.options.map(o => o.id));
  if (levels.length === 0) return { count: 0, exact: true };
  if (conflictKeys.size === 0) {
    return { count: levels.reduce((n, opts) => n * opts.length, 1), exact: true };
  }
  const picked = [];
  let count = 0;
  let steps = 0;
  let exact = true;
  const visit = (depth) => {
    if (depth === levels.length) { count++; return; }
    for (const id of levels[depth]) {
      if (++steps > budget) { exact = false; return; }
      if (picked.some(p => conflictKeys.has(pairKey(p, id)))) continue;
      picked.push(id);
      visit(depth + 1);
      picked.pop();
      if (!exact) return;
    }
  };
  visit(0);
  return { count, exact };
}
