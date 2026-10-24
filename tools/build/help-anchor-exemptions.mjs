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
  'project-charter': [
    { name: 'actions.setProblemStatement', reason: 'die Oberfläche tippt direkt in den Editor, dessen Überschrift an fields.problemStatement verankert ist' },
    { name: 'actions.deleteGoal', reason: 'Löschknopf je Zielzeile; ein Fragezeichen je Zeile wäre Rauschen' },
    { name: 'actions.moveGoal', reason: 'Ziehgriff je Zielzeile, keine Beschriftung' },
    { name: 'actions.updateOrgNode', reason: 'Bearbeiten-Knopf je Position im Organigramm; die Dialogfelder sind verankert' },
    { name: 'actions.deleteOrgNode', reason: 'Löschknopf je Position im Organigramm; ein Fragezeichen je Knoten wäre Rauschen' },
    { name: 'actions.moveOrgNode', reason: 'Ziehen im Organigramm, keine Eingabe' },
    { name: 'actions.setOrgStyle', reason: 'Stil-Panel wird imperativ aus chart-editor.js gebaut, außerhalb der Vorlage' },
    { name: 'fields.orgStyle', reason: 'Stil-Panel wird imperativ aus chart-editor.js gebaut, außerhalb der Vorlage' },
  ],
  'survey-builder': [
    { name: 'actions.setTab', reason: 'Reiterleiste; ein Fragezeichen je Reiter wäre Rauschen' },
    { name: 'actions.draft.addQuestion', reason: 'Typauswahl je Abschnitt; ein Fragezeichen je Abschnitt wäre Rauschen, verankert ist die Gliederung' },
    { name: 'actions.draft.moveSection', reason: 'Pfeilknopf je Abschnitt; ein Fragezeichen je Zeile wäre Rauschen' },
    { name: 'actions.draft.deleteSection', reason: 'Löschknopf je Abschnitt; ein Fragezeichen je Zeile wäre Rauschen' },
    { name: 'actions.draft.moveQuestion', reason: 'Pfeilknopf je Frage; ein Fragezeichen je Zeile wäre Rauschen' },
    { name: 'actions.draft.deleteQuestion', reason: 'Löschknopf je Frage; ein Fragezeichen je Zeile wäre Rauschen' },
    { name: 'actions.draft.moveItem', reason: 'Pfeilknopf je Option oder Zeile; ein Fragezeichen je Zeile wäre Rauschen' },
    { name: 'actions.draft.deleteItem', reason: 'Löschknopf je Option oder Zeile; ein Fragezeichen je Zeile wäre Rauschen' },
    { name: 'actions.recipients.deleteRecipient', reason: 'Löschknopf je Empfängerzeile; ein Fragezeichen je Zeile wäre Rauschen' },
    { name: 'actions.responses.deleteResponse', reason: 'Löschknopf je Antwortzeile; ein Fragezeichen je Zeile wäre Rauschen' },
    { name: 'fields.transfers', reason: 'Übergabebuch; sichtbar nur als Häkchen und Auswahl, deren Anker an den Übergabeaktionen hängen' },
    { name: 'fields.ui', reason: 'Stand der Oberfläche; Reiter, Filter, Gruppierung und Namensschalter sind einzeln verankert' },
    { name: 'fields.dirtyStructure', reason: 'interner Merker für die nächste Exportversion; sichtbar nur in der Versionszeile' },
    { name: 'fields.exportedOnce', reason: 'interner Merker für die nächste Exportversion; sichtbar nur in der Versionszeile' },
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
  'chart-suggestion': [
    { name: 'actions.setColumns', reason: 'die Auswahl kommt in der Oberfläche aus dem Worksheet („Diagramm vorschlagen“); das Modul hat kein eigenes Bedienelement dafür' },
    { name: 'fields.openTarget', reason: 'abgeleitet aus dem gewählten Diagramm; sichtbar nur als Knopf „In Modul öffnen“, dessen Anker an openInModule hängt' },
  ],
};
