/**
 * D.Mike — Pareto Chart Module Handbook (pareto-help.js)
 * Bilingual help content (DE/EN) for the Pareto chart module.
 */

export default {
  moduleId: 'pareto',
  sections: {
    overview: {
      de: {
        title: 'Aufbau eines {{term:pareto|Pareto}}-Diagramms',
        blocks: [
          {
            type: 'paragraph',
            content: 'Das Pareto-Diagramm ist eines der „7 QC-Werkzeuge" und kombiniert ein nach Häufigkeit absteigend sortiertes {{term:balkendiagramm|Säulendiagramm}} mit einer kumulativen Prozent-Linie. Es macht das 80/20-Prinzip („vital few — trivial many") visuell unmittelbar greifbar: wenige Kategorien sind für den Großteil des Problems verantwortlich.',
          },
          {
            type: 'definition',
            term: 'Sortierung',
            content: 'Die Balken sind immer nach absteigendem Wert sortiert. Dadurch sieht man auf einen Blick, welche Kategorien die größten Beiträge liefern — anders als beim Säulendiagramm, wo die X-Achse in Eingabereihenfolge bleibt.',
          },
          {
            type: 'definition',
            term: 'Kumulative Prozent-Linie',
            content: 'Über die Balken läuft eine Linie, die für jeden Punkt den kumulativen Anteil (in %) am Gesamtwert angibt. Trifft sie die 80%-Marke nach beispielsweise drei Kategorien, machen genau diese drei zusammen 80 % des Problems aus.',
          },
          {
            type: 'definition',
            term: '80%-Schwelle',
            content: 'Eine horizontale Referenzlinie bei 80 % markiert die klassische Pareto-Grenze. Sie hilft, die „vital few" abzulesen — alle Balken links der Schnittstelle gehören dazu. Im Chart-Editor lässt sich der Schwellwert ändern oder ganz ausblenden (Wert 0).',
          },
          {
            type: 'definition',
            term: '„Sonstige"-Bucket',
            content: 'Bei vielen Kategorien wird der lange Schwanz (kleinste Beiträge) zu einem einzelnen „Sonstige"-Balken am Ende zusammengefasst. So bleibt das Diagramm lesbar, ohne dass die Tail-Information verlorengeht. Im Chart-Editor lässt sich die maximale Balkenzahl einstellen.',
          },
          {
            type: 'paragraph',
            content: 'Klassische Einsatzfelder im Six-Sigma-Kontext: Defektarten priorisieren, Reklamationsgründe gewichten, Kosten-Verursacher identifizieren. Das Modul akzeptiert eine kategoriale Spalte (Häufigkeitsmodus), zusätzlich optional eine Wertespalte (Summe je Kategorie — z. B. Reklamationskosten) und/oder eine Gruppierungsspalte für gestapelte Pareto-Diagramme.',
          },
        ],
      },
      en: {
        title: 'Anatomy of a Pareto Chart',
        blocks: [
          {
            type: 'paragraph',
            content: 'The Pareto chart is one of the "7 QC tools" and combines a bar chart sorted by descending value with a cumulative-percentage line. It makes the 80/20 principle ("vital few — trivial many") visually obvious: a few categories drive most of the problem.',
          },
          {
            type: 'definition',
            term: 'Sorting',
            content: 'Bars are always sorted by descending value. At a glance you see which categories contribute the most — unlike a plain bar chart, where the X axis stays in input order.',
          },
          {
            type: 'definition',
            term: 'Cumulative percentage line',
            content: 'A line over the bars shows, for every point, the cumulative share (in %) of the grand total. If it reaches the 80 % mark after three categories, those three together account for 80 % of the problem.',
          },
          {
            type: 'definition',
            term: '80 % threshold',
            content: 'A horizontal reference line at 80 % marks the classic Pareto boundary. It helps to read off the "vital few" — all bars to the left of the intersection belong to them. The chart editor lets you change the threshold or hide it (value 0).',
          },
          {
            type: 'definition',
            term: '"Other" bucket',
            content: 'With many categories, the long tail (smallest contributions) is collapsed into a single "Other" bar at the end. The chart stays readable without losing the tail. The chart editor lets you tune the maximum bar count.',
          },
          {
            type: 'paragraph',
            content: 'Classic Six-Sigma uses: prioritising defect types, weighting complaint reasons, identifying cost drivers. The module accepts a categorical column (frequency mode), optionally a value column (sum per category — e.g. complaint cost) and/or a grouping column for stacked Pareto charts.',
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
            term: 'Häufigkeit ≠ Wichtigkeit',
            content: 'Eine häufig auftretende Defektart muss nicht die teuerste sein. Wenn jede Reklamation andere Kosten verursacht, lieber die Wert-Spalte (Y) füllen und nach Summe sortieren — sonst lenkt das Diagramm den Fokus auf die häufigsten, nicht die schlimmsten Probleme.',
          },
          {
            type: 'definition',
            term: 'Zu viele Kategorien',
            content: 'Sind alle Beiträge ähnlich groß, gibt es keine „vital few" — das Pareto-Prinzip greift dann nicht. Ein Pareto-Diagramm mit 20 nahezu gleich hohen Balken ist eher Symptom eines Definitions-Problems: vielleicht sind die Kategorien zu fein granuliert oder zu generisch.',
          },
          {
            type: 'definition',
            term: 'Aggregation falsch gewählt',
            content: 'Bei aktiver Y-Spalte muss man wählen, ob über die Kategorie summiert oder gemittelt wird. Für Kosten/Schaden/Mengen ist „Summe" richtig (Gesamtbeitrag), für eine durchschnittliche Reklamationshöhe „{{term:mittelwert|Mittelwert}}". Falsche Wahl führt zu falschem Ranking.',
          },
          {
            type: 'definition',
            term: 'Vergleich über Zeit',
            content: 'Pareto-Diagramme sind Momentaufnahmen — die Sortierung der Balken ändert sich, wenn man mehrere Zeiträume nebeneinander stellt. Für Trends besser Linien- oder gestapelte Säulendiagramme verwenden und das Pareto-Diagramm nur als Snapshot je Periode.',
          },
          {
            type: 'definition',
            term: '„Sonstige"-Bucket zu groß',
            content: 'Wenn der „Sonstige"-Balken selbst zu den größten zählt, ist der Top-N-Schnitt zu eng gesetzt. Im Chart-Editor die maximale Balkenzahl erhöhen, bis „Sonstige" wieder kleiner ist als die individuellen Top-Kategorien.',
          },
        ],
      },
      en: {
        title: 'Pitfalls',
        blocks: [
          {
            type: 'definition',
            term: 'Frequency ≠ importance',
            content: 'A frequently-occurring defect type is not necessarily the most expensive one. When each complaint carries a different cost, fill the value column (Y) and sort by sum — otherwise the chart points the focus to the most frequent, not the most damaging issues.',
          },
          {
            type: 'definition',
            term: 'Too many categories',
            content: 'If all contributions are similar, there are no "vital few" — the Pareto principle does not apply. A Pareto chart with 20 nearly equal bars is more a symptom of a definition problem: the categories may be too granular or too generic.',
          },
          {
            type: 'definition',
            term: 'Wrong aggregation',
            content: 'When the Y column is set, you must choose whether to sum or to average across the category. For costs/damage/quantities, "sum" is right (total contribution); for an average complaint amount, use "mean". The wrong choice produces the wrong ranking.',
          },
          {
            type: 'definition',
            term: 'Comparing over time',
            content: 'Pareto charts are snapshots — the bar order changes between periods. For trends, prefer line or stacked bar charts and use a Pareto chart only as a per-period snapshot.',
          },
          {
            type: 'definition',
            term: '"Other" bucket too large',
            content: 'If the "Other" bar is itself among the largest, the top-N cut is set too tightly. Increase the max bar count in the chart editor until "Other" is smaller than the individual top categories.',
          },
        ],
      },
    },
  },
};
