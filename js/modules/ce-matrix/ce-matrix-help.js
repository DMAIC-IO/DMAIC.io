/**
 * D.Mike — C&E Matrix Module Handbook (ce-matrix-help.js)
 * Bilingual help content (DE/EN) for the Cause & Effect Matrix module.
 */

export default {
  moduleId: 'ce-matrix',
  sections: {
    overview: {
      de: {
        title: 'Überblick',
        blocks: [
          {
            type: 'paragraph',
            content: 'Die C&E-Matrix (Cause-and-Effect-Matrix, auch X-Y-Matrix oder Prioritätenmatrix) verbindet Prozess-Eingaben (X, Inputs) mit Kunden-Outputs (Y) und zeigt, welche X auf welche Y am stärksten wirken. Sie ist die strukturierte Brücke zwischen SIPOC und tieferen Analysen wie {{term:fmea|FMEA}}, DOE oder Regression.',
          },
          {
            type: 'definition',
            term: 'Outputs (Y, Spalten)',
            content: 'Die kundenrelevanten Ergebnisgrößen — z. B. Maßhaltigkeit, Oberflächenrauheit, Durchlaufzeit. Jeder Output bekommt eine Wichtung (1–10), die ausdrückt, wie wichtig er aus Kundensicht ist.',
          },
          {
            type: 'definition',
            term: 'Inputs (X, Zeilen)',
            content: 'Die Prozessparameter und Einflussgrößen — z. B. Temperatur, Vorschub, Materialcharge, Werkzeugverschleiß. Sie stammen typischerweise aus dem SIPOC und dem Ishikawa-Diagramm.',
          },
          {
            type: 'definition',
            term: 'Bewertung (Zelle)',
            content: 'In jeder Zelle wird auf einer Skala (typisch 0/1/3/9 oder 0/1/3/5/9) bewertet, wie stark der jeweilige Input auf den jeweiligen Output wirkt. 0 = kein Einfluss, 9 = sehr starker Einfluss.',
          },
          {
            type: 'definition',
            term: 'Gewichtete Summe (Score)',
            content: 'Pro Zeile wird die Summe (Wichtung × Bewertung) über alle Spalten gebildet. Inputs mit hohem Score sind die wichtigsten Hebel und werden in der nächsten Phase bevorzugt analysiert.',
          },
          {
            type: 'definition',
            term: 'Pareto der X',
            content: 'Sortiert man die Inputs nach Score, ergibt sich oft eine Pareto-Verteilung — wenige X dominieren das Ergebnis. Auf diese „kritischen X" konzentrieren sich die folgenden Untersuchungen.',
          },
        ],
      },
      en: {
        title: 'Overview',
        blocks: [
          {
            type: 'paragraph',
            content: 'The C&E Matrix (Cause-and-Effect Matrix, also called X-Y Matrix or priority matrix) links process inputs (X) to customer outputs (Y) and shows which X affect which Y most strongly. It is the structured bridge between SIPOC and deeper analyses like {{term:fmea|FMEA}}, DOE, or regression.',
          },
          {
            type: 'definition',
            term: 'Outputs (Y, columns)',
            content: 'The customer-relevant results — e.g. dimensional accuracy, surface roughness, lead time. Each output gets a weight (1–10) reflecting its importance from the customer perspective.',
          },
          {
            type: 'definition',
            term: 'Inputs (X, rows)',
            content: 'The process parameters and influencing factors — e.g. temperature, feed rate, material batch, tool wear. They typically come from SIPOC and the Ishikawa diagram.',
          },
          {
            type: 'definition',
            term: 'Rating (cell)',
            content: 'In each cell, rate on a scale (typically 0/1/3/9 or 0/1/3/5/9) how strongly the input affects the output. 0 = no impact, 9 = very strong impact.',
          },
          {
            type: 'definition',
            term: 'Weighted sum (score)',
            content: 'For each row, the sum of (weight × rating) across all columns is computed. Inputs with high scores are the most important levers and are addressed first in the next phase.',
          },
          {
            type: 'definition',
            term: 'Pareto of X',
            content: 'Sorting inputs by score often yields a Pareto distribution — a few X dominate the result. The next investigations focus on these "critical X".',
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
              'Outputs (Y) aus SIPOC oder VoC-CTx-Tree übernehmen — die Kundenanforderungen.',
              'Wichtung jedes Y festlegen (1–10) — diese Zahlen sollten mit dem Kunden oder Sponsor abgestimmt sein.',
              'Inputs (X) aus SIPOC und Ishikawa zusammentragen — möglichst vollständig, lieber zu viele als zu wenige.',
              'Im Workshop pro Zelle bewerten: Wie stark wirkt dieses X auf dieses Y? 0/1/3/9 ist die geläufigste Skala.',
              'Scores berechnen (automatisch in der Matrix), Inputs absteigend sortieren.',
              'Top-Kandidaten markieren — sie gehen weiter in FMEA, Hypothesentests oder DOE.',
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
              'Take outputs (Y) from SIPOC or the VoC-CTx tree — the customer requirements.',
              'Set the weight of each Y (1–10) — these numbers should be aligned with the customer or sponsor.',
              'Collect inputs (X) from SIPOC and Ishikawa — as complete as possible, better too many than too few.',
              'In a workshop, rate each cell: how strongly does this X affect this Y? 0/1/3/9 is the most common scale.',
              'Compute scores (automatic in the matrix), sort inputs descending.',
              'Mark the top candidates — they continue into FMEA, hypothesis tests, or DOE.',
            ],
          },
        ],
      },
    },

    interpretation: {
      de: {
        title: 'Interpretation',
        blocks: [
          {
            type: 'list',
            items: [
              'Wenige X mit deutlich höherem Score → klare Pareto-Situation, Fokussierung möglich.',
              'Alle X ähnlich hoch → System nicht ausreichend abgegrenzt oder Wichtungen zu undifferenziert.',
              'Zeilen mit Score 0 → kandidiert zum Streichen aus der Liste der relevanten X.',
              'Spalten ohne hohe Bewertungen → entweder gut beherrscht oder bisher nicht genug verstanden.',
              'Inputs, die nur ein einziges Y dominieren → spezielle, klar adressierbare Hebel.',
            ],
          },
          {
            type: 'paragraph',
            content: 'Die C&E-Matrix ist ein Konsens-Werkzeug. Die Werte spiegeln das Wissen des Teams — sie sind Hypothesen, keine Fakten. Bei kritischen X mit Daten (Korrelation, Regression, DOE) absichern.',
          },
        ],
      },
      en: {
        title: 'Interpretation',
        blocks: [
          {
            type: 'list',
            items: [
              'Few X with clearly higher score → a clean Pareto situation, focus is possible.',
              'All X similarly high → system not bounded enough or weights not differentiated enough.',
              'Rows with score 0 → candidates to drop from the relevant X list.',
              'Columns without high ratings → either well controlled or so far not well understood.',
              'Inputs that dominate a single Y → specific, clearly addressable levers.',
            ],
          },
          {
            type: 'paragraph',
            content: 'The C&E matrix is a consensus tool. The values reflect team knowledge — they are hypotheses, not facts. Verify critical X with data (correlation, regression, DOE).',
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
            term: 'Zu wenige Inputs',
            content: 'Wer nur die offensichtlichen X einträgt, übersieht oft entscheidende. Ishikawa und SIPOC vollständig durchgehen, bevor die Matrix bewertet wird.',
          },
          {
            type: 'definition',
            term: 'Wichtungen aus dem Bauch',
            content: 'Y-Wichtungen sollten aus VoC-Daten oder mindestens aus einer Sponsor-Abstimmung stammen — nicht aus Vermutungen. Sonst spiegelt die Matrix die Ansicht der lautesten Person.',
          },
          {
            type: 'definition',
            term: 'Skala nicht ausgenutzt',
            content: 'Wenn alle Bewertungen zwischen 3 und 9 liegen, geht die Differenzierung verloren. Bewusst auch 0 und 1 vergeben — sonst ist das Pareto-Bild flach.',
          },
          {
            type: 'definition',
            term: 'Matrix als Ergebnis statt als Hypothese',
            content: 'Hohe Scores bedeuten nicht automatisch starke reale Wirkung — sie bedeuten, dass das Team das vermutet. Vor weitreichenden Entscheidungen mit Daten validieren.',
          },
          {
            type: 'definition',
            term: 'Allein im Büro ausgefüllt',
            content: 'Die Matrix lebt von der Diskussion. Eine Person, die alle Werte allein einträgt, reproduziert nur die eigene Perspektive. Im Cross-Functional-Team arbeiten.',
          },
        ],
      },
      en: {
        title: 'Pitfalls',
        blocks: [
          {
            type: 'definition',
            term: 'Too few inputs',
            content: 'Listing only the obvious X often misses the critical ones. Walk through Ishikawa and SIPOC completely before rating the matrix.',
          },
          {
            type: 'definition',
            term: 'Weights from gut feeling',
            content: 'Y weights should come from VoC data or at least from a sponsor agreement — not from speculation. Otherwise the matrix reflects the loudest person\'s view.',
          },
          {
            type: 'definition',
            term: 'Scale not exploited',
            content: 'If all ratings are between 3 and 9, differentiation is lost. Use 0 and 1 deliberately too — otherwise the Pareto picture is flat.',
          },
          {
            type: 'definition',
            term: 'Matrix as result instead of hypothesis',
            content: 'High scores do not automatically mean strong real effect — they mean the team believes so. Validate with data before far-reaching decisions.',
          },
          {
            type: 'definition',
            term: 'Filled in alone at the desk',
            content: 'The matrix lives from discussion. One person filling in all values reproduces only their own perspective. Work in a cross-functional team.',
          },
        ],
      },
    },
  },
};
