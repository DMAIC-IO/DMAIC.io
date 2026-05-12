/**
 * D.Mike — Chart Suggestion Module Handbook (chart-suggestion-help.js)
 * Bilingual help content (DE/EN) for the chart-suggestion module.
 */

export default {
  moduleId: 'chart-suggestion',
  sections: {
    overview: {
      de: {
        title: 'So funktioniert der Diagramm-Vorschlag',
        blocks: [
          {
            type: 'paragraph',
            content: 'Die Diagramm-Vorschlag-Werkzeug liest die analytischen Rollen Deiner ausgewählten Spalten und schlägt geeignete Diagrammtypen vor — sortiert nach Eignung. Die Logik orientiert sich an „Show-Me"-Mustern aus Tableau und dem Minitab Graph Builder.',
          },
          {
            type: 'paragraph',
            content: 'Du erreichst das Werkzeug am schnellsten über den Button „Diagramm vorschlagen" in der Worksheet-Werkzeugleiste. Wähle vorher eine oder mehrere Spalten aus.',
          },
          {
            type: 'definition',
            term: 'Eingabe: Spaltenauswahl',
            content: 'Markiere im Worksheet eine oder mehrere Spalten. Aus der Kombination ihrer Rollen (Stetig, Kategorial, Ordinal, Datum) leiten wir den passenden Visualisierungstyp ab.',
          },
          {
            type: 'definition',
            term: 'Ausgabe: Ranking',
            content: 'Links siehst Du die rangierten Vorschläge mit Score (0–100, höher = besser passend). Rechts zeigen wir den gewählten Diagrammtyp als Vorschau. Klick auf einen Vorschlag wechselt die Vorschau.',
          },
          {
            type: 'definition',
            term: 'Einfluss der Stichprobengröße',
            content: 'Manche Diagramme sind nur sinnvoll ab einer Mindestgröße. Bei n < 20 z.B. wird das Histogramm ausgeblendet, weil Boxplot und Einzelwertdiagramm dort aussagekräftiger sind. Eine Regelkarte braucht mindestens 25 Punkte.',
          },
          {
            type: 'definition',
            term: 'Im eigenen Modul öffnen',
            content: 'Über der Vorschau gibt es bei vielen Diagrammen den Button „Im eigenen Modul öffnen". Er legt eine neue Instanz des entsprechenden Vollmoduls (Histogramm, Boxplot, Einzelwertdiagramm, Verlaufsdiagramm, Wahrscheinlichkeitsnetz oder XY-Diagramm) im gleichen Phasenbereich an — mit den ausgewählten Spalten bereits vorverknüpft, sodass Du direkt mit Anmerkungen, Referenzlinien, Achsen-Tuning oder Export weiterarbeiten kannst. Für reine Vergleichs-Diagramme (Balken, Pareto, Torte) und für die Scatter-Matrix existiert kein dedizierter Modul-Klick — der Button ist dort ausgeblendet.',
          },
          {
            type: 'definition',
            term: 'Streudiagramm-Matrix (≥3 stetige Spalten)',
            content: 'Wählst Du drei oder mehr stetige Spalten aus, schlägt der Vorschlag eine Streudiagramm-Matrix (SPLOM) vor. Die Vorschau rendert ein n×n-Raster aus kleinen Streudiagrammen aller Spaltenpaare; die Diagonale zeigt den jeweiligen Spaltennamen. Bei mehr als sechs Spalten werden nur die ersten sechs gezeigt — Performance- und Lesbarkeitsgrenze.',
          },
          {
            type: 'definition',
            term: 'Regelkarten-Vorschau',
            content: 'Bei der Kombination „Datum + stetige Spalte" enthält der Vorschlag eine Regelkarte. Die Vorschau berechnet automatisch eine I-Karte (Individuals-Chart) mit zentralem Mittelwert, ±3σ-Grenzen (σ aus dem mittleren Moving Range, d2=1,128) und der Beobachtung sortiert nach Datum. Für X̄/R, X̄/S oder Phase-I-Ausschlüsse wechselst Du in die ausgewachsene Regelkarte unter „Control".',
          },
        ],
      },
      en: {
        title: 'How the Chart Suggestion tool works',
        blocks: [
          {
            type: 'paragraph',
            content: 'The Chart Suggestion tool reads the analytical roles of your selected columns and proposes suitable chart types, ranked by fit. The logic is inspired by Tableau\'s "Show Me" and the Minitab Graph Builder.',
          },
          {
            type: 'paragraph',
            content: 'The quickest entry point is the "Suggest Chart" button in the Worksheet toolbar. Select one or more columns first.',
          },
          {
            type: 'definition',
            term: 'Input: column selection',
            content: 'Pick one or more columns in the Worksheet. From the combination of their roles (Continuous, Categorical, Ordinal, Date) we derive the most fitting visualization type.',
          },
          {
            type: 'definition',
            term: 'Output: ranking',
            content: 'On the left you see the ranked suggestions with their score (0–100, higher is better). On the right we render a preview of the selected chart type. Click a suggestion to switch the preview.',
          },
          {
            type: 'definition',
            term: 'Effect of sample size',
            content: 'Some charts only make sense above a minimum n. With n < 20, the histogram is hidden in favor of boxplot and individual-value-plot. A control chart needs at least 25 data points.',
          },
          {
            type: 'definition',
            term: 'Open in module',
            content: 'Most previews carry an "Open in module" button above the chart. It spawns a new instance of the full module (histogram, boxplot, individual-value plot, run chart, probability plot, or XY plot) in the same phase area, with the selected columns already wired up — so you can carry on with annotations, reference lines, axis tuning, or export. For pure comparison charts (bar, Pareto, pie) and for the scatter matrix the button is hidden — there is no single dedicated module to forward to.',
          },
          {
            type: 'definition',
            term: 'Scatter matrix (≥3 continuous columns)',
            content: 'Selecting three or more continuous columns suggests a scatter matrix (SPLOM). The preview renders an n×n grid of small scatter plots for all column pairs; the diagonal shows the column name. With more than six columns only the first six are displayed — a performance and readability limit.',
          },
          {
            type: 'definition',
            term: 'Control-chart preview',
            content: 'For the combination "date + continuous" the suggestion includes a control chart. The preview automatically computes an I-chart (Individuals) with the centerline at the mean, ±3σ limits (σ derived from the mean moving range, d2=1.128) and observations sorted by date. Switch to the full Control-chart module under "Control" for X̄/R, X̄/S, or Phase-I exclusions.',
          },
        ],
      },
    },
  },
};
