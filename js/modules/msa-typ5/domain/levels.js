/**
 * D.Mike — MSA Typ 5: Stufen der Bewertungen (reine Funktionen).
 */

const blank = (v) => v === null || v === undefined || v === '';

/**
 * Rohwerte der Bewertungsspalte(n): im langen Layout die eine Spalte, im
 * breiten alle Bewertungsspalten hintereinander; null ohne gewählte Spalte.
 * @param {'long'|'wide'} layout
 * @param {Array<*>|null} longValues Werte der Bewertungsspalte (langes Layout)
 * @param {Array<Array<*>>} wideValues Werte je Bewertungsspalte (breites Layout)
 * @returns {Array<*>|null}
 */
export function ratingValues(layout, longValues, wideValues) {
  if (layout === 'wide') return wideValues && wideValues.length ? wideValues.flat() : null;
  return longValues ?? null;
}

/**
 * Stufen aus den Rohwerten: alle vorkommenden (zahlenbewusst sortiert), die
 * positive und die negative Stufe der Binärdarstellung.
 * @param {{ positiveLevel: string|null }} model
 * @param {Array<*>|null} values Rohwerte der Bewertungsspalte(n)
 * @returns {{ all: string[], positive: string|null, negative: string|null }}
 */
export function effectiveLevels({ positiveLevel }, values) {
  if (!values) return { all: [], positive: null, negative: null };
  const unique = [...new Set(values.filter((v) => !blank(v)).map((v) => String(v)))];
  const all = unique.length > 0 && unique.every((v) => Number.isFinite(Number(v)))
    ? unique.sort((a, b) => Number(a) - Number(b))
    : unique.sort();

  const counts = new Map();
  for (const v of values) {
    if (blank(v)) continue;
    const k = String(v);
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  const byCount = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
  const firstTwo = [byCount[0] ?? all[0], byCount[1] ?? all[1]];

  const pos = (positiveLevel && all.includes(positiveLevel)) ? positiveLevel : firstTwo[0];
  const neg = firstTwo.find((v) => v !== pos) ?? all.find((v) => v !== pos);
  return { all, positive: pos ?? null, negative: neg ?? null };
}

/**
 * Stufenreihenfolge für die Engine, aus den Zeilen der Analyse: ordinal
 * zahlenbewusst, sonst einfach sortiert; binär mit der positiven Stufe vorn.
 * @param {string} type 'binary' | 'nominal' | 'ordinal'
 * @param {Array<{ value: string }>} rows
 * @param {string|null} positive wirksame positive Stufe
 * @returns {string[]}
 */
export function engineLevels(type, rows, positive) {
  const values = [...new Set(rows.map((r) => r.value))];
  if (type === 'ordinal') {
    return values.every((v) => Number.isFinite(Number(v)))
      ? values.sort((a, b) => Number(a) - Number(b))
      : values.sort();
  }
  const levels = values.sort();
  if (type === 'binary' && positive && levels.includes(positive)) {
    return [positive, ...levels.filter((v) => v !== positive)];
  }
  return levels;
}
