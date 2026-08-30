/**
 * D.Mike — TRIZ Contradiction Matrix Module Handbook (triz-contradiction-matrix-help.js)
 * Bilingual help content (DE/EN) for Altschuller's contradiction matrix.
 */

export default {
  moduleId: 'triz-contradiction-matrix',
  sections: {
    overview: {
      de: {
        title: 'Überblick',
        blocks: [
          {
            type: 'paragraph',
            content: '{{term:triz|TRIZ}} (russisch ТРИЗ — „Theorie des erfinderischen Problemlösens") ist eine systematische Methode, technische Probleme zu lösen, indem man die zugrundeliegenden Widersprüche identifiziert und mit bewährten Lösungsmustern bearbeitet. Die {{term:widerspruchsmatrix|Widerspruchsmatrix}} ist das bekannteste TRIZ-Werkzeug.',
          },
          {
            type: 'paragraph',
            content: 'Genrich Altschuller analysierte ab 1946 zehntausende Patente und stellte fest, dass die meisten Erfindungen einem von 40 wiederkehrenden „erfinderischen Prinzipien" folgen. Er ordnete diese Prinzipien in einer 39×39-Matrix an, deren Achsen 39 generische Konstruktions-Parameter sind — auf der einen Seite der zu verbessernde Parameter, auf der anderen der dabei verschlechterte.',
          },
          {
            type: 'definition',
            term: 'Technischer Widerspruch',
            content: 'Eine Verbesserung in einem Parameter (z.B. höhere Festigkeit) führt zu einer Verschlechterung in einem anderen (z.B. höheres Gewicht). Genau für diese {{term:technischer-widerspruch|technischen Widersprüche}} liefert die Matrix Lösungsvorschläge.',
          },
          {
            type: 'definition',
            term: 'Erfinderisches Prinzip',
            content: 'Eine abstrakte Lösungsstrategie, die sich in vielen Patenten bewährt hat — z.B. „Zerlegung", „Vorgezogene Wirkung", „Dynamisierung". Insgesamt {{term:erfinderische-prinzipien|40 Prinzipien}}, nummeriert nach Altschuller.',
          },
          {
            type: 'paragraph',
            content: 'Die Matrix ersetzt Brainstorming nicht — sie liefert konkrete Denkanstöße, wenn der Lösungsraum unklar ist. Drei bis vier Prinzipien pro Zelle sind die Standardausgabe; daraus lassen sich konkrete Lösungsideen ableiten.',
          },
        ],
      },
      en: {
        title: 'Overview',
        blocks: [
          {
            type: 'paragraph',
            content: '{{term:triz|TRIZ}} (Russian: ТРИЗ — "Theory of Inventive Problem Solving") is a systematic methodology for solving technical problems by identifying underlying contradictions and applying proven solution patterns. The {{term:widerspruchsmatrix|contradiction matrix}} is its best-known tool.',
          },
          {
            type: 'paragraph',
            content: 'Starting in 1946, Genrich Altschuller analysed tens of thousands of patents and found that most inventions follow one of 40 recurring "inventive principles". He arranged these principles in a 39×39 matrix indexed by 39 generic engineering parameters — one axis is the parameter you want to improve, the other is the parameter that consequently worsens.',
          },
          {
            type: 'definition',
            term: 'Technical contradiction',
            content: 'Improving one parameter (e.g. higher strength) makes another worsen (e.g. higher weight). The matrix provides candidate solutions for exactly these {{term:technischer-widerspruch|technical contradictions}}.',
          },
          {
            type: 'definition',
            term: 'Inventive principle',
            content: 'An abstract solution strategy validated by many patents — e.g. "Segmentation", "Preliminary action", "Dynamics". {{term:erfinderische-prinzipien|40 principles}} total, numbered as in Altschuller\'s catalogue.',
          },
          {
            type: 'paragraph',
            content: 'The matrix does not replace brainstorming — it provides concrete prompts when the solution space is unclear. The standard output is three to four principles per cell, which serve as starting points for concrete ideas.',
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
              'Problem als technischen Widerspruch formulieren: „Wenn ich X verbessere, verschlechtert sich Y."',
              'X auf einen der 39 Standard-Parameter abbilden (Verbesserung).',
              'Y auf einen der 39 Standard-Parameter abbilden (Verschlechterung).',
              'Beide Parameter im Modul auswählen — die Matrix liefert 0–4 empfohlene Prinzipien.',
              'Pro Prinzip mindestens eine konkrete Lösungsidee für das eigene Problem entwickeln.',
              'Vielversprechende Ideen weiter ausarbeiten oder mit anderen TRIZ-Werkzeugen kombinieren (z.B. Stoff-Feld-Analyse, ARIZ).',
            ],
          },
          {
            type: 'paragraph',
            content: 'Das Mapping vom konkreten Problem auf die abstrakten Parameter ist der schwierigste Schritt. Hilfreich: Beschreibung des Parameters lesen (wird im Modul nach der Auswahl angezeigt) und prüfen, ob der eigene Sachverhalt darunter passt.',
          },
        ],
      },
      en: {
        title: 'Approach',
        blocks: [
          {
            type: 'list',
            items: [
              'Frame the problem as a technical contradiction: "If I improve X, then Y gets worse."',
              'Map X to one of the 39 standard parameters (improving).',
              'Map Y to one of the 39 standard parameters (worsening).',
              'Pick both parameters in the module — the matrix returns 0–4 recommended principles.',
              'For each principle, develop at least one concrete idea applicable to your problem.',
              'Develop the most promising ideas further or combine with other TRIZ tools (e.g. {{term:substanz-feld-analyse|Substance-Field analysis}}, ARIZ).',
            ],
          },
          {
            type: 'paragraph',
            content: 'Mapping a concrete problem onto the abstract parameters is the hardest step. Helpful: read the parameter description shown by the module after a selection, and check whether your case fits.',
          },
        ],
      },
    },

    interpretation: {
      de: {
        title: 'Ergebnis interpretieren',
        blocks: [
          {
            type: 'paragraph',
            content: 'Die Matrix gibt selten genau eine Lösung — sie öffnet einen Korridor möglicher Lösungsstrategien. Die empfohlenen Prinzipien sind nach Altschullers Patentanalyse die statistisch häufigsten Lösungswege für genau diesen Widerspruch.',
          },
          {
            type: 'paragraph',
            content: 'Eine leere Zelle bedeutet nicht „keine Lösung möglich", sondern nur „Altschullers Patent-Korpus enthielt keine starke Häufung". Wechsel der Parameter-Zuordnung oder Umformulierung des Widerspruchs können dann helfen.',
          },
          {
            type: 'paragraph',
            content: 'Wichtig: Die empfohlenen Prinzipien sind Anregungen, keine Patentrezepte. Erst die Übertragung auf den konkreten Sachverhalt schafft eine Lösung — dort liegt die kreative Arbeit.',
          },
          {
            type: 'paragraph',
            content: 'Wenn die Matrix mehrere widersprüchliche Prinzipien empfiehlt oder die Zelle leer bleibt, liegt häufig ein **physikalischer Widerspruch** zugrunde (derselbe Parameter muss zwei entgegengesetzte Werte annehmen). Dafür gibt es das Modul „{{term:physikalischer-widerspruch|Physikalischer Widerspruch}} (TRIZ)" mit den vier {{term:separationsprinzipien|Separationsprinzipien}}.',
          },
          {
            type: 'paragraph',
            content: 'Wer den Lösungsraum noch weiter öffnen will, formuliert vor der Matrix-Analyse ein **Ideales Endresultat** (Modul „{{term:ifr|Ideales Endresultat}} (TRIZ)") und inventarisiert die verfügbaren Ressourcen über die **Ressourcen-Checkliste**. Häufig wird die Matrix dadurch überflüssig — eine Ressource erledigt den Job direkt.',
          },
        ],
      },
      en: {
        title: 'Interpreting the result',
        blocks: [
          {
            type: 'paragraph',
            content: 'The matrix rarely gives exactly one answer — it opens a corridor of possible solution strategies. The recommended principles are statistically the most frequent solution paths for that specific contradiction in Altschuller\'s patent analysis.',
          },
          {
            type: 'paragraph',
            content: 'An empty cell does not mean "no solution exists" — only that Altschuller\'s patent corpus showed no strong clustering. Re-mapping the parameters or rephrasing the contradiction can help.',
          },
          {
            type: 'paragraph',
            content: 'Important: the recommended principles are prompts, not recipes. Only the transfer to the concrete case creates a solution — that is where the creative work happens.',
          },
          {
            type: 'paragraph',
            content: 'When the matrix recommends conflicting principles or the cell stays empty, the underlying problem is often a **physical contradiction** (the same parameter must take two opposite values). The "Physical Contradiction (TRIZ)" module addresses exactly that case via the four separation principles.',
          },
          {
            type: 'paragraph',
            content: 'To widen the solution space further, formulate an **Ideal Final Result** (module "Ideal Final Result (TRIZ)") before running the matrix and inventory available resources via the **Resources Checklist**. Quite often the matrix becomes unnecessary — an existing resource performs the job directly.',
          },
        ],
      },
    },

    references: {
      de: {
        title: 'Quellen & Weiterlesen',
        blocks: [
          {
            type: 'list',
            items: [
              'G. S. Altschuller: „Erfinden — Wege zur Lösung technischer Probleme" (1973, dt. 1984).',
              'D. Mann: „Hands-On Systematic Innovation" — moderne Aufbereitung der Matrix.',
              'oxfordcreativity.co.uk — frei verfügbare TRIZ-Materialien.',
              'Hinweis: Die Matrix-Daten in diesem Modul stammen aus der Standard-Literatur. Einzelne Zellen sollten bei kritischer Anwendung mit einer Original-Quelle abgeglichen werden.',
            ],
          },
        ],
      },
      en: {
        title: 'References & further reading',
        blocks: [
          {
            type: 'list',
            items: [
              'G. S. Altshuller: "Creativity as an Exact Science" (1984).',
              'D. Mann: "Hands-On Systematic Innovation" — modern reformulation of the matrix.',
              'oxfordcreativity.co.uk — open TRIZ resources.',
              'Note: matrix data in this module is drawn from the standard literature. For critical applications, individual cells should be cross-checked against an authoritative source.',
            ],
          },
        ],
      },
    },
  },
};
