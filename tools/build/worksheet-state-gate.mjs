/**
 * Gate gegen Rohzugriff auf gespeicherte Arbeitsblatt-Stände (Spec F1.14 §4.1):
 * Außerhalb des Arbeitsblatts liest niemand `getModuleState(…).sheets`.
 * Gelesen wird über `ctx.instances.readSync` beziehungsweise `readWorksheet`.
 */

/** Muster, die zusammen mit `getModuleState(` einen Rohzugriff verraten. */
const RAW_PATTERNS = [/\.sheets\b/, /\bsheets?\??\.state\b/, /\.state\??\.columns\b/];

/**
 * Erlaubte Pfade (relativ zu `app/dev/`; Ende `/` = Verzeichnis) mit Begründung.
 * @type {Array<{ path: string, reason: string }>}
 */
export const WORKSHEET_STATE_ALLOW = [
  { path: 'js/modules/worksheet/', reason: 'das Arbeitsblatt selbst' },
  { path: 'js/core/instances.js', reason: 'generisch, liest jede Instanz' },
  { path: 'js/core/agent/agent-journal.js', reason: 'generisch, Abzug je Instanz' },
  {
    path: 'js/core/examples-registry.js',
    reason: 'legt Beispiel-Arbeitsblätter im gespeicherten Format an; ab Stufe 2 läuft das über die Migration \'0→1.0\'',
  },
];

/**
 * @param {Array<{ path: string, text: string }>} files Pfade relativ zu `app/dev/`
 * @param {Array<{ path: string, reason: string }>} allow
 * @returns {string[]} Pfade mit Rohzugriff
 * @throws {Error} wenn eine Ausnahme keine Begründung hat
 */
export function findWorksheetStateAccess(files, allow) {
  for (const a of allow) {
    if (!a.reason || !a.reason.trim()) throw new Error(`Ausnahme ohne Begründung (reason): ${a.path}`);
  }
  const allowed = (p) => allow.some(a => (a.path.endsWith('/') ? p.startsWith(a.path) : p === a.path));
  return files
    .filter(f => !allowed(f.path) && f.text.includes('getModuleState(') && RAW_PATTERNS.some(re => re.test(f.text)))
    .map(f => f.path);
}
