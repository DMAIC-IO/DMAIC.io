/**
 * Bewusst unverankerte Hilfetexte freigegebener Module (Spec
 * 2026-10-22-help-anchor-coverage §3). Je Modul-Id — oder `'*'` für jedes
 * freigegebene Modul — eine Liste `{ name, reason }`. `name` ist exakt
 * `actions.<aktion>` oder `fields.<feld>`, so wie `agent:report -- --verbose`
 * ihn hinter `ohne Hilfe-Anker — <id>:` ausgibt. `reason` sagt, warum es in
 * der Oberfläche kein Fragezeichen dafür gibt (nur der Agent ruft oder liest
 * es, die Oberfläche zieht statt zu tippen, …). Ohne Grund kein Eintrag —
 * `countHelpAnchorCoverage` wirft. Eine Ausnahme, die keine Lücke deckt,
 * meldet der Report als „Hilfe-Ausnahme ohne Treffer“.
 *
 * @type {Record<string, Array<{ name: string, reason: string }>>}
 */
export const HELP_ANCHOR_EXEMPTIONS = {
  '*': [
    { name: 'actions.read', reason: 'Lesezugriff des Agenten auf den ganzen Zustand; kein Bedienelement' },
    { name: 'fields.pickableColumns', reason: 'Auswahlhilfe für den Agenten; die Oberfläche zeigt dieselbe Auswahl im Spaltenwähler, dessen Anker an setColumn hängt' },
    { name: 'fields.activeColumnSlots', reason: 'Auswahlhilfe für den Agenten (welche Slots setColumn annimmt); kein eigenes Element' },
    { name: 'fields.activeParams', reason: 'Auswahlhilfe für den Agenten (welche Schlüssel setParam annimmt); die Felder selbst sind einzeln verankert' },
    { name: 'fields.activeMultiSlots', reason: 'Auswahlhilfe für den Agenten (welche Mehrfach-Slots es gibt); kein eigenes Element' },
  ],
};
