/**
 * D.Mike — Individual Value Plot Module Handbook (individual-value-plot-help.js)
 * Bilingual help content (DE/EN) for the individual value plot module.
 */

export default {
  moduleId: 'individual-value-plot',
  sections: {
    overview: {
      de: {
        title: 'Aufbau eines Einzelwertdiagramms',
        blocks: [
          {
            type: 'paragraph',
            content: 'Ein Einzelwertdiagramm (engl. „Individual Value Plot") zeigt jede einzelne Beobachtung als eigenen Punkt. Anders als ein Boxplot, der die Verteilung zu fünf Kennzahlen zusammenfasst, bleibt jeder Messwert sichtbar. Das macht das Diagramm besonders nützlich bei kleinen bis mittleren Stichproben, bei denen ein Boxplot zu wenige Punkte zum Verdichten hat.',
          },
          {
            type: 'definition',
            term: 'Punkt',
            content: 'Jeder Punkt entspricht genau einem Messwert. Die senkrechte Position zeigt den Wert auf der Y-Achse, die waagerechte Position ordnet den Punkt einer Gruppe (Kategorie) zu.',
          },
          {
            type: 'definition',
            term: 'Jitter (waagerechte Streuung)',
            content: 'Liegen mehrere Beobachtungen auf demselben Y-Wert, würden sie sich überdecken. Eine kleine zufällige Verschiebung in X-Richtung ("Jitter") trennt die Punkte optisch voneinander, ohne den Y-Wert zu verändern. Der Jitter dient nur der Lesbarkeit und hat keine inhaltliche Bedeutung.',
          },
          {
            type: 'definition',
            term: 'Mittelwert-Raute',
            content: 'Eine Raute pro Gruppe markiert den arithmetischen Mittelwert. Sie hilft beim schnellen Vergleich der Lage über mehrere Gruppen hinweg.',
          },
          {
            type: 'definition',
            term: 'Median-Strich (optional)',
            content: 'Ein kurzer waagerechter Strich pro Gruppe kennzeichnet den Median. In Kombination mit der Mittelwert-Raute lässt sich Schiefe sofort erkennen: Liegen Mittelwert und Median weit auseinander, ist die Verteilung asymmetrisch.',
          },
          {
            type: 'definition',
            term: 'Verbindungslinie der Mittelwerte (optional)',
            content: 'Eine gestrichelte Linie verbindet die Gruppenmittelwerte und macht Trends über die Gruppen hinweg sichtbar — etwa wenn die Gruppen einer geordneten Größe (Schicht, Tag, Stufe) entsprechen.',
          },
          {
            type: 'definition',
            term: 'Gesamtmittelwert (optional)',
            content: 'Eine durchgehende waagerechte Linie zeigt den Gesamtmittelwert aller Gruppen. Sie ist als Referenz nützlich, wenn man auf einen Blick sehen möchte, welche Gruppen über und welche unter dem Gesamtniveau liegen.',
          },
          {
            type: 'paragraph',
            content: 'Kurz: Punkte = Rohdaten, Raute = Mittelwert, optionaler Strich = Median, optionale Linien = Vergleichshilfen. Das Einzelwertdiagramm zeigt mehr Detail als ein Boxplot und ist die richtige Wahl, wenn du jeden Datenpunkt sehen willst.',
          },
        ],
      },
      en: {
        title: 'Anatomy of an Individual Value Plot',
        blocks: [
          {
            type: 'paragraph',
            content: 'An individual value plot shows every single observation as its own point. Unlike a boxplot — which collapses the distribution into five summary numbers — each measurement remains visible. This makes the plot especially useful for small to medium samples where a boxplot has too few points to summarize meaningfully.',
          },
          {
            type: 'definition',
            term: 'Point',
            content: 'Each point represents one measurement. Its vertical position is the value on the Y axis; its horizontal position assigns it to a group (category).',
          },
          {
            type: 'definition',
            term: 'Jitter (horizontal scatter)',
            content: 'When several observations share the same Y value, they would otherwise overlap. A small random horizontal offset ("jitter") separates the points visually without changing their Y value. Jitter is purely a readability device and carries no information.',
          },
          {
            type: 'definition',
            term: 'Mean diamond',
            content: 'One diamond per group marks the arithmetic mean. It enables quick comparison of location across groups.',
          },
          {
            type: 'definition',
            term: 'Median tick (optional)',
            content: 'A short horizontal tick per group marks the median. Combined with the mean diamond it makes skewness visible at a glance: a clear gap between mean and median indicates an asymmetric distribution.',
          },
          {
            type: 'definition',
            term: 'Connecting line through means (optional)',
            content: 'A dashed line connects the group means, surfacing trends across ordered groups (e.g. shift, day, dose level).',
          },
          {
            type: 'definition',
            term: 'Overall mean (optional)',
            content: 'A horizontal reference line marks the overall mean across all groups. It is useful for telling at a glance which groups sit above and which sit below the overall level.',
          },
          {
            type: 'paragraph',
            content: 'In short: points = raw data, diamond = mean, optional tick = median, optional lines = comparison aids. The individual value plot retains more detail than a boxplot and is the right choice when you want to see every single data point.',
          },
        ],
      },
    },

    methodology: {
      de: {
        title: 'Methodik',
        blocks: [
          {
            type: 'paragraph',
            content: 'Das Einzelwertdiagramm ist ein deskriptives Werkzeug. Es nimmt eine numerische Spalte (Y) und ordnet jede Beobachtung einer Kategorie (X) zu — entweder über bis zu drei Gruppierungs-Spalten oder durch Vergleich mehrerer numerischer Spalten nebeneinander.',
          },
          {
            type: 'heading',
            content: 'Wann sollte ich es verwenden?',
          },
          {
            type: 'list',
            items: [
              'Stichprobengröße unter 50 pro Gruppe: Boxplots werden bei wenigen Punkten unzuverlässig, das Einzelwertdiagramm zeigt jeden Wert.',
              'Diskrete oder gerundete Daten: Häufungen auf wenigen Werten werden im Boxplot unsichtbar, im Einzelwertdiagramm direkt erkennbar.',
              'Vergleich mehrerer Gruppen mit Fokus auf einzelne Ausreißer.',
              'Vor dem Einsatz formaler Tests (t-Test, ANOVA), um die Plausibilität der Annahmen visuell zu prüfen.',
            ],
          },
          {
            type: 'heading',
            content: 'Eingabemodi',
          },
          {
            type: 'list',
            items: [
              'Mehrere Spalten: Jede ausgewählte numerische Spalte ergibt eine eigene Punktwolke. Ideal für den direkten Vergleich verschiedener Messgrößen.',
              'Gruppiert: Eine Werte-Spalte wird anhand einer Gruppierungs-Spalte (z. B. Maschine, Schicht, Lieferant) in Teilgruppen aufgeteilt.',
              'Verschachtelt (bis zu 3 Ebenen): G1, G2 und G3 wirken kombinatorisch — jede einzigartige Kombination der Gruppenwerte ergibt eine eigene Punktsäule (z. B. G1 = Schicht, G2 = Maschine → eine Säule pro Schicht-/Maschinen-Kombination). Die Säulenbeschriftung listet die Gruppenwerte durch „ | " getrennt.',
            ],
          },
          {
            type: 'definition',
            term: 'Mittelwert',
            content: 'Arithmetisches Mittel aller Werte einer Gruppe. Empfindlich gegenüber Ausreißern.',
          },
          {
            type: 'definition',
            term: 'Median',
            content: '50 %-Punkt der sortierten Werte. Robust gegenüber Ausreißern.',
          },
          {
            type: 'definition',
            term: 'Standardabweichung',
            content: 'Wird im Tooltip angezeigt (n − 1 Nenner). Maß für die Streuung innerhalb einer Gruppe.',
          },
        ],
      },
      en: {
        title: 'Methodology',
        blocks: [
          {
            type: 'paragraph',
            content: 'The individual value plot is a descriptive tool. It takes one numeric column (Y) and assigns each observation to a category (X) — either via up to three grouping columns or by comparing several numeric columns side by side.',
          },
          {
            type: 'heading',
            content: 'When should I use it?',
          },
          {
            type: 'list',
            items: [
              'Sample size below 50 per group: boxplots become unreliable with few points; the individual value plot shows every value.',
              'Discrete or rounded data: clusters on a handful of values are invisible in a boxplot but obvious here.',
              'Comparing several groups while focusing on individual outliers.',
              'As a sanity check before formal tests (t-test, ANOVA) to visually inspect the assumptions.',
            ],
          },
          {
            type: 'heading',
            content: 'Input Modes',
          },
          {
            type: 'list',
            items: [
              'Multiple columns: Each selected numeric column produces its own scatter of points. Ideal for direct comparison of different measurements.',
              'Grouped: A single value column is split by a grouping column (e.g. machine, shift, supplier).',
              'Nested (up to 3 levels): G1, G2 and G3 act combinatorially — every unique combination of group values produces its own column of points (e.g. G1 = shift, G2 = machine → one column per shift/machine combination). The column label lists the group values separated by " | ".',
            ],
          },
          {
            type: 'definition',
            term: 'Mean',
            content: 'Arithmetic mean of all values in a group. Sensitive to outliers.',
          },
          {
            type: 'definition',
            term: 'Median',
            content: '50 % point of the sorted values. Robust against outliers.',
          },
          {
            type: 'definition',
            term: 'Standard deviation',
            content: 'Shown in the tooltip (n − 1 denominator). A measure of within-group spread.',
          },
        ],
      },
    },

    example: {
      de: {
        title: 'Praxisbeispiel',
        blocks: [
          {
            type: 'scenario',
            content: 'Ein Qualitätsteam misst die Reaktionszeit eines Online-Bestellsystems über vier Wochen. Pro Woche liegen 15–20 Messwerte vor — zu wenig für aussagekräftige Boxplots. Im Arbeitsblatt: Spalte „Reaktionszeit_ms" (numerisch) und Spalte „Woche" (Text: KW 14, KW 15, KW 16, KW 17).',
          },
          {
            type: 'steps',
            items: [
              'Modul „Einzelwertdiagramm" öffnen.',
              'Werte-Spalte = „Reaktionszeit_ms", Gruppierungs-Spalte = „Woche" wählen.',
              'Optionen: Mittelwert-Raute aktiviert, Verbindungslinie der Mittelwerte aktiviert.',
              'Jede Woche erscheint als senkrechte Punktwolke; die gestrichelte Linie zeigt den Trend der Mittelwerte.',
              'KW 16 zeigt einen sichtbaren Sprung nach oben mit zwei einzelnen, deutlich höheren Werten.',
            ],
          },
          {
            type: 'result',
            content: 'Die zwei Ausreißer in KW 16 fallen sofort auf — sie korrelieren mit einem Backend-Deployment am Mittwoch. Im Boxplot wären die Punkte als „nur zwei Ausreißer" abstrakter geblieben; im Einzelwertdiagramm ist die Lücke zwischen den beiden hohen Werten und dem Rest der Woche unmittelbar sichtbar.',
          },
        ],
      },
      en: {
        title: 'Practical Example',
        blocks: [
          {
            type: 'scenario',
            content: 'A quality team monitors the response time of an online ordering system across four weeks. Each week has 15–20 observations — too few for meaningful boxplots. The worksheet has columns "ResponseTime_ms" (numeric) and "Week" (text: W14, W15, W16, W17).',
          },
          {
            type: 'steps',
            items: [
              'Open the Individual Value Plot module.',
              'Select value column = "ResponseTime_ms" and grouping column = "Week".',
              'Options: enable the mean diamond and the connecting line through means.',
              'Each week appears as a vertical cloud of points; the dashed line traces the trend of the means.',
              'W16 shows a visible upward shift with two distinctly higher individual values.',
            ],
          },
          {
            type: 'result',
            content: 'The two outliers in W16 jump out immediately — they correlate with a Wednesday backend deployment. In a boxplot the same points would have been abstracted to "two outliers"; here the gap between the high values and the rest of the week is directly visible.',
          },
        ],
      },
    },

    interpretation: {
      de: {
        title: 'Interpretation',
        blocks: [
          {
            type: 'heading',
            content: 'Worauf achten?',
          },
          {
            type: 'list',
            items: [
              'Lage der Punktwolke: Wo liegt der Schwerpunkt einer Gruppe relativ zu den anderen?',
              'Streuung innerhalb einer Gruppe: Eine breite vertikale Wolke bedeutet hohe Variabilität, eine eng zusammengedrängte Wolke geringe Variabilität.',
              'Häufungen: Mehrere Punkte auf demselben Y-Wert (sichtbar durch Jitter) deuten auf gerundete oder diskrete Messwerte hin.',
              'Lücken: Ein Bereich ohne Punkte innerhalb der Spannweite kann auf bimodale Daten oder eine fehlende Messstufe hindeuten.',
              'Einzelne Punkte abseits der Wolke: Mögliche Ausreißer — Ursache prüfen, nicht automatisch entfernen.',
              'Mittelwert vs. Median: Liegen die beiden weit auseinander, ist die Verteilung schief.',
            ],
          },
          {
            type: 'decision',
            content: 'Wenn sich die Punktwolken zweier Gruppen kaum überlappen, deutet das auf einen statistisch bedeutsamen Unterschied hin — bestätigen lässt sich das mit einem t-Test oder einer ANOVA.',
          },
        ],
      },
      en: {
        title: 'Interpretation',
        blocks: [
          {
            type: 'heading',
            content: 'What to look for',
          },
          {
            type: 'list',
            items: [
              'Cloud location: where does the bulk of a group sit relative to the others?',
              'Within-group spread: a wide vertical cloud means high variability, a tight cloud means low variability.',
              'Clusters: multiple points at the same Y value (visible through jitter) suggest rounded or discrete measurements.',
              'Gaps: an empty band inside a group\'s range can indicate bimodal data or a missing measurement level.',
              'Isolated points: potential outliers — investigate the root cause, do not delete automatically.',
              'Mean vs. median: a large gap between the two indicates a skewed distribution.',
            ],
          },
          {
            type: 'decision',
            content: 'When the clouds of two groups barely overlap, a significant difference is likely — confirm it with a t-test or ANOVA.',
          },
        ],
      },
    },

    pitfalls: {
      de: {
        title: 'Stolperfallen',
        blocks: [
          {
            type: 'pitfall',
            content: 'Jitter als Messwert missverstehen: Die waagerechte Streuung ist rein zufällig und zeigt keine Information. Nur die senkrechte Position trägt Bedeutung.',
          },
          {
            type: 'pitfall',
            content: 'Sehr große Stichproben (n > 200 pro Gruppe): Die Punktwolke wird so dicht, dass einzelne Werte nicht mehr unterscheidbar sind. In diesem Fall ist ein Boxplot oder ein Histogramm die bessere Wahl.',
          },
          {
            type: 'pitfall',
            content: 'Ausreißer ohne Ursachenprüfung entfernen: Ein Ausreißer ist nicht automatisch ein Fehler. Erst die Ursache untersuchen, dann entscheiden.',
          },
          {
            type: 'pitfall',
            content: 'Gruppengröße ignorieren: Eine Gruppe mit 5 Punkten und eine mit 50 Punkten sehen optisch unterschiedlich „streuend" aus, obwohl die Standardabweichung gleich sein kann. Im Tooltip immer auf n achten.',
          },
          {
            type: 'pitfall',
            content: 'Einzelwertdiagramm ≠ Hypothesentest: Das Diagramm ist explorativ. Für statistische Signifikanz einen formalen Test durchführen.',
          },
          {
            type: 'pitfall',
            content: 'Zu tief verschachtelte Gruppierung: Mit drei Gruppen-Spalten wächst die Säulenzahl multiplikativ (z. B. 3 × 4 × 2 = 24 Säulen). Bei zu wenigen Punkten pro Zelle wird das Diagramm unleserlich und die Aussagekraft sinkt — lieber eine Ebene weniger oder Kategorien zusammenfassen.',
          },
        ],
      },
      en: {
        title: 'Pitfalls',
        blocks: [
          {
            type: 'pitfall',
            content: 'Misreading jitter as a measurement: the horizontal scatter is purely random and carries no information. Only the vertical position is meaningful.',
          },
          {
            type: 'pitfall',
            content: 'Very large samples (n > 200 per group): the point cloud becomes so dense that individual values can no longer be distinguished. Use a boxplot or histogram instead.',
          },
          {
            type: 'pitfall',
            content: 'Removing outliers without investigation: an outlier is not automatically an error. Investigate the root cause first, then decide.',
          },
          {
            type: 'pitfall',
            content: 'Ignoring group size: a group of 5 points and a group of 50 points look visually different even when the standard deviations are identical. Always check n in the tooltip.',
          },
          {
            type: 'pitfall',
            content: 'Individual value plot ≠ hypothesis test: this is an exploratory plot. For statistical significance, run a formal test.',
          },
          {
            type: 'pitfall',
            content: 'Over-nesting groupings: with three group columns the number of columns grows multiplicatively (e.g. 3 × 4 × 2 = 24 columns). When per-cell counts get too small the plot turns unreadable and loses signal — drop a level or merge categories instead.',
          },
        ],
      },
    },
  },
};
