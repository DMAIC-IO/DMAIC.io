/**
 * D.Mike — Heatmap Chart Module Handbook (heatmap-help.js)
 * Bilingual help content (DE/EN) for the heatmap module.
 */

export default {
  moduleId: 'heatmap',
  sections: {
    overview: {
      de: {
        title: 'Aufbau einer Heatmap',
        blocks: [
          {
            type: 'paragraph',
            content: 'Eine {{term:heatmap|Heatmap}} ordnet die Zellen einer {{term:kontingenztafel|Kreuztabelle}} in einem Gitter an und kodiert ihren Wert über die Farbintensität. So lassen sich Muster und Auffälligkeiten in zweidimensionalen Daten auf einen Blick erkennen — viel schneller, als wenn man Zahlen aus einer Tabelle ablesen müsste.',
          },
          {
            type: 'definition',
            term: 'X- und Y-Achse',
            content: 'Beide Achsen sind {{term:skalenniveau|kategorial}}: die X-Spalte (X-Slot) bestimmt die Spalten, die G-Spalte (G-Slot) bestimmt die Zeilen. Die Reihenfolge der Kategorien entspricht der Eingabereihenfolge im Worksheet.',
          },
          {
            type: 'definition',
            term: 'Zellwert',
            content: 'Ohne Wertespalte zeigt jede Zelle die Häufigkeit der Kombination (X, G) — die Heatmap wird dann zu einer farbcodierten Kreuztabelle. Mit Wertespalte (V) zeigt jede Zelle den Mittelwert oder die Summe der V-Werte innerhalb der Kombination — z. B. „mittlere Zykluszeit pro Schicht × Linie".',
          },
          {
            type: 'definition',
            term: 'Farbskala',
            content: 'Die Akzentfarbe wird linear von hell (kleinster Wert) zu dunkel (größter Wert) skaliert. Zellen ohne Daten erscheinen in neutralem Grau. So sieht man Hotspots und kalte Stellen auf einen Blick, während die exakten Zahlen in den Zellen (Zellbeschriftung im Editor) die quantitative Lesbarkeit erhalten.',
          },
          {
            type: 'paragraph',
            content: 'Typische Anwendungen im Six-Sigma-Kontext: Defekthäufigkeit nach Schicht × Linie, mittlere Bearbeitungszeit nach Standort × Auftragstyp, Effektive Yield nach Maschine × Werkstoff. Wenn beide kategorialen Variablen wenige (≤10) Ausprägungen haben, ist die Heatmap dem mehrfachen Boxplot oder dem gestapelten Säulendiagramm oft überlegen.',
          },
        ],
      },
      en: {
        title: 'Anatomy of a Heatmap',
        blocks: [
          {
            type: 'paragraph',
            content: 'A {{term:heatmap|heatmap}} arranges the cells of a {{term:kontingenztafel|cross-tabulation}} in a grid and encodes their value with color intensity. Patterns and anomalies in two-dimensional data become visible at a glance — much faster than reading numbers off a table.',
          },
          {
            type: 'definition',
            term: 'X and Y axis',
            content: 'Both axes are {{term:skalenniveau|categorical}}: the X column (X slot) drives the columns; the G column (G slot) drives the rows. Category order follows the input order in the worksheet.',
          },
          {
            type: 'definition',
            term: 'Cell value',
            content: 'Without a value column, each cell shows the frequency of the (X, G) combination — the heatmap becomes a color-coded cross-tabulation. With a value column (V), each cell shows the mean or sum of V within the combination — e.g. "mean cycle time per shift × line".',
          },
          {
            type: 'definition',
            term: 'Color scale',
            content: 'The accent color scales linearly from light (smallest value) to dark (largest value). Cells without data appear neutral gray. Hotspots and cold spots stand out instantly, while the exact numbers shown inside the cells (toggle in the editor) preserve quantitative readability.',
          },
          {
            type: 'paragraph',
            content: 'Typical Six-Sigma uses: defect counts by shift × line, mean processing time by site × order type, effective yield by machine × material. When both categorical variables have few (≤10) levels, a heatmap often beats a series of boxplots or a stacked bar chart.',
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
            term: 'Leere Zellen ignorieren',
            content: 'Im Häufigkeitsmodus bedeutet eine leere Zelle „Kombination kommt nicht vor". Im Mittelwertmodus bedeutet sie „keine V-Werte für diese Kombination". Beides ist informativ — leere Zellen nicht übersehen, sondern fragen, warum es keine Beobachtungen gibt.',
          },
          {
            type: 'definition',
            term: 'Unbalancierte Stichproben',
            content: 'Wenn eine X-Kategorie nur einmal vorkommt, ist der Mittelwert dort gleich dem Einzelwert — die Farbe in dieser Spalte ist ein Einzelschicksal, kein robustes Muster. Bei stark unterschiedlichen Fallzahlen pro Zelle die Statistiktabelle und ggf. ein Mosaikdiagramm der Kombinationsverteilung dazunehmen.',
          },
          {
            type: 'definition',
            term: 'Mittelwert vs. Summe',
            content: 'Bei aktivem V-Slot bietet das Modul Mittelwert oder Summe an. Für Raten (Ausschussquote pro Kategorie) ist „Mittelwert" richtig, für Volumen (Gesamtausschuss pro Kategorie) „Summe". Falsche Wahl führt zu Fehlinterpretationen — die Achsenbeschriftung der Zellen prüft, ob „Mittelwert von …" oder „Summe von …" steht.',
          },
          {
            type: 'definition',
            term: 'Zu viele Kategorien',
            content: 'Bei mehr als ~15 Kategorien je Achse werden die Zellen so klein, dass die Beschriftung wegfällt und die Farbnuancen schlecht unterscheidbar sind. In diesem Fall die Kategorien gruppieren (z. B. zu Stunden statt Minuten) oder die seltensten Kategorien in „Sonstige" zusammenfassen.',
          },
          {
            type: 'definition',
            term: 'Verwechslung mit Korrelations-Heatmap',
            content: 'Eine Korrelationsmatrix-Heatmap (numerische Korrelationen zwischen Variablen) ist ein anderer Anwendungsfall — dafür gibt es das Korrelations-Modul. Diese Heatmap zeigt Kreuztabellen kategorialer Daten, keine paarweisen Korrelationen.',
          },
        ],
      },
      en: {
        title: 'Pitfalls',
        blocks: [
          {
            type: 'definition',
            term: 'Don\'t ignore empty cells',
            content: 'In frequency mode an empty cell means "this combination never occurs". In mean mode it means "no V values for this combination". Both are informative — don\'t overlook empty cells, ask why no observations exist.',
          },
          {
            type: 'definition',
            term: 'Unbalanced samples',
            content: 'When one X-category appears only once, its mean equals that single value — the color there reflects a singular event, not a robust pattern. With strongly different cell counts, check the stats table and consider a mosaic plot of the combination distribution alongside.',
          },
          {
            type: 'definition',
            term: 'Mean vs. sum',
            content: 'With a V slot the module offers mean or sum. For rates (defect rate per category) use "mean"; for volumes (total scrap per category) use "sum". The wrong choice misleads — check the cell labels: "Mean of …" or "Sum of …".',
          },
          {
            type: 'definition',
            term: 'Too many categories',
            content: 'Beyond ~15 categories per axis cells become so small that labels disappear and color shades blend together. Bin the categories (e.g. into hours instead of minutes) or collapse the rarest into "Other".',
          },
          {
            type: 'definition',
            term: 'Not the correlation heatmap',
            content: 'A correlation-matrix heatmap (numeric correlations between variables) is a different use case — the correlation module handles that. This heatmap visualises cross-tabulations of categorical data, not pairwise correlations.',
          },
        ],
      },
    },
  },
};
