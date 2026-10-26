/**
 * D.Mike — Einwilligungsdialog der Agentenfläche (agent-consent.js)
 *
 * Der erste `interact()`-Aufruf öffnet diesen Dialog, und das
 * Promise des Agenten löst erst nach der Entscheidung des Nutzers auf.
 * Der Text sagt ausdrücklich, dass es kein Rückgängig gibt und dass beim
 * Erlauben ein Export heruntergeladen wird.
 *
 * Ein eigener „Ablehnen"-Knopf fehlt bewusst: createDialog liefert bei
 * Abbruch `null`, der Abbruch-Knopf IST die Ablehnung.
 */
import { createDialog } from '../../core/create-dialog.js';
import { Model } from './agent-consent-model.js';

export { openAgentConsent } from './agent-consent-port.js';

/**
 * Baut den Einwilligungsdialog.
 * @param {{ i18n: object, eventBus: object }} ctx
 * @returns {{ id: string, prewarm: Function, open: Function }}
 */
export function buildAgentConsentDialog(ctx) {
  return createDialog({
    id: 'agent-consent',
    i18nKey: 'agent.consent',
    titleKey: 'title',
    Model,
    ctx,
  });
}
