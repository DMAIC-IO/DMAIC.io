/**
 * D.Mike — Bar Chart Module Handbook (bar-help.js)
 * Bilingual help content (DE/EN) for the bar chart module.
 */

export default {
  moduleId: 'bar',
  sections: {
    overview: {
      de: {
        title: 'Aufbau eines Säulen-/Balkendiagramms',
        blocks: [
          {
            type: 'paragraph',
            content: 'Ein {{term:balkendiagramm|Säulendiagramm}} zeigt für jede Kategorie einen senkrechten Balken, dessen Höhe einen numerischen Wert ausdrückt. Es ist das geradlinigste Werkzeug, um diskrete Größen unmittelbar visuell zu vergleichen — die Länge der Balken übersetzt das menschliche Auge nahezu fehlerfrei in Größenverhältnisse.',
          },
          {
            type: 'definition',
            term: 'Kategorie (X-Achse)',
            content: 'Eine diskrete Ausprägung, für die ein Balken gezeichnet wird — z. B. „Schicht A / B / C", „Defektart", „Lieferant". Die Kategorienliste ist endlich und benannt, nicht numerisch geordnet.',
          },
          {
            type: 'definition',
            term: 'Wert (Y-Achse)',
            content: 'Die Größe, die der Balken darstellt. Drei Möglichkeiten: (1) eine reine Häufigkeitszählung der Kategorie („wie oft kommt sie vor?"), (2) der Mittelwert einer numerischen Spalte je Kategorie, (3) die Summe einer numerischen Spalte je Kategorie.',
          },
          {
            type: 'definition',
            term: 'Gruppierung',
            content: 'Wenn eine zweite {{term:skalenniveau|kategoriale}} Spalte angegeben wird, entsteht pro X-Kategorie ein Balkenbündel oder ein gestapelter Balken — jede Untergruppe bekommt eine eigene Farbe. So lassen sich Effekte wie „Defektart × Schicht" oder „Lieferant × Werk" auf einen Blick vergleichen.',
          },
          {
            type: 'definition',
            term: 'Gruppiert vs. gestapelt',
            content: '„Gruppiert" stellt die Untergruppen nebeneinander — gut, um sie direkt zu vergleichen. „Gestapelt" türmt sie übereinander — gut, um die Summe pro X-Kategorie zu sehen, während die Aufteilung weiterhin sichtbar bleibt.',
          },
          {
            type: 'paragraph',
            content: 'Säulendiagramme eignen sich, um Kategorien hinsichtlich einer Kenngröße zu vergleichen — etwa „durchschnittliche Zykluszeit pro Schicht" oder „Häufigkeit der Defektarten". Für eine nach Häufigkeit sortierte Variante mit kumulativer Linie verwende ein Pareto-Diagramm. Für stetige Daten mit Bin-Achse ist das Histogramm das richtige Werkzeug.',
          },
        ],
      },
      en: {
        title: 'Anatomy of a Bar Chart',
        blocks: [
          {
            type: 'paragraph',
            content: 'A {{term:balkendiagramm|bar chart}} draws one vertical bar per category, the height of which expresses a numeric value. It is the most straightforward tool to compare discrete quantities — the eye translates bar length into magnitude almost without error.',
          },
          {
            type: 'definition',
            term: 'Category (X axis)',
            content: 'A discrete level for which a bar is drawn — e.g. "Shift A / B / C", "Defect type", "Supplier". The category list is finite and named, not numerically ordered.',
          },
          {
            type: 'definition',
            term: 'Value (Y axis)',
            content: 'The quantity the bar represents. Three options: (1) a pure frequency count of the category ("how often does it appear?"), (2) the mean of a numeric column per category, (3) the sum of a numeric column per category.',
          },
          {
            type: 'definition',
            term: 'Grouping',
            content: 'When a second {{term:skalenniveau|categorical}} column is supplied, each X-category becomes a bundle of bars (or a stacked bar) — each subgroup in its own color. This makes effects such as "defect type × shift" or "supplier × plant" comparable at a glance.',
          },
          {
            type: 'definition',
            term: 'Grouped vs. stacked',
            content: '"Grouped" places subgroups side-by-side — good for direct comparison. "Stacked" piles them — good for seeing the per-category total while still showing the split.',
          },
          {
            type: 'paragraph',
            content: 'Bar charts are suited to comparing categories on a single metric — such as "average cycle time per shift" or "frequency of defect types". For a variant sorted by frequency with a cumulative line, use a Pareto chart. For continuous data with a binned axis, the histogram is the right tool.',
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
            term: 'Y-Achse beginnt nicht bei null',
            content: 'Wird die Y-Achse abgeschnitten (z. B. von 90 statt 0 beginnen), wirken Unterschiede dramatischer als sie sind. Das ist eine der häufigsten und übelsten Manipulationen mit Säulendiagrammen — bei Längenvergleichen muss die Achse immer bei 0 starten.',
          },
          {
            type: 'definition',
            term: 'Zu viele Kategorien',
            content: 'Mehr als 10–15 Kategorien werden visuell unübersichtlich. Lieber nach Häufigkeit sortieren (→ Pareto-Diagramm) oder kleine Kategorien als „Sonstige" zusammenfassen.',
          },
          {
            type: 'definition',
            term: 'Mittelwert ohne Streuung',
            content: 'Ein Balken zeigt nur den Mittelwert (oder die Summe) — die Streuung innerhalb der Kategorie ist nicht sichtbar. Bei Verdacht auf Heterogenität ergänzend ein Boxplot oder Individual-Value-Plot heranziehen.',
          },
          {
            type: 'definition',
            term: 'Verwechslung Häufigkeit ↔ Mittelwert',
            content: 'Bei aktivierter Y-Spalte zeigt der Balken den Mittelwert (oder die Summe) der Y-Werte je Kategorie, nicht die Anzahl. Achsenbeschriftung und Statistiktabelle prüfen, damit das Diagramm nicht falsch interpretiert wird.',
          },
          {
            type: 'definition',
            term: 'Gestapelte Balken bei vielen Untergruppen',
            content: 'Gestapelte Balken sind schwer ablesbar, wenn die Untergruppen sehr unterschiedliche Größen haben oder es mehr als 4–5 gibt. In solchen Fällen lieber ein Mosaikdiagramm oder eine Heatmap.',
          },
        ],
      },
      en: {
        title: 'Pitfalls',
        blocks: [
          {
            type: 'definition',
            term: 'Y axis does not start at zero',
            content: 'Truncating the Y axis (e.g. starting at 90 instead of 0) makes differences look more dramatic than they are. This is one of the most common — and most misleading — manipulations with bar charts; length comparisons require the axis to start at 0.',
          },
          {
            type: 'definition',
            term: 'Too many categories',
            content: 'More than 10–15 categories become visually overwhelming. Sort by frequency (→ Pareto chart) or group small categories into "Other".',
          },
          {
            type: 'definition',
            term: 'Mean without spread',
            content: 'A bar shows only the mean (or sum) — within-category spread is invisible. If heterogeneity is plausible, complement with a boxplot or individual-value plot.',
          },
          {
            type: 'definition',
            term: 'Confusing frequency with mean',
            content: 'When a Y column is set, the bar shows the mean (or sum) of Y per category, not the count. Check the axis label and the stats table so the chart is not misread.',
          },
          {
            type: 'definition',
            term: 'Stacked bars with many subgroups',
            content: 'Stacked bars are hard to read when subgroups are very uneven in size or when there are more than 4–5 of them. Prefer a mosaic chart or a heatmap in such cases.',
          },
        ],
      },
    },
  },
};
