/**
 * D.Mike — Kennungen der modulfreien Handbuchkapitel (help-keys.js)
 *
 * Nur Zeichenketten, kein Inhalt, kein Import. Der Fundort existiert, damit
 * niemand ein ganzes Inhaltskapitel importieren muss, um seinen Schlüssel zu
 * erfahren: `js/core/agent/agent-runtime.js` braucht die Kennung, nicht die
 * Prosa — und ein Import auf `ai-assistant-help.js` machte das Kapitel zu
 * einem statischen Abhängigkeitsknoten der Kernschicht.
 *
 * `tools/build/help-data.mjs` sammelt nur `<id>-help.js` aus diesem
 * Verzeichnis; diese Datei heißt bewusst anders und landet darum nicht in
 * `js/core/help-registry.generated.js`.
 */

/**
 * Der Schlüssel des Kapitels „KI-Assistent" in der `HELP`-Map
 * (`js/core/help-registry.generated.js`) und damit das Argument für
 * `getModuleHelp()`. Zugleich der Dateiname-Rumpf: `<id>-help.js`.
 * @type {string}
 */
export const AI_ASSISTANT_CHAPTER_ID = 'ai-assistant';

/**
 * Dieselbe Kennung in camelCase — die Form, in der das Kapitel in i18n und
 * in den Generatoren auftaucht (`moduleHelp.aiAssistant`). Exportiert, damit
 * sie an keiner Stelle aus `AI_ASSISTANT_CHAPTER_ID` umgerechnet wird: eine
 * Umrechnung an drei Orten ist dreimal dieselbe Annahme.
 * @type {string}
 */
export const AI_ASSISTANT_CHAPTER_KEY = 'aiAssistant';

/**
 * Welcher i18n-Schlüssel unter `moduleHelp.*` die Überschrift eines
 * modulfreien Kapitels trägt — die eine Zuordnung von Kennung zu Schlüssel,
 * die jeder Leser importiert statt sie nachzurechnen.
 *
 * Drei Leser: das Hilfe-Panel (`js/frame/header/module-help.js`), der
 * Sprachindex und die Seitenüberschrift des statischen Generators
 * (`tools/static-handbook/render/pages.mjs`). Ein zweites Kapitel braucht
 * hier eine Zeile und sonst nirgends eine Änderung.
 *
 * @type {Record<string, string>}
 */
export const GUIDE_I18N_KEYS = {
  [AI_ASSISTANT_CHAPTER_ID]: AI_ASSISTANT_CHAPTER_KEY,
};
