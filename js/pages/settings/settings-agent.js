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
 * Importiert über den Barrel `core/agent/index.js` — die dokumentierte Regel
 * „einziger erlaubter Einstieg von außerhalb `core/agent/`". Der frühere
 * Direktimport aus `agent-consent.js` und `agent-registry.generated.js` sollte
 * Laufzeit, Ops und Katalog aus einem Settings-Chunk heraushalten; es gibt
 * aber keinen: `js/app.js` importiert `startup/index.js` statisch, das über
 * `startup/agent-surface.js` den Barrel ohnehin in den Eager-Graph der Entry
 * zieht, und `js/pages/index.js` zieht `settings.js` ebenfalls statisch. Der
 * Direktimport sparte also null Byte (Review-Befund I5). Die echte
 * Bundle-Frage — Agentenfläche dynamisch nachladen, `AGENT_COVERAGE` in eine
 * eigene kleine generierte Datei — steht in der Roadmap.
 */
import { readConsent, revokeConsent, AGENT_COVERAGE } from '../../core/agent/index.js';
import { AI_ASSISTANT_CHAPTER_ID } from '../../help/help-keys.js';

/** Das Ereignis, über das sich der Einwilligungsstand ändert. */
export const CONSENT_CHANGED = 'agent:consent-changed';

/**
 * Das Ereignis, mit dem ein modulfreies Handbuchkapitel im Hilfe-Panel
 * geöffnet wird. Der Abschnitt kennt das Panel nicht — er nennt nur die
 * Kennung; `js/frame/header/module-help.js` hört darauf.
 *
 * Nur die Kennung wird importiert, nicht das Kapitel: eine Einstellungsseite
 * soll keine Handbuchprosa in ihren Abhängigkeitsgraphen ziehen.
 */
export const SHOW_GUIDE = 'help:show-guide';

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
    agentBriefingLabel: i18n.t('agent.settings.briefing'),
    agentCoverage: i18n.t('agent.settings.coverage', AGENT_COVERAGE),
    agentGranted: readConsent(stateManager).granted,

    /** @returns {string} Statuszeile passend zum aktuellen Stand */
    agentStatusText() {
      return this.agentGranted
        ? i18n.t('agent.settings.statusGranted')
        : i18n.t('agent.settings.statusDenied');
    },

    /**
     * Öffnet das Hilfe-Panel mit dem Rollen-Briefing.
     *
     * Dasselbe Kapitel, das `interact()` als `briefing` liefert und das der
     * statische Generator nach /app/<tag>/docs/ mitnimmt — eine Quelle, drei
     * Verwendungen. Hier die zweite.
     */
    openAgentBriefing() {
      eventBus.emit(SHOW_GUIDE, { id: AI_ASSISTANT_CHAPTER_ID });
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
