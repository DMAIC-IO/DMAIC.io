/**
 * D.Mike — openDialog-Port des Einwilligungsdialogs (agent-consent-port.js)
 *
 * Eigene Datei, weil sie DOM-frei bleiben muss: `agent-consent.js` zieht über
 * `core/create-dialog.js` Alpine CSP herein (fasst beim Import
 * MutationObserver an) und wäre im Node-Runner nicht importierbar. Hier liegt
 * nur die Übersetzung „Abbruch/Fehler heißt Ablehnung" — genau die
 * `openDialog`-Signatur, die das Einwilligungstor erwartet.
 * `agent-consent.js` re-exportiert diese Funktion.
 */

/**
 * Öffnet den Einwilligungsdialog und übersetzt jeden Nicht-Erfolg in eine
 * Ablehnung.
 *
 * Ein Abbruch liefert `null` (createDialog-Vertrag), ein kaputter Modal wirft
 * — beides heißt „nicht zugestimmt". Die vorsichtige Richtung ist hier die
 * einzige vertretbare: niemals aus einem Fehler eine Zustimmung ableiten.
 *
 * @param {object} modal  ui/modal.js Instanz
 * @param {{ t: (key: string) => string }} i18n
 * @param {{ open: Function }} dialog  Rückgabe von buildAgentConsentDialog
 * @param {{ projectName?: string }} [init]
 * @returns {Promise<boolean>}
 */
export async function openAgentConsent(modal, i18n, dialog, init) {
  try {
    const result = await dialog.open(modal, init, {
      confirmLabel: i18n.t('agent.consent.grant'),
      cancelLabel: i18n.t('agent.consent.deny'),
    });
    return result === true;
  } catch {
    return false;
  }
}
