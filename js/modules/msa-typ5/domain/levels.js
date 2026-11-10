/**
 * D.Mike — MSA Typ 5: Stufen der Bewertungen (reine Funktionen).
 */

/**
 * Leere Zelle: null, undefined oder leerer Text.
 * @param {*} v @returns {boolean}
 */
export const blank = (v) => v === null || v === undefined || v === '';

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
  const all = sortedLevels(values);
  const firstTwo = [mostFrequentLevel(values), secondFrequent(values, all)];

  const pos = (positiveLevel && all.includes(positiveLevel)) ? positiveLevel : firstTwo[0];
  const neg = firstTwo.find((v) => v !== pos) ?? all.find((v) => v !== pos);
  return { all, positive: pos ?? null, negative: neg ?? null };
}

/** @param {Array<*>} values @returns {string[]} vorkommende Werte, zahlenbewusst sortiert */
function sortedLevels(values) {
  const unique = [...new Set(values.filter((v) => !blank(v)).map((v) => String(v)))];
  return unique.length > 0 && unique.every((v) => Number.isFinite(Number(v)))
    ? unique.sort((a, b) => Number(a) - Number(b))
    : unique.sort();
}

/** @param {Array<*>} values @returns {string[]} Werte nach Häufigkeit absteigend (Gleichstand: Reihenfolge des Auftretens) */
function byFrequency(values) {
  const counts = new Map();
  for (const v of values) {
    if (blank(v)) continue;
    const k = String(v);
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
}

/** @param {Array<*>} values @param {string[]} all @returns {string|undefined} */
function secondFrequent(values, all) {
  return byFrequency(values)[1] ?? all[1];
}

/**
 * Häufigster Rohwert der Bewertungsspalte(n); ohne Werte null.
 * @param {Array<*>|null} values Rohwerte
 * @returns {string|null}
 */
export function mostFrequentLevel(values) {
  if (!values) return null;
  return byFrequency(values)[0] ?? sortedLevels(values)[0] ?? null;
}

/**
 * Stufenreihenfolge für die Engine, aus den Zeilen der Analyse: ordinal
 * zahlenbewusst, sonst einfach sortiert; binär mit der positiven Stufe vorn.
 * @param {string} type 'binary' | 'nominal' | 'ordinal'
 * @param {Array<{ value: string }>} rows
 * @param {string|null} positive gespeicherte positive Stufe des Models
 * @param {string|null} [fallback] häufigster Rohwert (`mostFrequentLevel`), wenn die gespeicherte Stufe in den Zeilen fehlt
 * @returns {string[]}
 */
export function engineLevels(type, rows, positive, fallback = null) {
  const values = [...new Set(rows.map((r) => r.value))];
  if (type === 'ordinal') {
    return values.every((v) => Number.isFinite(Number(v)))
      ? values.sort((a, b) => Number(a) - Number(b))
      : values.sort();
  }
  const levels = values.sort();
  if (type !== 'binary') return levels;
  const first = (positive && levels.includes(positive)) ? positive : fallback;
  return first && levels.includes(first) ? [first, ...levels.filter((v) => v !== first)] : levels;
}
