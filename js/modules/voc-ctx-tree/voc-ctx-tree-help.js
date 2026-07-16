/**
 * D.Mike — VoC → CTx Tree Module Handbook (voc-ctx-tree-help.js)
 * Bilingual help content (DE/EN) for the Voice of Customer to Critical-to-X tree.
 */

export default {
  moduleId: 'voc-ctx-tree',
  sections: {
    overview: {
      de: {
        title: 'Überblick',
        blocks: [
          {
            type: 'paragraph',
            content: 'Der VoC → CTx-Baum übersetzt unstrukturierte Kundenaussagen in messbare Anforderungen. Ausgehend von der {{term:voc|Voice of Customer}} (VoC) werden Bedürfnisse identifiziert, in Treiber zerlegt und schließlich in {{term:ctq|Critical-to-X}}-Anforderungen (CTQ, CTC, CTD) überführt — also in messbare Eigenschaften, die ein Prozess oder Produkt erfüllen muss.',
          },
          {
            type: 'definition',
            term: 'Voice of Customer (VoC)',
            content: 'Originalaussagen von Kunden — wörtlich, unsortiert, oft emotional. Quellen sind Interviews, Beschwerden, Umfragen, Reklamationen. Diese Ebene wird nicht interpretiert, nur dokumentiert.',
          },
          {
            type: 'definition',
            term: 'Bedürfnis (Need)',
            content: 'Die hinter der Aussage liegende Erwartung — verdichtet und entpersonalisiert. „Ich warte ewig auf mein Essen" wird zu „schnelle Lieferung". Mehrere VoC-Aussagen können zu einem Bedürfnis verschmelzen.',
          },
          {
            type: 'definition',
            term: 'Treiber (Driver)',
            content: 'Konkrete Eigenschaften des Prozesses oder Produkts, die das Bedürfnis adressieren. Aus „schnelle Lieferung" wird z. B. „Bearbeitungszeit", „Versandzeit", „Lagerverfügbarkeit".',
          },
          {
            type: 'definition',
            term: 'Critical-to-X (CTQ, CTC, CTD)',
            content: 'Messbare, spezifizierte Anforderungen — meist Critical-to-Quality (CTQ), Critical-to-Cost (CTC) oder Critical-to-Delivery (CTD). Beispiel: „Lieferzeit ≤ 30 Min in 95 % der Fälle". Mit Sollwert, Toleranz und Messmethode.',
          },
          {
            type: 'paragraph',
            content: 'Der Baum verbindet die emotionale Kundenwelt mit der zahlenorientierten Prozesswelt. Ohne diese Übersetzung bleibt VoC ein Stimmungsbild, mit ihr wird sie zur Spezifikation.',
          },
        ],
      },
      en: {
        title: 'Overview',
        blocks: [
          {
            type: 'paragraph',
            content: 'The VoC → CTx tree translates unstructured customer statements into measurable requirements. Starting from the Voice of Customer (VoC), needs are identified, broken down into drivers, and finally converted into Critical-to-X requirements (CTQ, CTC, CTD) — measurable properties a process or product must fulfill.',
          },
          {
            type: 'definition',
            term: 'Voice of Customer (VoC)',
            content: 'Original customer statements — verbatim, unsorted, often emotional. Sources include interviews, complaints, surveys, returns. This level is not interpreted, only recorded.',
          },
          {
            type: 'definition',
            term: 'Need',
            content: 'The expectation behind the statement — condensed and depersonalized. "I wait forever for my food" becomes "fast delivery". Several VoC statements can merge into one need.',
          },
          {
            type: 'definition',
            term: 'Driver',
            content: 'Concrete properties of the process or product that address the need. "Fast delivery" becomes e.g. "processing time", "shipping time", "inventory availability".',
          },
          {
            type: 'definition',
            term: 'Critical-to-X (CTQ, CTC, CTD)',
            content: 'Measurable, specified requirements — usually Critical-to-Quality (CTQ), Critical-to-Cost (CTC), or Critical-to-Delivery (CTD). Example: "Delivery time ≤ 30 min in 95% of cases". With target, tolerance, and measurement method.',
          },
          {
            type: 'paragraph',
            content: 'The tree connects the emotional customer world with the number-driven process world. Without this translation, VoC stays a mood snapshot; with it, it becomes a specification.',
          },
        ],
      },
    },

    methodology: {
      de: {
        title: 'Vorgehen',
        blocks: [
          {
            type: 'list',
            items: [
              'VoC-Aussagen sammeln — möglichst wörtlich, möglichst aus mehreren Quellen.',
              'Aussagen gruppieren und zu Bedürfnissen verdichten.',
              'Pro Bedürfnis Treiber ableiten — was im Prozess bestimmt das Erleben?',
              'Pro Treiber eine oder mehrere CTx-Anforderungen formulieren — mit Messgröße, Sollwert und Toleranz.',
              'Mit Kunden bzw. Stakeholdern gegenprüfen — sind die CTx wirklich das, was gemeint war?',
              'Priorisieren — nicht alle Anforderungen sind gleich wichtig. Kano-Modell oder Gewichtung helfen.',
            ],
          },
        ],
      },
      en: {
        title: 'Approach',
        blocks: [
          {
            type: 'list',
            items: [
              'Collect VoC statements — verbatim where possible, from multiple sources.',
              'Group statements and condense into needs.',
              'Derive drivers per need — what in the process determines the experience?',
              'Formulate one or more CTx requirements per driver — with measure, target, and tolerance.',
              'Validate with customers or stakeholders — do the CTx really capture what was meant?',
              'Prioritize — not every requirement matters equally. Kano model or weighting helps.',
            ],
          },
        ],
      },
    },

    pitfalls: {
      de: {
        title: 'Stolperfallen',
        blocks: [
          {
            type: 'definition',
            term: 'Direkt zu Lösungen springen',
            content: 'Aus „Essen kommt zu spät" wird sofort „neuen Lieferdienst kaufen". Erst Bedürfnis und Treiber sauber ableiten — die Lösung kommt am Ende, nicht am Anfang.',
          },
          {
            type: 'definition',
            term: 'VoC interpretiert statt zitiert',
            content: 'Wer Aussagen umformuliert, verliert die Originalfärbung. Auf der VoC-Ebene wörtlich bleiben — die Verdichtung gehört auf die Need-Ebene.',
          },
          {
            type: 'definition',
            term: 'CTx ohne Messgröße',
            content: '„Schnelle Lieferung" ist keine CTx-Anforderung, sondern ein Wunsch. Eine echte CTx hat eine Zahl, eine Einheit und ein Akzeptanzkriterium.',
          },
          {
            type: 'definition',
            term: 'Eine Quelle dominiert',
            content: 'Wenn nur die lautesten Beschwerden ausgewertet werden, entsteht ein verzerrtes Bild. Auch zufriedene Kunden befragen, Stichproben über die ganze Kundenbasis ziehen.',
          },
          {
            type: 'definition',
            term: 'Alle Bedürfnisse gleich gewichtet',
            content: 'Manche Anforderungen sind Basis (müssen erfüllt sein), andere Begeisterer (überraschen positiv). Ohne Priorisierung wird Aufwand auf Unwichtiges verteilt.',
          },
          {
            type: 'definition',
            term: 'Kein Abgleich mit dem Kunden',
            content: 'Der Baum ist eine Hypothese, bis er rückgespiegelt wurde. Mindestens die wichtigsten CTx mit Kunden oder ihrem Vertreter (Vertrieb, Support) verifizieren.',
          },
        ],
      },
      en: {
        title: 'Pitfalls',
        blocks: [
          {
            type: 'definition',
            term: 'Jumping to solutions',
            content: '"Food arrives too late" instantly becomes "buy a new delivery service". First derive need and driver cleanly — the solution comes at the end, not the beginning.',
          },
          {
            type: 'definition',
            term: 'VoC interpreted instead of quoted',
            content: 'Rephrasing statements loses the original tone. Stay verbatim at the VoC level — condensation belongs at the need level.',
          },
          {
            type: 'definition',
            term: 'CTx without a measure',
            content: '"Fast delivery" is not a CTx requirement but a wish. A true CTx has a number, a unit, and an acceptance criterion.',
          },
          {
            type: 'definition',
            term: 'One source dominates',
            content: 'If only the loudest complaints are analyzed, the picture is biased. Also interview satisfied customers and sample across the whole customer base.',
          },
          {
            type: 'definition',
            term: 'All needs weighted equally',
            content: 'Some requirements are basic (must be met), others are delighters (positively surprise). Without prioritization, effort spreads onto the unimportant.',
          },
          {
            type: 'definition',
            term: 'No customer validation',
            content: 'The tree is a hypothesis until it has been mirrored back. Verify at least the most important CTx with customers or their representative (sales, support).',
          },
        ],
      },
    },
  },
};
