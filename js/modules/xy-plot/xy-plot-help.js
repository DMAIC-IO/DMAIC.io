/**
 * D.Mike — XY-Plot Module Handbook (xy-plot-help.js)
 * Bilingual help content (DE/EN) for the XY plot module.
 */

export default {
  moduleId: 'xy-plot',
  sections: {
    overview: {
      de: {
        title: 'Überblick',
        blocks: [
          {
            type: 'paragraph',
            content: 'Das XY-Diagramm trägt zwei numerische Spalten gegeneinander auf — eine als X-Wert, eine als Y-Wert. Es ist das Standardwerkzeug, um Zusammenhänge, Trends und Muster zwischen zwei Größen sichtbar zu machen.',
          },
          {
            type: 'definition',
            term: 'Datensatz (Dataset)',
            content: 'Ein Datensatz ist eine X/Y-Kombination, die als eine Punktreihe dargestellt wird. Jeder Datensatz hat seine eigene X- und Y-Spalte — die Datensätze müssen also nicht dieselbe X-Achse teilen.',
          },
          {
            type: 'definition',
            term: 'Punkte und Linien',
            content: 'Punkte (Marker) zeigen einzelne Messwerte. Linien verbinden die Punkte in der Reihenfolge der Daten — sinnvoll für Zeitreihen oder geordnete Verläufe, irreführend bei ungeordneten Stichproben.',
          },
          {
            type: 'definition',
            term: 'Referenzlinien und -bereiche',
            content: 'Optional lassen sich horizontale oder vertikale Referenzlinien (z. B. Sollwert, Spezifikationsgrenze) und farbige Bereiche (Toleranzband, akzeptabler Bereich) einblenden, um Messwerte gegen einen erwarteten Korridor zu vergleichen.',
          },
          {
            type: 'paragraph',
            content: 'Im Unterschied zum klassischen Streudiagramm der Korrelationsanalyse ist das XY-Diagramm rein deskriptiv — es führt keine statistische Auswertung durch, sondern dient der visuellen Exploration.',
          },
        ],
      },
      en: {
        title: 'Overview',
        blocks: [
          {
            type: 'paragraph',
            content: 'The XY plot maps two numeric columns against each other — one as the X value, one as the Y value. It is the standard tool for making relationships, trends, and patterns between two variables visible.',
          },
          {
            type: 'definition',
            term: 'Dataset',
            content: 'A dataset is one X/Y combination drawn as a series of points. Each dataset has its own X and Y column — datasets are not required to share the same X axis.',
          },
          {
            type: 'definition',
            term: 'Markers and lines',
            content: 'Markers show individual measurements. Lines connect the points in data order — useful for time series or ordered traces, misleading for unordered samples.',
          },
          {
            type: 'definition',
            term: 'Reference lines and bands',
            content: 'Optional horizontal or vertical reference lines (e.g. target value, specification limit) and colored bands (tolerance band, acceptable range) help compare measurements against an expected corridor.',
          },
          {
            type: 'paragraph',
            content: 'Unlike the scatter plot in the correlation module, the XY plot is purely descriptive — it does not run any statistical test and is used for visual exploration.',
          },
        ],
      },
    },

    methodology: {
      de: {
        title: 'Bedienung',
        blocks: [
          {
            type: 'list',
            items: [
              'Datensatz hinzufügen: X-Spalte und Y-Spalte auswählen — der Plot wird sofort aktualisiert.',
              'Mehrere Datensätze: Über „Datensatz hinzufügen" weitere X/Y-Paare auflegen, um Gruppen zu vergleichen.',
              'Punkte oder Linie: Globaler Schalter „Linien zeigen" und „Punkte zeigen" steuert das Erscheinungsbild aller Datensätze.',
              'Pro Datensatz lassen sich Farbe, Symbol, Strichstärke und Name im Editor anpassen.',
              'Referenzlinien und -bereiche im Editor-Panel ergänzen — ideal für Spezifikationsgrenzen, Soll-Werte oder Trendlinien.',
            ],
          },
          {
            type: 'paragraph',
            content: 'Das Diagramm lässt sich als PNG oder SVG exportieren und reagiert auf das aktive Theme (hell/dunkel).',
          },
        ],
      },
      en: {
        title: 'Operation',
        blocks: [
          {
            type: 'list',
            items: [
              'Add a dataset: pick an X column and a Y column — the plot updates immediately.',
              'Multiple datasets: use "Add dataset" to lay down more X/Y pairs for group comparisons.',
              'Markers or lines: global toggles "Show lines" and "Show markers" control the appearance of all datasets.',
              'Per dataset, color, symbol, line width, and name can be customized in the editor.',
              'Reference lines and bands can be added in the editor panel — ideal for specification limits, target values, or trend lines.',
            ],
          },
          {
            type: 'paragraph',
            content: 'The chart can be exported as PNG or SVG and follows the active theme (light/dark).',
          },
        ],
      },
    },

    interpretation: {
      de: {
        title: 'Was man sehen kann',
        blocks: [
          {
            type: 'list',
            items: [
              'Punkte ordnen sich entlang einer steigenden Linie → positiver Zusammenhang zwischen X und Y.',
              'Punkte ordnen sich entlang einer fallenden Linie → negativer Zusammenhang.',
              'Punkte streuen ohne erkennbare Richtung → kein Zusammenhang oder reine Zufallsstreuung.',
              'Bogen oder U-Form → nichtlinearer Zusammenhang (für Korrelation linearisieren oder Spearman verwenden).',
              'Trichterförmige Streuung → Heteroskedastizität (Streuung wächst mit X) — wichtig für Regression.',
              'Mehrere getrennte Punktwolken → vermischte Populationen, Daten stratifizieren.',
            ],
          },
          {
            type: 'paragraph',
            content: 'Für eine quantitative Aussage zur Stärke und Signifikanz des Zusammenhangs anschließend das Korrelations- oder Regressions-Modul nutzen.',
          },
        ],
      },
      en: {
        title: 'What to look for',
        blocks: [
          {
            type: 'list',
            items: [
              'Points line up along a rising line → positive relationship between X and Y.',
              'Points line up along a falling line → negative relationship.',
              'Points scatter with no direction → no relationship or pure random noise.',
              'Arc or U-shape → nonlinear relationship (linearize for correlation or use Spearman).',
              'Funnel-shaped scatter → heteroscedasticity (spread grows with X) — important for regression.',
              'Several separate clouds → mixed populations, stratify the data.',
            ],
          },
          {
            type: 'paragraph',
            content: 'For a quantitative statement on the strength and significance of the relationship, follow up with the correlation or regression module.',
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
            term: 'Linien bei ungeordneten Daten',
            content: 'Linien verbinden Punkte in der Reihenfolge der Zeilen — bei ungeordneten Stichproben entsteht ein Zickzack ohne Aussagekraft. Linien nur einschalten, wenn die X-Achse eine echte Reihenfolge hat (Zeit, Index, Position).',
          },
          {
            type: 'definition',
            term: 'Visueller Zusammenhang ≠ Korrelation',
            content: 'Auch ein deutlich erkennbares Muster bedeutet nicht automatisch einen statistisch signifikanten Zusammenhang. Im Zweifel das Korrelations-Modul nachschalten und Pearson- oder Spearman-Koeffizient samt p-Wert prüfen.',
          },
          {
            type: 'definition',
            term: 'Achsenskalierung verzerrt das Bild',
            content: 'Eine zu enge oder zu weite Skalierung kann starke Trends harmlos oder harmlose Streuung dramatisch wirken lassen. Achsen bewusst wählen — die Standardskalierung ist meistens, aber nicht immer, sinnvoll.',
          },
          {
            type: 'definition',
            term: 'Ausreißer dominieren das Bild',
            content: 'Ein einzelner Extremwert verschiebt die Achsenskalierung und drückt die übrigen Punkte zusammen. Ausreißer kennzeichnen, untersuchen und ggf. in einer eigenen Ansicht ausschließen.',
          },
          {
            type: 'definition',
            term: 'Überlappende Punkte (Overplotting)',
            content: 'Bei vielen Datenpunkten verdecken sich Marker gegenseitig — die wahre Dichte bleibt unsichtbar. Marker verkleinern, transparenter zeichnen oder zusätzlich ein Histogramm/Boxplot betrachten.',
          },
        ],
      },
      en: {
        title: 'Pitfalls',
        blocks: [
          {
            type: 'definition',
            term: 'Lines on unordered data',
            content: 'Lines connect points in row order — for unordered samples this produces a meaningless zig-zag. Only enable lines when the X axis carries a real order (time, index, position).',
          },
          {
            type: 'definition',
            term: 'Visual relationship ≠ correlation',
            content: 'Even a clearly visible pattern does not automatically mean a statistically significant relationship. When in doubt, follow up with the correlation module and check Pearson or Spearman coefficients with p-values.',
          },
          {
            type: 'definition',
            term: 'Axis scaling distorts the picture',
            content: 'Too narrow or too wide a scale can make strong trends look harmless or harmless scatter look dramatic. Choose axes deliberately — the default scaling is usually, but not always, sensible.',
          },
          {
            type: 'definition',
            term: 'Outliers dominate the picture',
            content: 'A single extreme value shifts the axis scaling and squeezes the remaining points together. Mark outliers, investigate them, and consider excluding them in a separate view.',
          },
          {
            type: 'definition',
            term: 'Overplotting',
            content: 'With many data points, markers overlap and the true density becomes invisible. Shrink markers, draw them more transparently, or look at a histogram or boxplot in addition.',
          },
        ],
      },
    },
  },
};
