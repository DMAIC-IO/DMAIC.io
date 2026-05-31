/**
 * D.Mike — Boxplot Module Handbook (boxplot-help.js)
 * Bilingual help content (DE/EN) for the boxplot module.
 */

export default {
  moduleId: 'boxplot',
  sections: {
    overview: {
      de: {
        title: 'Aufbau eines Boxplots',
        blocks: [
          {
            type: 'paragraph',
            content: 'Ein Boxplot fasst eine Verteilung in einer kompakten Grafik zusammen. Alle Elemente leiten sich aus den sortierten Messwerten ab und zeigen auf einen Blick Lage, Streuung, {{term:schiefe|Schiefe}} und Ausreißer.',
          },
          {
            type: 'definition',
            term: 'Box',
            content: 'Das Rechteck reicht vom 1. Quartil (Q1, 25 %-Punkt) bis zum 3. Quartil (Q3, 75 %-Punkt). In dieser Box liegen die mittleren 50 % aller Messwerte. Ihre Länge ist der Interquartilsabstand (IQR = Q3 − Q1) und ist das robusteste Streuungsmaß im Boxplot.',
          },
          {
            type: 'definition',
            term: 'Median-Linie',
            content: 'Die Linie quer durch die Box markiert den {{term:median|Median}} (Q2, 50 %-Punkt) — den Wert, unter und über dem jeweils die Hälfte der Daten liegt. Liegt die Linie mittig in der Box, ist die Verteilung symmetrisch; ist sie verschoben, liegt Schiefe vor.',
          },
          {
            type: 'definition',
            term: 'Mittelwert-Markierung',
            content: 'Eine Raute (oder ein Kreuz) zeigt den arithmetischen {{term:mittelwert|Mittelwert}}. Liegen Median und Mittelwert dicht beieinander, ist die Verteilung weitgehend symmetrisch. Eine deutliche Lücke deutet auf Schiefe oder den Einfluss von Ausreißern hin.',
          },
          {
            type: 'definition',
            term: 'Whisker',
            content: 'Die beiden Linien, die aus der Box herauslaufen, heißen Whisker („Schnurrhaare"). Sie reichen bis zum kleinsten bzw. größten Messwert, der noch innerhalb von 1,5 × IQR von der Box entfernt liegt — nicht einfach bis zum Minimum/Maximum. Damit zeigen sie den Bereich der „normalen" Schwankung.',
          },
          {
            type: 'definition',
            term: 'Zäune (innere Grenzen)',
            content: 'Die unsichtbaren Grenzen bei Q1 − 1,5 × IQR und Q3 + 1,5 × IQR werden als Zäune bezeichnet. Sie sind keine Spezifikationsgrenzen, sondern eine rein statistische Faustregel (Tukey), die Ausreißer von „normalen" Werten trennt.',
          },
          {
            type: 'definition',
            term: 'Ausreißer',
            content: 'Einzelne Punkte jenseits der Whisker werden separat als kleine Marker dargestellt. Sie liegen außerhalb der Tukey-Zäune und sollten immer untersucht werden — nicht jeder Ausreißer ist ein Fehler, manchmal steckt die wichtigste Information in genau diesen Punkten.',
          },
          {
            type: 'paragraph',
            content: 'Kurz: Box = mittlere 50 %, Median-Linie = Lage, Whisker = normale Schwankungsbreite, Punkte außerhalb = Ausreißer. Mit diesen vier Bausteinen kannst du jede Verteilung schnell einordnen und mehrere Gruppen direkt vergleichen.',
          },
        ],
      },
      en: {
        title: 'Anatomy of a Boxplot',
        blocks: [
          {
            type: 'paragraph',
            content: 'A boxplot summarizes a distribution in one compact graphic. All elements are derived from the sorted observations and show location, spread, {{term:schiefe|skewness}}, and outliers at a glance.',
          },
          {
            type: 'definition',
            term: 'Box',
            content: 'The rectangle spans from the 1st quartile (Q1, 25 % point) to the 3rd quartile (Q3, 75 % point). It contains the middle 50 % of the data. Its length is the interquartile range (IQR = Q3 − Q1) and is the most robust measure of spread in the boxplot.',
          },
          {
            type: 'definition',
            term: 'Median Line',
            content: 'The line crossing the box marks the {{term:median|median}} (Q2, 50 % point) — the value with half the data above and half below. If the line sits centered in the box, the distribution is symmetric; if it is shifted, the distribution is skewed.',
          },
          {
            type: 'definition',
            term: 'Mean Marker',
            content: 'A diamond (or cross) marks the arithmetic {{term:mittelwert|mean}}. When mean and median sit close together, the distribution is roughly symmetric. A noticeable gap indicates skewness or the influence of outliers.',
          },
          {
            type: 'definition',
            term: 'Whiskers',
            content: 'The two lines extending from the box are called whiskers. They reach to the smallest/largest observation that still lies within 1.5 × IQR of the box — not simply to the overall minimum or maximum. They mark the range of "normal" variation.',
          },
          {
            type: 'definition',
            term: 'Fences (inner limits)',
            content: 'The invisible cutoffs at Q1 − 1.5 × IQR and Q3 + 1.5 × IQR are called fences. They are not specification limits but a purely statistical rule of thumb (Tukey) separating outliers from "normal" values.',
          },
          {
            type: 'definition',
            term: 'Outliers',
            content: 'Individual points beyond the whiskers are drawn as separate markers. They lie outside the Tukey fences and should always be investigated — not every outlier is an error; sometimes the most important information sits in exactly these points.',
          },
          {
            type: 'paragraph',
            content: 'In short: box = middle 50 %, median line = location, whiskers = normal range of variation, points beyond = outliers. With these four building blocks you can quickly characterize any distribution and compare several groups side by side.',
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
            content: 'Ein Boxplot (auch Box-Whisker-Plot) ist eine grafische Darstellung der Verteilung eines Datensatzes anhand der Fünf-Punkte-Zusammenfassung: Minimum, erstes Quartil (Q1), Median, drittes Quartil (Q3) und Maximum.',
          },
          {
            type: 'definition',
            term: 'Box (IQR)',
            content: 'Die Box erstreckt sich von Q1 bis Q3 und umfasst die mittleren 50 % der Daten. Die Breite der Box ist der Interquartilsabstand (IQR = Q3 − Q1).',
          },
          {
            type: 'definition',
            term: 'Whisker',
            content: 'Die Whisker reichen bis zum kleinsten bzw. größten Wert innerhalb von 1,5 × IQR von Q1 bzw. Q3. Werte außerhalb werden als Ausreißer dargestellt.',
          },
          {
            type: 'definition',
            term: 'Median-Linie',
            content: 'Die vertikale Linie in der Box markiert den Median (50. Perzentil). Die Position des Medians relativ zur Box zeigt die Schiefe der Verteilung.',
          },
          {
            type: 'definition',
            term: 'Mittelwert-Raute',
            content: 'Die Raute markiert den arithmetischen Mittelwert. Abweichung vom Median deutet auf Schiefe oder Ausreißer-Einfluss hin.',
          },
          {
            type: 'heading',
            content: 'Eingabemodi',
          },
          {
            type: 'list',
            items: [
              'Mehrere Spalten: Jede ausgewählte numerische Spalte ergibt einen eigenen Boxplot. Ideal zum Vergleich verschiedener Messgrößen.',
              'Gruppiert: Eine Werte-Spalte wird anhand einer Gruppierungs-Spalte (attributives Merkmal, z. B. Maschine, Schicht, Lieferant) in Teilgruppen aufgeteilt. Ideal für den Vergleich derselben Messgröße über verschiedene Kategorien.',
            ],
          },
        ],
      },
      en: {
        title: 'Methodology',
        blocks: [
          {
            type: 'paragraph',
            content: 'A boxplot (box-and-whisker plot) is a graphical display of a dataset\'s distribution based on its five-number summary: minimum, first quartile (Q1), median, third quartile (Q3), and maximum.',
          },
          {
            type: 'definition',
            term: 'Box (IQR)',
            content: 'The box spans from Q1 to Q3, containing the middle 50 % of the data. Its width is the interquartile range (IQR = Q3 − Q1).',
          },
          {
            type: 'definition',
            term: 'Whiskers',
            content: 'Whiskers extend to the smallest/largest value within 1.5 × IQR of Q1/Q3. Values beyond are plotted as outliers.',
          },
          {
            type: 'definition',
            term: 'Median Line',
            content: 'The vertical line inside the box marks the median (50th percentile). Its position relative to the box indicates skewness.',
          },
          {
            type: 'definition',
            term: 'Mean Diamond',
            content: 'The diamond marks the arithmetic mean. Deviation from the median suggests skewness or outlier influence.',
          },
          {
            type: 'heading',
            content: 'Input Modes',
          },
          {
            type: 'list',
            items: [
              'Multiple columns: Each selected numeric column produces one boxplot. Ideal for comparing different measurements.',
              'Grouped: A single value column is split by a grouping column (categorical attribute, e.g. machine, shift, supplier). Ideal for comparing the same measurement across categories.',
            ],
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
            content: 'Ein Produktionsteam misst die Wanddicke (mm) von Kunststoffteilen über drei Schichten. Die Daten stehen im Arbeitsblatt: Spalte „Wanddicke" (numerisch) und Spalte „Schicht" (Text: Früh, Spät, Nacht).',
          },
          {
            type: 'steps',
            items: [
              'Boxplot-Modul öffnen.',
              'Eingabemodus auf „Gruppiert" stellen.',
              'Werte-Spalte = „Wanddicke", Gruppierungs-Spalte = „Schicht" wählen.',
              '„Boxplot erstellen" klicken.',
              'Ergebnis: Drei horizontale Boxplots untereinander — einer pro Schicht.',
              'Vergleich: Nachtschicht zeigt breitere Box (größere Streuung) und zwei Ausreißer nach unten.',
            ],
          },
          {
            type: 'result',
            content: 'Die Nachtschicht hat eine deutlich höhere Variabilität. Die Analyse wird an das Improve-Team weitergegeben, um die Ursache (z. B. Temperaturregelung, Personalwechsel) zu untersuchen.',
          },
        ],
      },
      en: {
        title: 'Practical Example',
        blocks: [
          {
            type: 'scenario',
            content: 'A production team measures wall thickness (mm) of plastic parts across three shifts. The data is in the worksheet: column "Wall Thickness" (numeric) and column "Shift" (text: Morning, Afternoon, Night).',
          },
          {
            type: 'steps',
            items: [
              'Open the Boxplot module.',
              'Set input mode to "Grouped".',
              'Select value column = "Wall Thickness", grouping column = "Shift".',
              'Click "Create Boxplot".',
              'Result: Three horizontal boxplots stacked vertically — one per shift.',
              'Compare: Night shift shows a wider box (more variation) and two low outliers.',
            ],
          },
          {
            type: 'result',
            content: 'The night shift has significantly higher variability. The analysis is forwarded to the Improve team to investigate root causes (e.g. temperature control, crew changeover).',
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
              'Lage des Medians in der Box: Mittig → symmetrisch, seitlich verschoben → schief.',
              'Box-Breite (IQR): Schmale Box → geringe Streuung, breite Box → hohe Streuung.',
              'Whisker-Länge: Asymmetrische Whisker deuten auf Schiefe hin.',
              'Ausreißer: Einzelne Punkte jenseits der Whisker. Ursache prüfen (Messfehler, Sonderereignis).',
              'Mittelwert vs. Median: Große Abweichung → Ausreißer verzerren den Mittelwert.',
              'Vergleich mehrerer Boxplots: Überlappung der Boxen zeigt an, ob Unterschiede statistisch bedeutsam sein könnten.',
            ],
          },
          {
            type: 'decision',
            content: 'Wenn sich Boxen verschiedener Gruppen kaum überlappen, liegt vermutlich ein signifikanter Unterschied vor — ein Hypothesentest (z. B. t-Test, ANOVA) kann dies bestätigen.',
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
              'Median position in the box: Centered → symmetric, off-center → skewed.',
              'Box width (IQR): Narrow → low spread, wide → high spread.',
              'Whisker length: Asymmetric whiskers indicate skewness.',
              'Outliers: Individual points beyond whiskers. Investigate causes (measurement error, special events).',
              'Mean vs. Median: Large gap → outliers are pulling the mean.',
              'Comparing multiple boxplots: Non-overlapping boxes suggest potentially significant differences.',
            ],
          },
          {
            type: 'decision',
            content: 'When boxes of different groups barely overlap, a significant difference is likely — confirm with a hypothesis test (e.g. t-test, ANOVA).',
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
            content: 'Zu wenige Datenpunkte (n < 10): Der Boxplot verliert an Aussagekraft, da Quartile und Whisker instabil werden.',
          },
          {
            type: 'pitfall',
            content: 'Ausreißer ignorieren: Ausreißer sind keine Störung — sie tragen oft die wichtigste Information. Ursache immer prüfen.',
          },
          {
            type: 'pitfall',
            content: 'Nur auf den Median schauen: Ein Boxplot zeigt Streuung und Form. Zwei Gruppen mit gleichem Median können völlig unterschiedlich streuen.',
          },
          {
            type: 'pitfall',
            content: 'Gemischte Populationen: Wenn die Gruppierungs-Spalte Subgruppen verbirgt (z. B. zwei Maschinen in einer Schicht), kann das Bild verfälscht sein — Stratifizierung verwenden.',
          },
          {
            type: 'pitfall',
            content: 'Boxplot ≠ Hypothesentest: Der Boxplot ist explorativ. Für statistische Signifikanz einen formalen Test durchführen.',
          },
        ],
      },
      en: {
        title: 'Pitfalls',
        blocks: [
          {
            type: 'pitfall',
            content: 'Too few data points (n < 10): The boxplot loses reliability as quartiles and whiskers become unstable.',
          },
          {
            type: 'pitfall',
            content: 'Ignoring outliers: Outliers are not noise — they often carry the most important information. Always investigate the cause.',
          },
          {
            type: 'pitfall',
            content: 'Focusing only on the median: A boxplot shows spread and shape. Two groups with the same median can have vastly different spreads.',
          },
          {
            type: 'pitfall',
            content: 'Mixed populations: If the grouping column hides subgroups (e.g. two machines within one shift), the picture can be misleading — use stratification.',
          },
          {
            type: 'pitfall',
            content: 'Boxplot ≠ hypothesis test: The boxplot is exploratory. For statistical significance, run a formal test.',
          },
        ],
      },
    },
  },
};
