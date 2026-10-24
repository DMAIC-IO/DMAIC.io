/**
 * D.Mike — Morphological Box Module Help (morphological-box-help.js)
 */
export default {
  moduleId: 'morphological-box',
  sections: {
    methodology: {
      de: {
        title: 'Methodik',
        blocks: [
          { type: 'paragraph', content: 'Der morphologische Kasten (Zwicky) zerlegt eine Lösung in unabhängige Parameter, sammelt je Parameter alternative Ausprägungen und kombiniert je eine Ausprägung pro Parameter zu einem Gesamtkonzept.' },
          { type: 'definition', term: 'Parameter', content: 'Eine Teilfunktion oder Eigenschaft der Lösung, etwa „Antrieb“ oder „Transportmittel“. Jede Zeile des Kastens ist ein Parameter.' },
          { type: 'definition', term: 'Ausprägung', content: 'Eine konkrete Alternative für einen Parameter. Die Ausprägungen eines Parameters schließen sich gegenseitig aus.' },
          { type: 'definition', term: 'Verträglichkeit', content: 'In der Verträglichkeitsmatrix werden Paare von Ausprägungen verschiedener Parameter als unverträglich markiert (Cross-Consistency-Assessment nach Ritchey). Das Modul zählt alle und alle verträglichen Kombinationen.' },
          { type: 'definition', term: 'Konzept', content: 'Ein Pfad durch den Kasten: je Parameter eine gewählte Ausprägung. Konzepte erscheinen als farbige Punkte in den Zellen; ein Konzept mit unverträglichem Paar wird gewarnt.' },
          { type: 'paragraph', content: 'Die Konzepte sind Kandidaten für die anschließende Lösungsauswahl. Bewertet und gewichtet wird hier nicht.' },
        ]
      },
      en: {
        title: 'Methodology',
        blocks: [
          { type: 'paragraph', content: 'The morphological box (Zwicky) decomposes a solution into independent parameters, collects alternative options per parameter and combines one option per parameter into a whole concept.' },
          { type: 'definition', term: 'Parameter', content: 'A sub-function or property of the solution, such as "drive" or "vehicle". Every row of the box is a parameter.' },
          { type: 'definition', term: 'Option', content: 'A concrete alternative for a parameter. The options of one parameter exclude each other.' },
          { type: 'definition', term: 'Consistency', content: 'The consistency matrix marks pairs of options from different parameters as incompatible (cross-consistency assessment after Ritchey). The module counts all combinations and all consistent ones.' },
          { type: 'definition', term: 'Concept', content: 'A path through the box: one chosen option per parameter. Concepts show as coloured dots in the cells; a concept with an incompatible pair is flagged.' },
          { type: 'paragraph', content: 'The concepts are candidates for the subsequent solution selection. Nothing is scored or weighted here.' },
        ]
      }
    },
    example: {
      de: {
        title: 'Beispiel',
        blocks: [
          { type: 'steps', items: [
            'Legen Sie über „+“ unter dem Kasten die Teilfunktionen der Lösung an und benennen Sie sie.',
            'Tragen Sie je Parameter die Ausprägungen ein; „+“ am Zeilenende fügt eine weitere hinzu.',
            'Markieren Sie in der Ansicht „Verträglichkeit“ Paare, die nicht zusammenpassen.',
            'Legen Sie über „Konzept hinzufügen“ ein Konzept an und wählen Sie im Kasten je Parameter eine Ausprägung.',
            'Prüfen Sie in der Konzeptliste, ob jedes Konzept vollständig und widerspruchsfrei ist.',
          ] },
        ]
      },
      en: {
        title: 'Example',
        blocks: [
          { type: 'steps', items: [
            'Use "+" below the box to create the sub-functions of the solution and name them.',
            'Enter the options per parameter; "+" at the row end adds another one.',
            'In the "Consistency" view, mark the pairs that do not fit together.',
            'Use "Add concept" to create a concept and pick one option per parameter in the box.',
            'Check in the concept list whether each concept is complete and free of conflicts.',
          ] },
        ]
      }
    },
  },
};
