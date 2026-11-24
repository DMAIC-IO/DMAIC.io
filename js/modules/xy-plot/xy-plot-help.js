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
            content: 'Das {{term:streudiagramm|XY-Diagramm}} trägt zwei numerische Spalten gegeneinander auf — eine als X-Wert, eine als Y-Wert. Es ist das Standardwerkzeug, um Zusammenhänge, Trends und Muster zwischen zwei Größen sichtbar zu machen.',
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
            content: 'The {{term:streudiagramm|XY plot}} maps two numeric columns against each other — one as the X value, one as the Y value. It is the standard tool for making relationships, trends, and patterns between two variables visible.',
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
            content: 'Unlike the scatter plot in the correlation module, the XY plot is purely descriptive — it does not run any {{term:hypothesentest|statistical test}} and is used for visual exploration.',
          },
        ],
      },
    },

    bubble: {
      de: {
        title: 'Blasendiagramm (dritte Spalte als Größe)',
        blocks: [
          {
            type: 'paragraph',
            content: 'Wird im Datensatz zusätzlich ein S-Slot (Size) belegt, entsteht ein Blasendiagramm: die Punktgröße codiert eine dritte numerische Spalte. So lassen sich drei Variablen gleichzeitig darstellen.',
          },
          {
            type: 'definition',
            term: 'Flächentreue Skalierung',
            content: 'Die Rohwerte werden über eine Wurzel-Normalisierung auf einen Durchmesser von 6–28 px abgebildet. Dadurch ist die Bubble-Fläche (nicht der Radius) proportional zum Wert — visuell korrekt nach Wahrnehmungsforschung.',
          },
          {
            type: 'definition',
            term: 'Negative oder fehlende Werte',
            content: 'Zeilen mit fehlenden, nicht-numerischen oder negativen Größenwerten werden stillschweigend übersprungen — eine negative Fläche hat keine sinnvolle Darstellung.',
          },
          {
            type: 'list',
            items: [
              'Typische Anwendung: Projekt-Priorisierung (Aufwand × Nutzen × Risiko), Marketing (CPC × Conversion × Reichweite), Maschinen (Zykluszeit × Ausschuss × Output).',
              'Tooltip zeigt den Rohwert der Größenspalte zusätzlich zu X und Y.',
              'Mit Gruppierungs-Slot (G) zusammen: jede Gruppe erhält ihre eigene Blasen-Normalisierung innerhalb der Gruppe.',
            ],
          },
          {
            type: 'paragraph',
            content: 'Stolperfallen: Wenn alle Größenwerte fast gleich sind, fallen die Unterschiede visuell weg (sqrt-Skalierung dämpft zusätzlich). Wenn die {{term:spannweite|Spannweite}} sehr groß ist, werden {{term:mittelwert|Mittelwerte}} zu klein. In beiden Fällen vorab transformieren oder die Spalte filtern.',
          },
        ],
      },
      en: {
        title: 'Bubble plot (third column as size)',
        blocks: [
          {
            type: 'paragraph',
            content: 'When the S-slot (Size) of a dataset is also filled, the result is a bubble plot: marker size encodes a third numeric column, allowing three variables to be shown at once.',
          },
          {
            type: 'definition',
            term: 'Area-proportional scaling',
            content: 'Raw values are mapped through a square-root normalisation to a 6–28 px diameter range. As a result the bubble AREA (not the radius) is proportional to the value — visually correct according to perceptual research.',
          },
          {
            type: 'definition',
            term: 'Negative or missing values',
            content: 'Rows with missing, non-numeric, or negative size values are silently skipped — a negative area has no sensible visual representation.',
          },
          {
            type: 'list',
            items: [
              'Typical uses: project prioritisation (effort × benefit × risk), marketing (CPC × conversion × reach), machines (cycle time × scrap × output).',
              'The tooltip shows the raw value of the size column in addition to X and Y.',
              'Combined with the grouping slot (G): each group receives its own bubble normalisation within the group.',
            ],
          },
          {
            type: 'paragraph',
            content: 'Pitfalls: when all size values are nearly equal, differences disappear visually (sqrt scaling damps them further). When the range is very wide, mid-range values become too small. In both cases transform the column up front or filter it.',
          },
        ],
      },
    },

    errorBars: {
      de: {
        title: 'Fehlerbalken',
        blocks: [
          {
            type: 'paragraph',
            content: 'Jeder Datensatz kann eigene Fehlerbalken zeigen. Unter „Fehlerbalken“ in der Datensatz-Zeile wählen Sie den Modus; die Balken erscheinen in der Farbe der Reihe.',
          },
          {
            type: 'definition',
            term: 'Konstant',
            content: 'Vier feste Beträge: +x, −x, +y und −y. Jeder Punkt der Reihe erhält dieselben Balken — etwa die bekannte Messunsicherheit eines Messmittels.',
          },
          {
            type: 'definition',
            term: 'Spalten (relativ)',
            content: 'Je Richtung eine Worksheet-Spalte mit dem Abstand vom Punkt pro Zeile — etwa die Standardabweichung oder die halbe Breite eines Konfidenzintervalls je Messpunkt. Beispiel: Wert 100, Balken von 95 bis 110 → −Y = 5, +Y = 10.',
          },
          {
            type: 'definition',
            term: 'Spalten (absolut)',
            content: 'Je Richtung eine Worksheet-Spalte mit dem Endpunkt des Balkens pro Zeile — etwa die Unter- und Obergrenze eines Konfidenzintervalls. Beispiel: Wert 100, Balken von 95 bis 110 → −Y = 95, +Y = 110.',
          },
          {
            type: 'list',
            items: [
              'Bei „Spalten (relativ)“ und „Konstant“ sind die Werte Abstände vom Punkt; ein negativer Wert wird als sein Betrag gelesen (−5 und 5 ergeben denselben Balken). Bei „Spalten (absolut)“ sind sie Koordinaten auf der Achse.',
              'Ein leeres Feld oder eine leere bzw. nicht-numerische Zelle bedeutet: kein Balken in dieser Richtung. Der Punkt selbst bleibt immer sichtbar.',
              'Für symmetrische Balken dieselbe Spalte (oder denselben Betrag) bei + und − eintragen.',
              'Mit Gruppierung (G) trägt jede Gruppe die Fehler genau ihrer eigenen Zeilen; übersprungene Zeilen (ungültiges X, Y oder Größe) nehmen ihre Fehler mit.',
            ],
          },
        ],
      },
      en: {
        title: 'Error bars',
        blocks: [
          {
            type: 'paragraph',
            content: 'Each dataset can show its own error bars. Choose the mode under "Error bars" in the dataset row; the bars use the series colour.',
          },
          {
            type: 'definition',
            term: 'Constant',
            content: 'Four fixed amounts: +x, −x, +y and −y. Every point of the series gets the same bars — for example the known measurement uncertainty of a gauge.',
          },
          {
            type: 'definition',
            term: 'Columns (relative)',
            content: 'One worksheet column per direction holding the distance from the point per row — for example the standard deviation or the half-width of a confidence interval at each point. Example: value 100, bar from 95 to 110 → −Y = 5, +Y = 10.',
          },
          {
            type: 'definition',
            term: 'Columns (absolute)',
            content: 'One worksheet column per direction holding the end point of the bar per row — for example the lower and upper limit of a confidence interval. Example: value 100, bar from 95 to 110 → −Y = 95, +Y = 110.',
          },
          {
            type: 'list',
            items: [
              'With “Columns (relative)” and “Constant” the values are distances from the point; a negative value is read as its absolute value (−5 and 5 give the same bar). With “Columns (absolute)” they are coordinates on the axis.',
              'An empty field or an empty or non-numeric cell means: no bar in that direction. The point itself always stays visible.',
              'For symmetric bars enter the same column (or the same amount) for + and −.',
              'With grouping (G) each group carries the errors of exactly its own rows; skipped rows (invalid X, Y or size) take their errors with them.',
            ],
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
              'Referenzlinien und -bereiche im Editor-Panel ergänzen — ideal für {{term:spezifikationsgrenzen|Spezifikationsgrenzen}}, Soll-Werte oder Trendlinien.',
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
              'Bogen oder U-Form → nichtlinearer Zusammenhang (für {{term:korrelation|Korrelation}} linearisieren oder Spearman verwenden).',
              'Trichterförmige Streuung → {{term:heteroskedastizitaet|Heteroskedastizität}} (Streuung wächst mit X) — wichtig für {{term:regression|Regression}}.',
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
            content: 'Bei vielen Datenpunkten verdecken sich Marker gegenseitig — die wahre Dichte bleibt unsichtbar. Marker verkleinern, transparenter zeichnen oder zusätzlich ein {{term:histogramm|Histogramm}}/{{term:boxplot|Boxplot}} betrachten.',
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
            content: 'Even a clearly visible pattern does not automatically {{term:mittelwert|mean}} a statistically significant relationship. When in doubt, follow up with the correlation module and check Pearson or Spearman coefficients with p-values.',
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
