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
          { type: 'paragraph', content: 'Das Opportunity Flowchart teilt einen Ablauf in zwei Bahnen: oben die wertschöpfenden Schritte (VA), unten die nicht wertschöpfenden — Nacharbeit, Warten, Prüfen, Korrigieren (NVA). Die Kette läuft wie in allen Flowcharts von links nach rechts; die Bahn ist ausschließlich die vertikale Position. Je mehr Karten in der unteren Bahn liegen, desto mehr Aufwand steckt im Prozess, der für den Kunden keinen Wert erzeugt.' },
        ],
      },
      en: {
        title: 'Structure',
        blocks: [
          { type: 'paragraph', content: 'The Opportunity Flowchart splits a process into two bands: value-added steps (VA) on top, non-value-added ones below — rework, waiting, inspecting, correcting (NVA). The chain runs left to right as in every flowchart; the band is purely the vertical position. The more cards in the lower band, the more effort the process spends without creating customer value.' },
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
          { type: 'paragraph', content: 'Über „Schritt links (VA) hinzufügen" bzw. „Schritt rechts (NVA) hinzufügen" wird ein neuer Schritt am Ende der Kette in der jeweiligen Bahn angelegt. Der Pfeil-Knopf auf einer Karte (↓ bzw. ↑) schiebt sie in die andere Bahn, ohne ihre Position in der Kette zu ändern. Der `»`-Knopf zwischen zwei Spalten öffnet ein kleines Menü und fügt an dieser Stelle einen Schritt oben (VA) oder unten (NVA) ein. Karten werden an der blauen Nummer gegriffen: Ziehen auf einen Pfeil zwischen zwei Karten sortiert die Kette um — die Bahn der Karte bleibt dabei, auch wenn der Pfeil in der anderen Bahn liegt. Ziehen auf die freie Fläche einer Bahn wechselt die Einstufung, ohne die Position zu ändern. Über „Detail-Schritte" lässt sich jede Karte in Unter-Schritte aufklappen. Über „Importieren aus …" werden Schritte aus einer bestehenden Process-Map- oder SIPOC-Instanz übernommen.' },
        ],
      },
      en: {
        title: 'How to use',
        blocks: [
          { type: 'paragraph', content: 'Use "Add step left (VA)" or "Add step right (NVA)" to append a step to the end of the chain in that band. The arrow button on a card (↓ or ↑) moves it to the other band without changing its position in the chain. The `»` button between two columns opens a small menu and inserts a step there, top (VA) or bottom (NVA). Cards are grabbed by their blue number: drop one on an arrow between two cards to reorder the chain — the card keeps its band, even when the arrow sits in the other one. Drop it on a band\'s empty area to re-classify it without changing its position. "Detail steps" expands any card into sub-steps. "Import from …" pulls steps in from an existing Process Map or SIPOC instance.' },
        ],
      },
    },

    valueClassification: {
      de: {
        title: 'Import und Wert-Einstufung',
        blocks: [
          { type: 'paragraph', content: 'Beim Import aus einer Process Map wird deren dreistufige Wert-Einstufung auf die zwei Spalten abgebildet: „wertschöpfend" bleibt oben, „nicht wertschöpfend" wandert nach unten, und „notwendig, aber nicht wertschöpfend" (BNVA) landet ebenfalls unten — es ist Aufwand, den der Kunde nicht bezahlt, auch wenn er heute nicht entfallen kann. Schritte ohne Einstufung landen oben. Aus SIPOC kommen alle Schritte oben an, weil dort keine Wert-Information hinterlegt ist; die Einstufung erfolgt danach von Hand über den Pfeil-Knopf.' },
        ],
      },
      en: {
        title: 'Import and value classification',
        blocks: [
          { type: 'paragraph', content: 'Importing from a Process Map maps its three-level value classification onto the two columns: "value-added" stays in the top band, "non-value-added" moves down, and "business-necessary but non-value-added" (BNVA) also moves down — it is effort the customer does not pay for, even if it cannot be dropped today. Steps without a classification land on top. SIPOC carries no value information, so all its steps arrive in the top band and are classified by hand afterwards via the arrow button.' },
        ],
      },
    },
  },
};
