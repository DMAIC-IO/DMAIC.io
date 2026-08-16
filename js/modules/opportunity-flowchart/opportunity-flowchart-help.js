/**
 * D.Mike — Opportunity Flowchart Module Help (opportunity-flowchart-help.js)
 * Bilingual help content (DE/EN) for the opportunity flowchart module.
 */
export default {
  moduleId: 'opportunity-flowchart',
  sections: {
    overview: {
      de: {
        title: 'Aufbau',
        blocks: [
          { type: 'paragraph', content: 'Das Opportunity Flowchart teilt einen Ablauf in zwei Spalten: links die wertschöpfenden Schritte (VA), rechts die nicht wertschöpfenden Schritte — Nacharbeit, Warten, Prüfen, Korrigieren (NVA). Die Reihenfolge läuft von oben nach unten und ist spaltenübergreifend: Zeile für Zeile durchläuft der Prozess genau einen Schritt, egal in welcher Spalte er steht. Je mehr Karten rechts stehen, desto mehr Aufwand steckt im Prozess, der für den Kunden keinen Wert erzeugt.' },
        ],
      },
      en: {
        title: 'Structure',
        blocks: [
          { type: 'paragraph', content: 'The Opportunity Flowchart splits a process into two columns: value-added steps (VA) on the left, non-value-added steps on the right — rework, waiting, inspecting, correcting (NVA). The sequence runs top to bottom across both columns: each row is exactly one step, no matter which column it sits in. The more cards on the right, the more effort the process spends without creating customer value.' },
        ],
      },
    },

    whenToUse: {
      de: {
        title: 'Wann verwenden?',
        blocks: [
          { type: 'paragraph', content: 'Das Opportunity Flowchart eignet sich in der Analyze-Phase, wenn die Verschwendung in einem bereits erfassten Ablauf sichtbar gemacht werden soll. Es beantwortet die Frage „Welcher Anteil unserer Schritte erzeugt tatsächlich Wert?" und liefert damit die Kandidaten für die Improve-Phase. Im Unterschied zur Prozesskarte verzichtet es auf Input/Output-Klassifikation und Swim Lanes; im Unterschied zum Activity Flowchart bildet es keine Verzweigungen ab, sondern eine Bewertung pro Schritt.' },
        ],
      },
      en: {
        title: 'When to use',
        blocks: [
          { type: 'paragraph', content: 'The Opportunity Flowchart fits the Analyze phase when the waste in an already-documented process needs to become visible. It answers "which share of our steps actually creates value?" and hands the Improve phase its candidates. Unlike the process map it drops input/output classification and swim lanes; unlike the Activity Flowchart it shows no branching, but one classification per step.' },
        ],
      },
    },

    howToUse: {
      de: {
        title: 'Bedienung',
        blocks: [
          { type: 'paragraph', content: 'Über „Schritt links (VA) hinzufügen" bzw. „Schritt rechts (NVA) hinzufügen" wird ein neuer Schritt am Ende der Kette in der jeweiligen Spalte angelegt. Der Pfeil-Knopf auf einer Karte verschiebt sie in die andere Spalte, ohne ihre Position in der Reihenfolge zu ändern. Der `»`-Knopf zwischen zwei Zeilen öffnet ein kleines Menü und fügt an dieser Stelle einen Schritt links oder rechts ein. Karten lassen sich per Drag & Drop umsortieren. Über „Importieren aus …" werden Schritte aus einer bestehenden Process-Map- oder SIPOC-Instanz übernommen.' },
        ],
      },
      en: {
        title: 'How to use',
        blocks: [
          { type: 'paragraph', content: 'Use "Add step left (VA)" or "Add step right (NVA)" to append a step to the end of the chain in that column. The arrow button on a card moves it to the other column without changing its position in the sequence. The `»` button between two rows opens a small menu and inserts a step at that position, left or right. Cards can be reordered by drag and drop. "Import from …" pulls steps in from an existing Process Map or SIPOC instance.' },
        ],
      },
    },

    valueClassification: {
      de: {
        title: 'Import und Wert-Einstufung',
        blocks: [
          { type: 'paragraph', content: 'Beim Import aus einer Process Map wird deren dreistufige Wert-Einstufung auf die zwei Spalten abgebildet: „wertschöpfend" bleibt links, „nicht wertschöpfend" wandert nach rechts, und „notwendig, aber nicht wertschöpfend" (BNVA) landet ebenfalls rechts — es ist Aufwand, den der Kunde nicht bezahlt, auch wenn er heute nicht entfallen kann. Schritte ohne Einstufung landen links. Aus SIPOC kommen alle Schritte links an, weil dort keine Wert-Information hinterlegt ist; die Einstufung erfolgt danach von Hand über den Pfeil-Knopf.' },
        ],
      },
      en: {
        title: 'Import and value classification',
        blocks: [
          { type: 'paragraph', content: 'Importing from a Process Map maps its three-level value classification onto the two columns: "value-added" stays left, "non-value-added" moves right, and "business-necessary but non-value-added" (BNVA) also moves right — it is effort the customer does not pay for, even if it cannot be dropped today. Steps without a classification land on the left. SIPOC carries no value information, so all its steps arrive on the left and are classified by hand afterwards via the arrow button.' },
        ],
      },
    },
  },
};
