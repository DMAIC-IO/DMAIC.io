/**
 * D.Mike — Pairwise Comparison Module Handbook (pairwise-comparison-help.js)
 * Bilingual help content (DE/EN) for the pairwise comparison module.
 */

export default {
  moduleId: 'pairwise-comparison',
  sections: {
    overview: {
      de: {
        title: 'Überblick',
        blocks: [
          {
            type: 'paragraph',
            content: 'Der Paarweise Vergleich ist eine einfache, aber effektive Technik zur Priorisierung. Statt eine Liste auf einmal zu sortieren, werden die Elemente paarweise gegenübergestellt — pro Vergleich wird entschieden, welches wichtiger ist. Aus den vielen Einzelentscheidungen ergibt sich am Ende eine eindeutige Rangfolge, auch wenn das Team sich bei einer Globalbewertung uneinig wäre.',
          },
          {
            type: 'definition',
            term: 'Vergleichsobjekte',
            content: 'Die zu priorisierenden Elemente — z. B. Verbesserungsideen, Anforderungen, Risiken, Lieferantenoptionen. Idealerweise 5–10 Stück; bei mehr wird die Anzahl der Vergleiche unhandlich.',
          },
          {
            type: 'definition',
            term: 'Paarvergleich',
            content: 'Zwei Objekte werden direkt verglichen — „Ist A wichtiger als B?". Bei n Objekten ergeben sich n × (n−1) / 2 Vergleiche (z. B. 10 Objekte → 45 Paare).',
          },
          {
            type: 'definition',
            term: 'Bewertungsskala',
            content: 'Pro Vergleich wird entweder binär (A oder B) oder gewichtet (z. B. 1–9 nach Saaty) entschieden. Binär ist schneller, gewichtet liefert feinere Differenzierung.',
          },
          {
            type: 'definition',
            term: 'Ergebnis',
            content: 'Pro Objekt wird gezählt, wie oft es als wichtiger gewählt wurde. Die Summen ergeben die Rangfolge — höchste Punktzahl = höchste Priorität.',
          },
          {
            type: 'paragraph',
            content: 'Der Paarweise Vergleich eignet sich besonders, wenn ein Team eine schlecht vergleichbare Liste von Optionen ordnen muss und der erste Versuch einer Direkt-Sortierung in Streit endet. Durch das Aufteilen in Einzelentscheidungen wird der Prozess greifbarer und konsensfähiger.',
          },
        ],
      },
      en: {
        title: 'Overview',
        blocks: [
          {
            type: 'paragraph',
            content: 'Pairwise comparison is a simple but effective prioritization technique. Instead of sorting a list all at once, items are compared in pairs — for each comparison, the team decides which is more important. The many individual decisions yield a clear ranking, even when the team would disagree on a global assessment.',
          },
          {
            type: 'definition',
            term: 'Items to compare',
            content: 'The elements to prioritize — e.g. improvement ideas, requirements, risks, supplier options. Ideally 5–10; with more, the number of comparisons becomes unwieldy.',
          },
          {
            type: 'definition',
            term: 'Pair comparison',
            content: 'Two items are compared directly — "Is A more important than B?". With n items there are n × (n−1) / 2 comparisons (e.g. 10 items → 45 pairs).',
          },
          {
            type: 'definition',
            term: 'Rating scale',
            content: 'Each comparison is decided either binary (A or B) or weighted (e.g. 1–9 Saaty scale). Binary is faster, weighted gives finer differentiation.',
          },
          {
            type: 'definition',
            term: 'Result',
            content: 'For each item, count how often it was chosen as more important. The sums give the ranking — highest score = highest priority.',
          },
          {
            type: 'paragraph',
            content: 'Pairwise comparison especially fits when a team must order a list of poorly comparable options and the first direct-sort attempt ends in argument. Splitting into individual decisions makes the process more tangible and consensual.',
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
              'Liste der zu priorisierenden Objekte aufstellen — eindeutig und klar formuliert.',
              'Bewertungskriterium festlegen: „wichtiger für …", „dringender als …", „mehr Wirkung als …".',
              'Skala wählen: binär (einfach) oder gewichtet (Saaty 1–9).',
              'Im Team alle Paare durchgehen — jede Entscheidung kurz begründen.',
              'Punktsummen pro Objekt berechnen.',
              'Ergebnis als Rangfolge präsentieren und mit dem Team auf Plausibilität prüfen.',
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
              'List the items to prioritize — uniquely and clearly phrased.',
              'Define the comparison criterion: "more important for …", "more urgent than …", "higher impact than …".',
              'Choose scale: binary (simple) or weighted (Saaty 1–9).',
              'Walk through all pairs as a team — briefly justify each decision.',
              'Calculate the score totals per item.',
              'Present the result as a ranking and sanity-check it with the team.',
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
            term: 'Zu viele Objekte',
            content: 'Bei 20 Objekten sind es 190 Paare — die Sitzung wird zur Tortur und die Konzentration sinkt. Vorher grob filtern, dann erst paarweise vergleichen.',
          },
          {
            type: 'definition',
            term: 'Unklares Vergleichskriterium',
            content: 'Wenn nicht definiert ist, wonach verglichen wird, antwortet jeder gegen ein anderes Kriterium. Vorher festlegen: „wichtiger im Sinne von Kundennutzen", „im Sinne von Kosten" usw.',
          },
          {
            type: 'definition',
            term: 'Unentschieden zulassen',
            content: 'Wer „beide gleich wichtig" wählen kann, vermeidet Entscheidungen — das macht das Verfahren wirkungslos. Im Zweifel zwingen, sich für eines zu entscheiden.',
          },
          {
            type: 'definition',
            term: 'Inkonsistente Bewertungen',
            content: 'Wenn A > B und B > C, müsste auch A > C gelten. In der Praxis passiert das nicht immer — bei systematischen Widersprüchen ist das Kriterium schwammig oder die Diskussion ist abgedriftet.',
          },
          {
            type: 'definition',
            term: 'Einzelentscheidung statt Team',
            content: 'Eine paarweise Bewertung von einer Person reproduziert deren Vorlieben. Im Team werden andere Perspektiven sichtbar — und das Ergebnis ist tragfähiger.',
          },
          {
            type: 'definition',
            term: 'Ergebnis blind übernehmen',
            content: 'Die Rangfolge ist eine Entscheidungshilfe, kein Urteil. Wenn das Bauchgefühl klar widerspricht, hat oft das Kriterium oder die Liste eine Lücke — nicht das Verfahren versagt.',
          },
        ],
      },
      en: {
        title: 'Pitfalls',
        blocks: [
          {
            type: 'definition',
            term: 'Too many items',
            content: 'With 20 items there are 190 pairs — the session becomes torture and focus drops. Pre-filter roughly first, then compare pairwise.',
          },
          {
            type: 'definition',
            term: 'Unclear comparison criterion',
            content: 'If it is not defined what is compared, everyone answers against a different criterion. Set it beforehand: "more important in terms of customer value", "in terms of cost", etc.',
          },
          {
            type: 'definition',
            term: 'Allowing ties',
            content: 'Letting people pick "both equally important" avoids decisions — and makes the method ineffective. When in doubt, force a choice.',
          },
          {
            type: 'definition',
            term: 'Inconsistent ratings',
            content: 'If A > B and B > C, then A > C should also hold. In practice this is not always true — systematic contradictions point to a fuzzy criterion or a derailed discussion.',
          },
          {
            type: 'definition',
            term: 'Individual instead of team',
            content: 'A pairwise scoring done by one person reproduces their preferences. In a team, other perspectives surface — and the result is more robust.',
          },
          {
            type: 'definition',
            term: 'Blindly accepting the result',
            content: 'The ranking is a decision aid, not a verdict. When gut feeling clearly disagrees, it is often the criterion or list that has a gap — not the method that failed.',
          },
        ],
      },
    },
  },
};
