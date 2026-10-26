/**
 * D.Mike — AXI-Fehler (agent-errors.js)
 *
 * Ein Fehler der Agentenfläche sagt, WAS das Problem ist, und nennt die
 * gültigen Möglichkeiten (`available`). Er gibt KEINEN Lösungsvorschlag —
 * das erfordert Interpretation und gehört zum Agenten.
 *
 * Fehlertexte stehen in der UI-Sprache, wie alles andere; der Aufrufer
 * übergibt eine gebundene `t`-Funktion.
 */

/**
 * @param {string} code  Wert aus ERRORS (agent-contract.js)
 * @param {string} message  fertiger, übersetzter Text
 * @param {object} [extra]  z. B. `{ available: [...] }`
 * @returns {{ ok: false, error: string, message: string }}
 */
export function axiError(code, message, extra = {}) {
  return { ok: false, error: code, message, ...extra };
}
