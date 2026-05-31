/**
 * D.Mike — Short-Run Chart Module Handbook
 */

export default {
  moduleId: 'short-run-chart',
  sections: {
    overview: {
      de: {
        title: 'Z-MR — Standardisierte I-MR für kurze Serien',
        blocks: [
          {
            type: 'paragraph',
            content: 'In Werkstätten oder Werkzeugbau-Umgebungen werden viele verschiedene Teile in kleinen Stückzahlen gefertigt. Eine klassische I-MR-Karte braucht 20–25 Punkte je Teil — das ergibt sich bei kurzen Serien nicht. Die Z-MR-Karte umgeht das, indem jeder Wert innerhalb seines Teils standardisiert wird; alle Teile landen dann auf einer einzigen Karte.',
          },
          {
            type: 'definition',
            term: 'Standardisierung',
            content: 'Pro Teil j wird {{term:mittelwert|Mittelwert}} x̄_j und σ̂_j (aus MR̄_j/d₂) berechnet. Jeder Messwert wird transformiert zu z_ij = (x_ij − x̄_j) / σ̂_j. Die z-Werte sind unter stabilen Bedingungen ~N(0,1).',
          },
          {
            type: 'definition',
            term: 'Eingriffsgrenzen',
            content: 'Für die z-Karte: CL = 0, UCL = +3, LCL = −3 (3σ-Konvention). Für die MR-Karte: CL = MR̄_z, UCL = D₄·MR̄_z, LCL = 0.',
          },
          {
            type: 'paragraph',
            content: 'Vorteil: ein Diagramm für alle Teile, kontinuierliche Überwachung über Auftragswechsel hinweg. Nachteil: man verliert die direkte Bedeutung der Originaleinheit auf der Karte (man interpretiert in σ-Einheiten).',
          },
        ],
      },
      en: {
        title: 'Z-MR — Standardised I-MR for Short Runs',
        blocks: [
          {
            type: 'paragraph',
            content: 'In workshops or tooling environments many different parts are produced in small batches. A classic I-MR chart needs 20–25 points per part — short runs cannot meet that. The Z-MR chart works around this by standardising each value within its part; all parts then live on one single chart.',
          },
          {
            type: 'definition',
            term: 'Standardisation',
            content: 'For each part j compute {{term:mittelwert|mean}} x̄_j and σ̂_j (from MR̄_j/d₂). Each value is transformed to z_ij = (x_ij − x̄_j) / σ̂_j. Under stable conditions z is ~N(0,1).',
          },
          {
            type: 'definition',
            term: 'Control limits',
            content: 'On the z chart: CL = 0, UCL = +3, LCL = −3 (3σ convention). On the MR chart: CL = MR̄_z, UCL = D₄·MR̄_z, LCL = 0.',
          },
          {
            type: 'paragraph',
            content: 'Pros: one chart for many parts, continuous monitoring across job changes. Cons: lose the direct meaning of the original unit on the chart (interpretation is in σ units).',
          },
        ],
      },
    },

    pitfalls: {
      de: {
        title: 'Stolperfallen',
        blocks: [
          { type: 'definition', term: 'Zu wenige Punkte je Teil', content: 'Mit n=1 oder n=2 je Teil wird σ̂_j unzuverlässig. Faustregel: mindestens 5 Punkte je Teil bevor Standardisierung sinnvoll wird. Teile mit zu wenigen Punkten werden mit z=0 abgehandelt und in einer Warnung gemeldet.' },
          { type: 'definition', term: 'Reihenfolge im Worksheet', content: 'Die Karte plottet in Worksheet-Reihenfolge. Die Gruppen-Spalte muss zur tatsächlichen Bearbeitungsreihenfolge passen, sonst sind Trends innerhalb eines Teils unsichtbar.' },
          { type: 'definition', term: 'Heterogene σ', content: 'Wenn die Streuung zwischen Teilen sehr unterschiedlich ist, kann eine 1σ-Verschiebung bei Teil A genauso aussehen wie eine 0,3σ-Verschiebung bei Teil B. Die Karte normalisiert das zwar, aber Diagnostik braucht Blick auf die Tabelle der Per-Teil-σ̂.' },
        ],
      },
      en: {
        title: 'Pitfalls',
        blocks: [
          { type: 'definition', term: 'Too few points per part', content: 'With n=1 or n=2 per part σ̂_j becomes unreliable. Rule of thumb: at least 5 points per part before standardisation is meaningful. Parts with too few points are handled as z=0 and surfaced via a warning.' },
          { type: 'definition', term: 'Worksheet order', content: 'The chart plots in worksheet order. The group column must match the actual production order; otherwise within-part trends are invisible.' },
          { type: 'definition', term: 'Heterogeneous σ', content: 'If spread differs strongly between parts, a 1σ shift on part A can look the same as a 0.3σ shift on part B. The chart normalises this, but diagnosis needs the per-part σ̂ table.' },
        ],
      },
    },
  },
};
