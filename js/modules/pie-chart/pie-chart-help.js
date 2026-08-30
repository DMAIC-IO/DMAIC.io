/**
 * D.Mike — Pie Chart Module Handbook (pie-chart-help.js)
 * Bilingual help content (DE/EN) for the pie chart module.
 */

export default {
  moduleId: 'pie-chart',
  sections: {
    overview: {
      de: {
        title: 'Aufbau eines Tortendiagramms',
        blocks: [
          {
            type: 'paragraph',
            content: 'Ein {{term:kreisdiagramm|Tortendiagramm}} (Kreisdiagramm) zeigt, wie sich ein Ganzes auf wenige Kategorien aufteilt. Jede Kategorie wird als Kreissektor mit einer Fläche proportional zu ihrem Anteil dargestellt. Zusammen ergeben alle Sektoren genau 100 %.',
          },
          {
            type: 'definition',
            term: 'Sektor',
            content: 'Ein Tortenstück, dessen Winkel (und damit Fläche) proportional zum Anteil der Kategorie am Gesamtwert ist. Die Reihenfolge wird typischerweise vom größten zum kleinsten Sektor sortiert, beginnend bei „12 Uhr".',
          },
          {
            type: 'definition',
            term: 'Beschriftung',
            content: 'Jeder Sektor kann mit Kategoriename, Absolutwert, Prozentanteil oder einer Kombination beschriftet werden. Sehr kleine Sektoren werden oft außerhalb des Kreises beschriftet.',
          },
          {
            type: 'definition',
            term: '„Sonstige"-Sektor',
            content: 'Bei vielen kleinen Kategorien werden diese sinnvollerweise unter „Sonstige" zusammengefasst, sonst wird das Diagramm unübersichtlich. Ein gesundes Tortendiagramm hat meist nicht mehr als 5–7 Sektoren.',
          },
          {
            type: 'paragraph',
            content: 'Tortendiagramme eignen sich, um den Anteil weniger, klar voneinander unterscheidbarer Kategorien an einem Ganzen zu kommunizieren — z. B. „Wie verteilt sich der Ausschuss auf die fünf Defektarten?".',
          },
        ],
      },
      en: {
        title: 'Anatomy of a Pie Chart',
        blocks: [
          {
            type: 'paragraph',
            content: 'A {{term:kreisdiagramm|pie chart}} shows how a whole is split into a few categories. Each category is drawn as a circle slice with an area proportional to its share. Together all slices add up to exactly 100 %.',
          },
          {
            type: 'definition',
            term: 'Slice',
            content: 'A pie slice whose angle (and therefore area) is proportional to the category share of the total. Slices are typically sorted from largest to smallest, starting at "12 o\'clock".',
          },
          {
            type: 'definition',
            term: 'Labels',
            content: 'Each slice can be labeled with the category name, absolute value, percentage, or a combination. Very small slices are often labeled outside the circle.',
          },
          {
            type: 'definition',
            term: '"Other" slice',
            content: 'When there are many small categories, it is sensible to group them into "Other", otherwise the chart becomes cluttered. A healthy pie chart typically has no more than 5–7 slices.',
          },
          {
            type: 'paragraph',
            content: 'Pie charts are appropriate for communicating the share of a few clearly distinguishable categories of a whole — e.g. "How does our scrap split across the five defect types?".',
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
            term: 'Zu viele Sektoren',
            content: 'Mehr als 7 Sektoren werden visuell unverdaulich, kleine Anteile lassen sich kaum unterscheiden. Lieber ein Pareto-Diagramm verwenden — es ordnet die Kategorien zusätzlich nach Größe.',
          },
          {
            type: 'definition',
            term: 'Schlechter Größenvergleich',
            content: 'Das menschliche Auge schätzt Winkel und Flächen schlecht. Unterschiede von wenigen Prozentpunkten sind im Tortendiagramm kaum erkennbar. Für präzise Vergleiche ein Balkendiagramm wählen.',
          },
          {
            type: 'definition',
            term: '3D-Effekte verzerren',
            content: '3D-Tortendiagramme verzerren die Sektorenflächen — vordere Sektoren wirken größer als sie sind. Für ehrliche Darstellung 2D bevorzugen.',
          },
          {
            type: 'definition',
            term: 'Anteile addieren sich nicht zu 100 %',
            content: 'Wenn Kategorien Mehrfachzuordnungen erlauben (z. B. „Defekte mit Ursache A oder B"), sind Tortendiagramme irreführend. Sie setzen voraus, dass die Kategorien sich gegenseitig ausschließen.',
          },
          {
            type: 'definition',
            term: 'Vergleich mehrerer Tortendiagramme',
            content: 'Zwei Tortendiagramme nebeneinander vergleichen ist schwierig — Sektoren wechseln Position und Reihenfolge. Bei Vergleichen über Zeit oder Gruppen lieber gestapelte Balken nutzen.',
          },
        ],
      },
      en: {
        title: 'Pitfalls',
        blocks: [
          {
            type: 'definition',
            term: 'Too many slices',
            content: 'More than 7 slices become visually indigestible and small shares are hard to distinguish. Prefer a Pareto chart — it additionally orders categories by size.',
          },
          {
            type: 'definition',
            term: 'Poor size comparison',
            content: 'The human eye estimates angles and areas poorly. Differences of a few percentage points are barely visible in pie charts. For precise comparisons, use a bar chart.',
          },
          {
            type: 'definition',
            term: '3D effects distort',
            content: '3D pie charts distort slice areas — front slices look larger than they are. For honest visualization, prefer 2D.',
          },
          {
            type: 'definition',
            term: 'Shares do not add up to 100 %',
            content: 'When categories allow multiple assignments (e.g. "defects with cause A or B"), pie charts are misleading. They assume that categories are mutually exclusive.',
          },
          {
            type: 'definition',
            term: 'Comparing several pie charts',
            content: 'Comparing two pie charts side by side is hard — slices move and change order. For comparisons across time or groups, use stacked bars instead.',
          },
        ],
      },
    },
  },
};
