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
            content: 'Die {{term:ce-matrix|C&E-Matrix}} (Cause-and-Effect-Matrix, auch X-Y-Matrix oder Prioritätenmatrix) verbindet Prozess-Eingaben (X, Inputs) mit Kunden-Outputs (Y) und zeigt, welche X auf welche Y am stärksten wirken. Sie ist die strukturierte Brücke zwischen SIPOC und tieferen Analysen wie {{term:fmea|FMEA}}, DOE oder {{term:regression|Regression}}.',
          },
          {
            type: 'definition',
            term: 'Outputs (Y, Spalten)',
            content: 'Die kundenrelevanten Ergebnisgrößen — z. B. Maßhaltigkeit, Oberflächenrauheit, Durchlaufzeit. Jeder Output bekommt eine Wichtung (1–10), die ausdrückt, wie wichtig er aus Kundensicht ist.',
          },
          {
            type: 'definition',
            term: 'Inputs (X, Zeilen)',
            content: 'Die Prozessparameter und Einflussgrößen — z. B. Temperatur, Vorschub, Materialcharge, Werkzeugverschleiß. Sie stammen typischerweise aus dem SIPOC und dem {{term:ishikawa|Ishikawa-Diagramm}}.',
          },
          {
            type: 'definition',
            term: 'Bewertung (Zelle)',
            content: 'In jeder Zelle wird bewertet, wie stark der jeweilige Input auf den jeweiligen Output wirkt. Die Skala wählen Sie unter der Matrix: 0–10, 0/1/3/9 oder 0/3/7/10. 0 = kein Einfluss, der höchste Wert = sehr starker Einfluss. Werte außerhalb der gewählten Skala werden abgelehnt und rot markiert, nicht still verändert.',
          },
          {
            type: 'definition',
            term: 'Gewichtete Summe (Score)',
            content: 'Pro Zeile wird die Summe (Wichtung × Bewertung) über alle Spalten gebildet. Inputs mit hohem Score sind die wichtigsten Hebel und werden in der nächsten Phase bevorzugt analysiert.',
          },
          {
            type: 'definition',
            term: 'Pareto der X',
            content: 'Das Diagramm sortiert die Inputs nach Score. Anders als bei Fehlerdaten ist dieser Pareto meist flach: Jeder Score ist eine Summe über mehrere Outputs, dadurch gleichen sich die Werte an. Das ist normal und kein Fehler der Bewertung. Schneiden Sie an einer natürlichen Lücke im Verlauf ab und entscheiden Sie bei nahezu gleichen Scores per Paarvergleich. Hat die Matrix mehr als 20 Inputs, fasst der letzte Balken den Rest als „Sonstige“ zusammen; die Summenlinie bezieht sich immer auf alle Inputs.',
          },
        ],
      },
      en: {
        title: 'Overview',
        blocks: [
          {
            type: 'paragraph',
            content: 'The {{term:ce-matrix|C&E Matrix}} (Cause-and-Effect Matrix, also called X-Y Matrix or priority matrix) links process inputs (X) to customer outputs (Y) and shows which X affect which Y most strongly. It is the structured bridge between SIPOC and deeper analyses like {{term:fmea|FMEA}}, DOE, or regression.',
          },
          {
            type: 'definition',
            term: 'Outputs (Y, columns)',
            content: 'The customer-relevant results — e.g. dimensional accuracy, surface roughness, {{term:durchlaufzeit|lead time}}. Each output gets a weight (1–10) reflecting its importance from the customer perspective.',
          },
          {
            type: 'definition',
            term: 'Inputs (X, rows)',
            content: 'The process parameters and influencing factors — e.g. temperature, feed rate, material batch, tool wear. They typically come from SIPOC and the Ishikawa diagram.',
          },
          {
            type: 'definition',
            term: 'Rating (cell)',
            content: 'In each cell, rate how strongly the input affects the output. Choose the scale below the matrix: 0–10, 0/1/3/9 or 0/3/7/10. 0 = no impact, the top value = very strong impact. Values outside the chosen scale are rejected and marked red, never silently changed.',
          },
          {
            type: 'definition',
            term: 'Weighted sum (score)',
            content: 'For each row, the sum of (weight × rating) across all columns is computed. Inputs with high scores are the most important levers and are addressed first in the next phase.',
          },
          {
            type: 'definition',
            term: 'Pareto of X',
            content: 'The chart sorts the inputs by score. Unlike defect data, this {{term:pareto|Pareto}} is usually flat: every score is a sum over several outputs, so the values even out. That is normal and not a rating mistake. Cut at a natural gap in the profile and use a pairwise comparison for near-ties. With more than 20 inputs the last bar combines the rest as "Other"; the cumulative line always refers to all inputs.',
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
              'Skala vor dem Workshop festlegen (0–10, 0/1/3/9 oder 0/3/7/10), dann pro Zelle bewerten: Wie stark wirkt dieses X auf dieses Y?',
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
              'Agree on the scale before the workshop (0–10, 0/1/3/9 or 0/3/7/10), then rate each cell: how strongly does this X affect this Y?',
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
              'Flacher Verlauf der Scores → der Normalfall; an einer natürlichen Lücke abschneiden, knappe Fälle per Paarvergleich entscheiden.',
              'Wenige X mit deutlich höherem Score → seltener, aber dann ist die Auswahl eindeutig.',
              'Σ Spalte (Kontrollzahl) → zeigt, wie stark jeder Output durch die Inputs abgedeckt ist. Eine kleine Spaltensumme bei hoch gewichtetem Output heißt: Für diese Kundenanforderung fehlen vermutlich Inputs.',
              'Zeilen mit Score 0 → kandidiert zum Streichen aus der Liste der relevanten X.',
              'Spalten ohne hohe Bewertungen → entweder gut beherrscht oder bisher nicht genug verstanden.',
              'Inputs, die nur ein einziges Y dominieren → spezielle, klar adressierbare Hebel.',
            ],
          },
          {
            type: 'paragraph',
            content: 'Die C&E-Matrix ist ein Konsens-Werkzeug. Die Werte spiegeln das Wissen des Teams — sie sind Hypothesen, keine Fakten. Bei kritischen X mit Daten ({{term:korrelation|Korrelation}}, Regression, DOE) absichern.',
          },
        ],
      },
      en: {
        title: 'Interpretation',
        blocks: [
          {
            type: 'list',
            items: [
              'Flat score profile → the normal case; cut at a natural gap and settle near-ties with a pairwise comparison.',
              'Few X with clearly higher score → less common, but then the choice is clear.',
              'Σ column (control number) → shows how well each output is covered by the inputs. A small column sum on a highly weighted output means inputs are probably missing for that customer requirement.',
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
            content: 'Wenn alle Bewertungen im oberen Bereich der Skala liegen, geht die Differenzierung zwischen den Zellen verloren. Bewusst auch 0 und niedrige Werte vergeben. Ein flacher Pareto allein ist dagegen kein Zeichen dafür — er ist bei der C&E-Matrix der Normalfall.',
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
            content: 'If all ratings sit at the top of the scale, the cells no longer differ. Use 0 and low values deliberately. A flat Pareto alone is not a sign of this — for the C&E matrix it is the normal case.',
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
