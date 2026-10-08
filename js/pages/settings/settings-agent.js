/**
 * D.Mike — Einstellungsabschnitt „KI-Agenten" (settings-agent.js)
 *
 * Spec §3.2: die Einwilligung ist in den Einstellungen sichtbar und
 * widerrufbar. Der Abschnitt lebt in einer eigenen, DOM-freien Datei, damit
 * sein Verhalten — insbesondere die Reaktivität — ohne Alpine testbar bleibt.
 *
 * Reaktivität (Ruling K2): `stateManager.set()` emittiert für Pfade unter
 * `settings.` KEIN `data:changed` (core/state-manager.js), und createPage ruft
 * die Alpine-data()-Fabrik nur beim ersten Mount. Ein Schnappschuss beim Mount
 * würde eine spätere Erteilung also nie sehen. Deshalb hört der Abschnitt auf
 * `agent:consent-changed`, das `grantConsent`/`revokeConsent` feuern.
 *
 * Importiert bewusst direkt aus den zwei Quellmodulen statt aus
 * `core/agent/index.js`: der Barrel zöge Laufzeit, Ops und Katalog in den
 * Settings-Chunk.
 */
import { readConsent, revokeConsent } from '../../core/agent/agent-consent.js';
import { AGENT_COVERAGE } from '../../core/agent/agent-registry.generated.js';

/** Das Ereignis, über das sich der Einwilligungsstand ändert. */
export const CONSENT_CHANGED = 'agent:consent-changed';

/**
 * Baut die Alpine-Daten des Abschnitts. Das Ergebnis wird in die data()-Fabrik
 * der Einstellungsseite gespreizt; `agentInit()` / `agentDestroy()` ruft deren
 * eigenes `init()` / `destroy()` auf (eine Alpine-Komponente hat nur je einen
 * Lebenszyklus-Haken).
 *
 * @param {object} deps
 * @param {object} deps.stateManager
 * @param {{ t: (key: string, params?: object) => string }} deps.i18n
 * @param {{ on: Function, off: Function }} deps.eventBus
 * @param {(message: string, kind?: string) => void} [deps.notify]
 * @returns {object} Alpine-Daten des Abschnitts
 */
export function agentSettingsData({ stateManager, i18n, eventBus, notify }) {
  return {
    agentTitle: i18n.t('agent.settings.title'),
    agentHint: i18n.t('agent.settings.hint'),
    agentRevokeLabel: i18n.t('agent.settings.revoke'),
    agentCoverage: i18n.t('agent.settings.coverage', AGENT_COVERAGE),
    agentGranted: readConsent(stateManager).granted,

    /** @returns {string} Statuszeile passend zum aktuellen Stand */
    agentStatusText() {
      return this.agentGranted
        ? i18n.t('agent.settings.statusGranted')
        : i18n.t('agent.settings.statusDenied');
    },

    /** Widerruft die Einwilligung für dieses Browser-Profil. */
    revokeAgentConsent() {
      revokeConsent(stateManager, eventBus);
      this.agentGranted = false;
      notify?.(i18n.t('agent.settings.revoked'), 'success');
    },

    /** @type {Function|null} */
    _onAgentConsent: null,

    /** Abonniert `agent:consent-changed`; vom `init()` der Seite aufzurufen. */
    agentInit() {
      // Beim Re-Init (Sprachwechsel) kann sich der Stand geändert haben.
      this.agentGranted = readConsent(stateManager).granted;
      this._onAgentConsent = (payload) => {
        this.agentGranted = payload?.granted === true;
      };
      eventBus.on(CONSENT_CHANGED, this._onAgentConsent);
    },

    /** Meldet das Abonnement ab; vom `destroy()` der Seite aufzurufen. */
    agentDestroy() {
      if (!this._onAgentConsent) return;
      eventBus.off(CONSENT_CHANGED, this._onAgentConsent);
      this._onAgentConsent = null;
    },
  };
}
