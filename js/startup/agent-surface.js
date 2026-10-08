/**
 * D.Mike — Agentenfläche, Stufe 1 (agent-surface.js)
 *
 * Setzt `window.qprovement = { interact }`. Mehr nicht: kein Objektbaum aus
 * Modulfunktionen — der wäre nicht stapelbar, nicht entdeckbar und ein
 * zweiter Routingweg. Die Moduldetails stehen im Aktionskatalog, nicht im
 * Objektgraph (Spec §3).
 *
 * Dies ist die dokumentierte Ausnahme zur Konvention „keine globalen
 * Variablen": EIN Namensraum-Objekt, eingefroren, ohne DOM-Zugriff, jeder
 * Zugriff über den Kernel. Der Namensraum trägt den Produktnamen; `dmike`
 * ist intern und erscheint hier nicht.
 *
 * EINMALIG UND NICHT REENTRANT: `buildAgentConsentDialog` hängt über
 * `core/create-dialog.js` einen `language:changed`-Listener an den eventBus.
 * Ein zweiter Lauf dieser Concern im selben Dokument hinterließe daher einen
 * zweiten Dialog samt zweitem Listener und überschriebe `window.qprovement`.
 * `startupTasks` läuft genau einmal pro Boot — darauf verlässt sich die
 * Datei bewusst, statt eine Wiedereintrittssperre zu bauen.
 *
 * Stufe 2 (App als eigener Harness) ersetzt diese Datei durch einen
 * HTTP-Client am DEMSELBEN Runtime — Aktionskatalog, Prüfer,
 * Referenzauflösung, Fehlerformen und Registry werden unverändert geerbt
 * (Spec §11).
 */
import { createStartup } from '../core/create-startup.js';
import { createAgentRuntime, createConsentGate, AGENT_REGISTRY } from '../core/agent/index.js';
import { createAgentHost } from '../ui/agent-host.js';
import { buildAgentConsentDialog, openAgentConsent } from '../dialogs/agent-consent/agent-consent.js';
import { exportAllProjects } from '../core/export-all.js';
import { getModuleHelp } from '../core/help-registry.js';
import { VERSION } from '../core/version.js';

export default createStartup({
  id: 'agent-surface',

  run({ stateManager, moduleRegistry, eventBus, i18n, modal, notify, workspace, router }) {
    const dialog = buildAgentConsentDialog({ i18n, eventBus });

    const consent = createConsentGate({
      stateManager,
      eventBus,
      t: (key, params) => i18n.t(key, params),
      // Partiell angewandt: das Tor ruft `openDialog()` ohne Argumente auf,
      // `openAgentConsent` braucht Modal, i18n und Dialog.
      openDialog: () => openAgentConsent(modal, i18n, dialog, {
        projectName: stateManager.get('projectMeta.name') ?? '',
      }),
      // Spec §3.2: beim Erteilen wird der Nutzer zum Projekt-Export
      // aufgefordert. Das ist die vereinbarte Sicherung — ein eigener
      // Schnappschuss- oder Undo-Mechanismus wird nicht gebaut.
      promptExport: () => exportAllProjects({ stateManager, eventBus, i18n, notify }),
    });

    const host = createAgentHost({ stateManager, moduleRegistry, eventBus, router, workspace });

    const runtime = createAgentRuntime({
      stateManager,
      moduleRegistry,
      i18n,
      registry: AGENT_REGISTRY,
      getHelp: getModuleHelp,
      consent,
      host,
      appVersion: VERSION,
    });

    // Eingefroren: `window.qprovement.foo = …` soll kein zweiter Weg werden.
    window.qprovement = Object.freeze({
      interact: (actions) => runtime.interact(actions),
    });
  },
});
