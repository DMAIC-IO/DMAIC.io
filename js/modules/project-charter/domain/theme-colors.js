/**
 * D.Mike — Project charter: Themenvariablen für Organigrammfarben ohne eigenen
 * Wert. Eine Quelle für Bildschirm (`viewmodel/style.js`) und Export
 * (`io/export.js`), damit beide dieselbe Farbe zeigen.
 */

/** Farbschlüssel des globalen Stils → Name der Themenvariable. */
export const THEME_VAR = Object.freeze({
  nodeBg: '--color-bg-secondary',
  nodeBorderColor: '--color-border-secondary',
  lineColor: '--color-border-secondary',
});
