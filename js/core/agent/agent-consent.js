/**
 * D.Mike — Einwilligungstor der Agentenfläche (agent-consent.js)
 *
 * Einwilligung ist KEINE Aktion. Der erste `interact()`-Aufruf
 * einer Sitzung — auch der parameterlose — öffnet den Dialog, und das
 * Promise löst erst nach der Entscheidung des Nutzers auf. Der Agent bekommt
 * keine Information, solange nicht zugestimmt wurde; es gibt deshalb auch
 * keinen Weg, den Katalog „nur mal zu lesen".
 *
 * Beim Erteilen wird ein Projekt-Export angefordert. Das ist die bewusst
 * gewählte Absicherung: Undo existiert heute nur im DataGrid
 * (`core/datagrid/datagrid-history.js`), Schreibzugriffe des Agenten auf
 * andere Felder sind nicht rückgängig zu machen. Ein eigener
 * Schnappschuss-Mechanismus wird nicht gebaut.
 *
 * Eine ABLEHNUNG wird nicht persistiert: der nächste Aufruf fragt erneut.
 * Nur das Erteilen hinterlässt eine Spur — pro Browser-Profil, in den
 * Einstellungen sichtbar und widerrufbar.
 *
 * DOM-frei: Dialog und Export kommen als Ports herein.
 */
import { CONTRACT_VERSION, ERRORS } from './agent-contract.js';
import { axiError } from './agent-errors.js';

/** Speicherort. Unter `settings.` — global pro Profil, projektunabhängig. */
export const CONSENT_PATH = 'settings.agent.consent';

/**
 * @param {object} stateManager
 * @returns {{ granted: boolean, at: string|null, contract: number|null }}
 */
export function readConsent(stateManager) {
  const stored = stateManager.get(CONSENT_PATH);
  return {
    granted: stored?.granted === true,
    at: typeof stored?.at === 'string' ? stored.at : null,
    contract: typeof stored?.contract === 'number' ? stored.contract : null,
  };
}

/**
 * Einwilligung erteilen und — wenn ein eventBus übergeben wurde —
 * `agent:consent-changed` mit `{ granted: true }` feuern (Ruling K2). Der
 * Einstellungsabschnitt (Task 11) hält damit seine Anzeige aktuell, auch
 * ohne dass `settings.`-Schreibzugriffe ein `data:changed` auslösen.
 * @param {object} stateManager
 * @param {object} [eventBus]
 */
export function grantConsent(stateManager, eventBus) {
  stateManager.set(CONSENT_PATH, {
    granted: true,
    at: new Date().toISOString(),
    contract: CONTRACT_VERSION,
  });
  eventBus?.emit('agent:consent-changed', { granted: true });
}

/**
 * Einwilligung widerrufen und — wenn ein eventBus übergeben wurde —
 * `agent:consent-changed` mit `{ granted: false }` feuern (Ruling K2).
 * @param {object} stateManager
 * @param {object} [eventBus]
 */
export function revokeConsent(stateManager, eventBus) {
  stateManager.set(CONSENT_PATH, { granted: false, at: null, contract: null });
  eventBus?.emit('agent:consent-changed', { granted: false });
}

/**
 * Das Tor. `ensure()` ist vor JEDEM `interact()` zu durchlaufen.
 *
 * @param {object} deps
 * @param {object} deps.stateManager
 * @param {(key: string, params?: object) => string} deps.t  gebundenes i18n.t
 * @param {() => Promise<boolean>} deps.openDialog  öffnet den Einwilligungsdialog
 * @param {() => Promise<void>} deps.promptExport   fordert den Projekt-Export an
 * @param {object} [deps.eventBus]  optional, siehe Ruling K2
 * @returns {{ ensure: () => Promise<{ ok: true } | { ok: false, error: string, message: string }> }}
 */
export function createConsentGate({ stateManager, t, openDialog, promptExport, eventBus }) {
  /** @type {Promise<object>|null} läuft, während ein Dialog offen ist. */
  let pending = null;

  async function ask() {
    const granted = await openDialog();
    if (!granted) {
      return axiError(ERRORS.CONSENT_DENIED, t('agent.errors.consentDenied'));
    }
    grantConsent(stateManager, eventBus);
    // Scheitert der Download (Browser blockt, Speicher voll), bleibt die
    // Einwilligung bestehen: der Nutzer hat zugestimmt, und ein zweites Mal
    // zu fragen würde die Entscheidung nicht besser machen.
    try { await promptExport(); } catch { /* Export ist eine Empfehlung, kein Tor */ }
    return { ok: true };
  }

  return {
    async ensure() {
      if (readConsent(stateManager).granted) return { ok: true };
      // Zwei gleichzeitige Erstaufrufe teilen sich einen Dialog — zwei
      // Overlays übereinander wären unbedienbar.
      if (!pending) {
        pending = ask().finally(() => { pending = null; });
      }
      return pending;
    },
  };
}
