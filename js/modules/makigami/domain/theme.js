/**
 * D.Mike — Makigami: die Themenvariablen des Bildexports.
 *
 * Eine Quelle für Bildschirm und Export: das Viewmodel löst die Variablen
 * über `cssVars` auf, `io/svg.js` bekommt die Farben. Fehlt eine Variable,
 * gilt der Rückfallwert.
 */

/** Rolle → CSS-Variable. */
export const THEME_VAR = Object.freeze({
  bg: '--color-bg-primary',
  bgSec: '--color-bg-secondary',
  border: '--color-border-primary',
  text: '--color-text-primary',
  muted: '--color-text-tertiary',
  accent: '--color-accent',
  accentBg: '--color-accent-light',
});

/** Rolle → Rückfallfarbe, wenn die Variable leer ist. */
export const THEME_FALLBACK = Object.freeze({
  bg: '#ffffff',
  bgSec: '#f5f5f7',
  border: '#d2d2d7',
  text: '#1d1d1f',
  muted: '#86868b',
  accent: '#0066cc',
  accentBg: '#e5f0ff',
});

/**
 * Die Farben des Exports: aufgelöste Werte, leere durch den Rückfall ersetzt.
 * @param {Readonly<Record<string, string|undefined>>} resolved Rolle → aufgelöster Wert
 * @returns {Record<keyof typeof THEME_VAR, string>}
 */
export function exportColors(resolved) {
  return /** @type {Record<keyof typeof THEME_VAR, string>} */ (Object.fromEntries(
    Object.keys(THEME_VAR).map((k) => [k, String(resolved?.[k] ?? '').trim() || THEME_FALLBACK[/** @type {keyof typeof THEME_FALLBACK} */ (k)]]),
  ));
}
