/**
 * D.Mike — Nutzungsvertrag der Agentenfläche (agent-usage.js)
 *
 * Spec §3.1: `interact()` ohne Parameter liefert alles, was ein Agent zum
 * Start braucht. Der maschinenlesbare Teil (Aufrufform, Aktionsformen,
 * Fehlerformen) wird aus `OPS`/`ERRORS` ABGELEITET und nicht nebenher
 * aufgeschrieben — sonst gäbe es eine zweite Quelle, die driftet. Die Prosa
 * kommt aus i18n, in der UI-Sprache wie alles andere.
 */
import { OPS, ERRORS, CONTRACT_VERSION } from './agent-contract.js';

/**
 * @param {{ t: (key: string, params?: object) => string }} i18n
 * @returns {object} der Nutzungsvertrag
 */
export function buildUsage(i18n) {
  const ops = {};
  for (const [name, spec] of Object.entries(OPS)) {
    ops[name] = { params: spec.params, result: spec.result };
  }
  return {
    contract: CONTRACT_VERSION,
    intro:        i18n.t('agent.usage.intro'),
    call:         i18n.t('agent.usage.call'),
    actionForm:   i18n.t('agent.usage.actionForm'),
    refForm:      i18n.t('agent.usage.refForm'),
    // `ops` unten liefert die Ergebnisformen WÖRTLICH aus — der Agent liest
    // dort `view: { $nullable: … }`. Ohne diesen Satz sagt die Prosa derselben
    // Antwort nur, der Pfad kenne Schlüssel, und `$nullable` sieht wie einer
    // aus. Der erste Leser der Shape-Grammatik ist die Maschine; ein
    // Quellkommentar in `agent-contract.js` erreicht sie nicht.
    nullableForm: i18n.t('agent.usage.nullableForm'),
    batchForm:    i18n.t('agent.usage.batchForm'),
    errorForm:    i18n.t('agent.usage.errorForm'),
    availability: i18n.t('agent.usage.availability'),
    limits:       i18n.t('agent.usage.limits'),
    viewSwitch:   i18n.t('agent.usage.viewSwitch'),
    ops,
    errors: Object.values(ERRORS),
  };
}
