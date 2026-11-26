/**
 * D.Mike — Zufallsgenerator: Anzeige.
 *
 * Reine Funktionen für Kennzahlkarten, Werteliste, Anteile und Häufigkeiten
 * in der App-Sprache. Keine Rechnung (die liegt in domain/), kein DOM.
 */
import { formatNumber, decimalSeparator, roundTo } from '../../../core/number-format.js';
import { frequencyShares, attrProbabilities } from '../domain/sample.js';

/** Höchstzahl der angezeigten Werte. */
export const DISPLAY_MAX = 2000;

/** Wert des Kontrollkästchens „neues Arbeitsblatt“ im Zielwähler. */
export const NEW_WORKSHEET = '__create_worksheet__';

/**
 * Eine Kennzahl mit vier Nachkommastellen, Beträge ab 10⁶ oder unter 0,001
 * (außer 0) in Exponentialschreibweise; Dezimalzeichen der Sprache.
 * @param {number|null} v @param {string} lang @returns {string}
 */
export function fmtStat(v, lang) {
  if (v === null || !Number.isFinite(v)) return formatNumber(v, lang);
  if (Math.abs(v) >= 1e6 || (Math.abs(v) < 0.001 && v !== 0)) return v.toExponential(4).replace('.', decimalSeparator(lang));
  return formatNumber(v, lang, { decimals: 4 });
}

/**
 * Ein erzeugter Wert: diskret ganz, stetig mit sechs Nachkommastellen.
 * @param {number|string} v @param {boolean} discrete @param {string} lang @returns {string}
 */
export function fmtValue(v, discrete, lang) {
  if (typeof v !== 'number') return String(v);
  return discrete ? formatNumber(v, lang, { profile: 'input' }) : formatNumber(v, lang, { decimals: 6 });
}

/**
 * Zähler über der Werteliste: `n` oder `2000 / n`.
 * @param {number} total @param {string} lang @returns {string}
 */
export function countLabel(total, lang) {
  const n = formatNumber(total, lang);
  return total > DISPLAY_MAX ? `${formatNumber(DISPLAY_MAX, lang)} / ${n}` : n;
}

/**
 * Farbe der Kategorie an Position i.
 * @param {number} i @returns {string}
 */
export function attrColor(i) {
  return `var(--color-chart-${(i % 10) + 1})`;
}

/**
 * Die Wahrscheinlichkeitsbalken je Kategorie.
 * @param {ReadonlyArray<{ name: string, weight: number }>} attributes @param {string} lang
 * @returns {{ label: string, style: string, title: string }[]}
 */
export function probBars(attributes, lang) {
  const probs = attrProbabilities(attributes);
  return attributes.map((a, i) => {
    const pct = formatNumber(probs[i], lang, { decimals: 1 });
    return {
      label: `${pct}%`,
      style: `width:${roundTo(probs[i], 1)}%;background:${attrColor(i)}`,
      title: `${a.name || '?'}: ${pct}%`,
    };
  });
}

/**
 * Farbe einer Kategorie nach ihrem Namen; unbekannt die Rückfallfarbe.
 * @param {ReadonlyArray<{ name: string }>} attributes @param {string} name @param {string} fallback
 * @returns {string}
 */
export function colorOf(attributes, name, fallback) {
  const idx = attributes.findIndex((a) => a.name === name);
  return idx >= 0 ? attrColor(idx) : fallback;
}

/**
 * Die Zeilen der Häufigkeitstabelle, absteigend nach Anzahl.
 * @param {ReadonlyArray<string>} values @param {ReadonlyArray<{ name: string }>} attributes @param {string} lang
 * @returns {{ name: string, count: string, pct: string, swatchStyle: string, barStyle: string }[]}
 */
export function freqRows(values, attributes, lang) {
  const rows = frequencyShares(values);
  const maxCount = rows.length ? rows[0].count : 1;
  return rows.map(({ name, count, share }) => {
    const color = colorOf(attributes, name, 'var(--color-text-tertiary)');
    return {
      name,
      count: formatNumber(count, lang),
      pct: `${formatNumber(share * 100, lang, { decimals: 1 })}%`,
      swatchStyle: `background:${color}`,
      barStyle: `width:${roundTo(count / maxCount * 100, 1)}%;background:${color}`,
    };
  });
}
