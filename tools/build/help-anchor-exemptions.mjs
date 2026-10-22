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
  'triz-function-analysis': [
    { name: 'actions.moveComponent', reason: 'Ziehen im Diagramm, keine Eingabe; kein eigenes Bedienelement für ein Fragezeichen' },
    { name: 'actions.moveLabel', reason: 'Ziehen der Beschriftung im Diagramm, keine Eingabe; kein eigenes Bedienelement für ein Fragezeichen' },
    { name: 'fields.positions', reason: 'Ergebnis des Ziehens im Diagramm (moveComponent); keine Eingabe in der Oberfläche' },
    { name: 'fields.labels', reason: 'Ergebnis des Ziehens von Beschriftungen im Diagramm (moveLabel); keine Eingabe in der Oberfläche' },
    { name: 'actions.removeComponent', reason: 'Löschknopf je Komponentenzeile; ein Fragezeichen je Zeile wäre Rauschen (wiederkehrendes Bedienelement)' },
    { name: 'actions.removeFunction', reason: 'Löschknopf je Funktionskarte; ein Fragezeichen je Karte wäre Rauschen (wiederkehrendes Bedienelement)' },
    { name: 'actions.swapDirection', reason: 'Richtungstausch in jeder Funktionskarte; ein Fragezeichen je Karte wäre Rauschen (wiederkehrendes Bedienelement)' },
    { name: 'actions.setFunctionVerb', reason: 'Eingabe in jeder Funktionskarte; ein Fragezeichen je Karte und Feld wäre Rauschen, verankert sind nur die einmaligen Abschnittstitel' },
    { name: 'actions.setFunctionParameter', reason: 'Eingabe in jeder Funktionskarte; ein Fragezeichen je Karte und Feld wäre Rauschen, verankert sind nur die einmaligen Abschnittstitel' },
    { name: 'actions.setFunctionType', reason: 'Eingabe in jeder Funktionskarte; ein Fragezeichen je Karte und Feld wäre Rauschen, verankert sind nur die einmaligen Abschnittstitel' },
    { name: 'actions.setFunctionLevel', reason: 'Eingabe in jeder Funktionskarte; ein Fragezeichen je Karte und Feld wäre Rauschen, verankert sind nur die einmaligen Abschnittstitel' },
    { name: 'fields.exclusions', reason: 'Zustand der Matrixzellen; bedient über setPairState, dessen Anker an der Matrixecke hängt' },
    { name: 'fields.openPairs', reason: 'die Liste unter „Offene Paare“; der Abschnittstitel erklärt addFunction' },
    { name: 'fields.components', reason: 'die Komponentenzeilen selbst; die Spalten sind an der Kopfzeile verankert' },
    { name: 'fields.ranks', reason: 'abgeleitet; eingeblendet über setShowRanks, dessen Anker die Kennzeichen erklärt' },
    { name: 'fields.showRanks', reason: 'Zustand des Kontrollkästchens setShowRanks, das selbst verankert ist' },
    { name: 'fields.activeTab', reason: 'Zustand der Reiterleiste; setTab ist dort verankert' },
  ],
};
