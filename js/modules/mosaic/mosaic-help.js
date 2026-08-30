/**
 * D.Mike — Mosaic Chart Module Handbook (mosaic-help.js)
 * Bilingual help content (DE/EN) for the mosaic plot module.
 */

export default {
  moduleId: 'mosaic',
  sections: {
    overview: {
      de: {
        title: 'Aufbau eines Mosaikdiagramms',
        blocks: [
          {
            type: 'paragraph',
            content: 'Das {{term:mosaikdiagramm|Mosaikdiagramm}} zeigt die gemeinsame Verteilung zweier {{term:skalenniveau|kategorialer}} Variablen. Anders als das gestapelte Säulendiagramm — bei dem alle Säulen gleich breit sind — kodiert das Mosaikdiagramm die Randverteilung beider Variablen geometrisch: Spaltenbreiten und Segmenthöhen geben jeweils proportional die Häufigkeit wieder.',
          },
          {
            type: 'definition',
            term: 'Spaltenbreite',
            content: 'Jede Spalte gehört zu einer Ausprägung der ersten Variable (X). Die Breite ist proportional zur {{term:randverteilung|Randhäufigkeit}} dieser Ausprägung: eine breite Spalte = häufige X-Kategorie, eine schmale Spalte = seltene X-Kategorie. So sieht man auf einen Blick, wie sich die Stichprobe auf X aufteilt.',
          },
          {
            type: 'definition',
            term: 'Segmenthöhe',
            content: 'Innerhalb einer Spalte ist jede Farbe eine Ausprägung der zweiten Variable (G). Die Höhe ist proportional zur bedingten Wahrscheinlichkeit P(G | X) — also dem Anteil dieser G-Kategorie innerhalb der X-Kategorie. Sind alle Spalten gleich gemustert (gleiche Segmenthöhen), sind X und G unabhängig.',
          },
          {
            type: 'definition',
            term: 'Unabhängigkeit erkennen',
            content: 'Das Mosaikdiagramm ist ein visueller Test auf statistische Unabhängigkeit — rechnerisch prüft das der {{term:chi-quadrat-test|Chi-Quadrat-Test}}. Sind die Segment-Anteile (Höhen) über alle X-Spalten konstant, gilt P(G | X) = P(G) für alle X — die beiden Merkmale sind unabhängig. Weicht ein Segment in einer Spalte deutlich vom Gesamtanteil ab, liegt ein Zusammenhang vor.',
          },
          {
            type: 'paragraph',
            content: 'Anwendungsbereiche im Six-Sigma-Kontext: Reklamationsgrund × Vertriebsregion, Defektart × Schicht, Sortenausschuss × Maschine. Wenn das gestapelte Säulendiagramm „alle Säulen sehen gleich aus" suggeriert, deckt das Mosaikdiagramm zusätzlich auf, welche X-Kategorien überhaupt häufig sind.',
          },
        ],
      },
      en: {
        title: 'Anatomy of a Mosaic Plot',
        blocks: [
          {
            type: 'paragraph',
            content: 'The {{term:mosaikdiagramm|mosaic plot}} shows the joint distribution of two {{term:skalenniveau|categorical}} variables. Unlike a {{term:balkendiagramm|stacked bar chart}} — where every column has the same width — the mosaic plot encodes the marginal distribution of both variables geometrically: column widths and segment heights are each proportional to frequency.',
          },
          {
            type: 'definition',
            term: 'Column width',
            content: 'Each column corresponds to one level of the first variable (X). Width is proportional to the {{term:randverteilung|marginal frequency}} of that level: a wide column = frequent X-category, a narrow column = rare X-category. At a glance you see how the sample splits across X.',
          },
          {
            type: 'definition',
            term: 'Segment height',
            content: 'Inside a column, each color is one level of the second variable (G). Height is proportional to the conditional probability P(G | X) — the share of that G-level within the X-level. When all columns share the same pattern (equal segment heights), X and G are independent.',
          },
          {
            type: 'definition',
            term: 'Spotting independence',
            content: 'The mosaic plot is a visual test for statistical independence — the numerical counterpart is the {{term:chi-quadrat-test|chi-square test}}. If the segment shares (heights) stay constant across all X-columns, then P(G | X) = P(G) for every X — the two variables are independent. A segment that deviates strongly in one column reveals a relationship.',
          },
          {
            type: 'paragraph',
            content: 'Typical Six-Sigma uses: complaint reason × sales region, defect type × shift, scrap class × machine. Where a stacked bar chart says "all columns look the same", the mosaic plot additionally reveals which X-categories are common in the first place.',
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
            term: 'Zu viele Kategorien',
            content: 'Bei mehr als 5–6 X-Kategorien werden die Spalten so schmal, dass die Beschriftung kaum lesbar bleibt. Lieber Kategorien zusammenfassen oder per Filter eingrenzen. Bei zu vielen G-Kategorien wird die vertikale Farbskala unübersichtlich — als Faustregel max. 6 Stufen.',
          },
          {
            type: 'definition',
            term: 'Kleine Zellen verschwinden',
            content: 'Sehr seltene Kombinationen (X_i, G_j) erzeugen winzige Rechtecke, die im Diagramm leicht übersehen werden. Die Zellbeschriftung (Editor → „Zellbeschriftung anzeigen") setzt die Zahl in das Rechteck, wenn es groß genug ist. Trotzdem lohnt sich ein Blick in die Statistiktabelle, um die exakten Häufigkeiten zu prüfen.',
          },
          {
            type: 'definition',
            term: 'Verwechslung mit Stacked Bar',
            content: 'Beim gestapelten Säulendiagramm sind alle Säulen gleich breit; Unterschiede zwischen Kategorien sieht man nur in den Segmenthöhen. Beim Mosaikdiagramm hingegen kodiert die Breite die Randhäufigkeit — eine breite Spalte ist NICHT „dieselbe Säule, nur dicker", sondern ein häufigeres X.',
          },
          {
            type: 'definition',
            term: 'Reihenfolge der Spalten',
            content: 'Die Spalten werden in der Reihenfolge der ersten Beobachtungen im Worksheet angelegt. Wenn eine sinnvolle Reihenfolge (z. B. nach Häufigkeit oder alphabetisch) gewünscht ist, die Spalte vorab im Worksheet sortieren bzw. die Kategorienreihenfolge anpassen.',
          },
          {
            type: 'definition',
            term: 'Kausalität',
            content: 'Ein erkennbarer Zusammenhang im Mosaikdiagramm bedeutet nicht, dass X die Ursache von G (oder umgekehrt) ist — es zeigt nur Abhängigkeit. Für kausale Aussagen braucht es Versuchsplanung (DoE) oder zumindest theoretische Argumente.',
          },
        ],
      },
      en: {
        title: 'Pitfalls',
        blocks: [
          {
            type: 'definition',
            term: 'Too many categories',
            content: 'Beyond 5–6 X-categories the columns become so narrow that labels are hard to read. Group categories or filter to the most important ones. For too many G-categories the vertical color scale gets cluttered — keep it to ≈6 levels.',
          },
          {
            type: 'definition',
            term: 'Small cells disappear',
            content: 'Very rare combinations (X_i, G_j) produce tiny rectangles that are easy to overlook. Cell labels (editor → "Show cell labels") place the count inside the rectangle when it is large enough. Still, check the stats table to read off exact counts.',
          },
          {
            type: 'definition',
            term: 'Confusion with stacked bar',
            content: 'In a stacked bar chart every column has the same width; category differences only show in the segment heights. The mosaic plot, by contrast, encodes the marginal frequency in the width — a wide column is NOT "the same bar, just thicker" but a more frequent X.',
          },
          {
            type: 'definition',
            term: 'Column order',
            content: 'Columns are laid out in the order of first observation in the worksheet. If a meaningful order is desired (e.g. by frequency or alphabetic), sort the column upfront or adjust the category order.',
          },
          {
            type: 'definition',
            term: 'Causality',
            content: 'A visible relationship in the mosaic plot does NOT mean that X causes G (or vice versa) — it only shows dependence. For causal claims you need a {{term:doe|designed experiment}} (DoE) or at least solid domain theory.',
          },
        ],
      },
    },
  },
};
