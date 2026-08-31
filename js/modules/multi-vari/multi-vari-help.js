/**
 * D.Mike — Multi-Vari Module Handbook (multi-vari-help.js)
 * Bilingual help content (DE/EN).
 */

export default {
  moduleId: 'multi-vari',
  sections: {
    overview: {
      de: {
        title: 'Multi-Vari-Diagramm',
        blocks: [
          {
            type: 'paragraph',
            content: 'Das Multi-Vari-Diagramm zeigt **jede einzelne Messung**, gestaffelt nach bis zu vier Einflussgrößen. Es beantwortet die Frage, die eine einzelne Kennzahl verdeckt: entsteht die Streuung *zwischen* den Schichten, *zwischen* den Werkzeugnestern oder *innerhalb* eines Teils?',
          },
          {
            type: 'paragraph',
            content: 'In Minitab liegt es unter *Statistik → Qualitätswerkzeuge → Multi-Vari-Diagramm*. D.Mike ergänzt darunter die Tabelle der {{term:varianzkomponenten|Varianzkomponenten}} — sie beziffert, was das Bild zeigt.',
          },
          {
            type: 'definition',
            term: 'Reihenfolge der Einflussgrößen',
            content: 'Position 1 liegt auf der X-Achse und bildet zugleich die äußerste Schachtelungsebene, Position 2 wird zur Serie (Farbe und Symbol), Position 3 zur Panel-Spalte, Position 4 zur Panel-Zeile. Layout und Modell folgen derselben Reihenfolge — Bild und Zahlen können deshalb nicht auseinanderlaufen.',
          },
          {
            type: 'definition',
            term: 'Geschachtelt oder gekreuzt',
            content: 'Geschachtelt: die Stufen des zweiten Faktors existieren nur innerhalb einer Stufe des ersten (Teil 1 aus Nest 1 hat mit Teil 1 aus Nest 2 nichts zu tun). Gekreuzt: jede Stufe kommt mit jeder anderen vor (Maschine 1 läuft in Früh- und Spätschicht).',
          },
        ],
      },
      en: {
        title: 'Multi-Vari Chart',
        blocks: [
          {
            type: 'paragraph',
            content: 'The multi-vari chart shows **every single measurement**, staged across up to four factors. It answers the question a single summary statistic hides: does the variation arise *between* shifts, *between* mould cavities, or *within* one part?',
          },
          {
            type: 'paragraph',
            content: 'In Minitab it lives under *Stat → Quality Tools → Multi-Vari Chart*. D.Mike adds the variance-component table underneath — it puts numbers on what the picture shows.',
          },
          {
            type: 'definition',
            term: 'Factor order',
            content: 'Position 1 sits on the x axis and is also the outermost nesting level, position 2 becomes the series (colour and symbol), position 3 the panel column, position 4 the panel row. Layout and model follow the same order, so the picture and the numbers cannot drift apart.',
          },
          {
            type: 'definition',
            term: 'Nested or crossed',
            content: 'Nested: the levels of the second factor exist only inside one level of the first (part 1 from cavity 1 has nothing to do with part 1 from cavity 2). Crossed: every level occurs with every other (machine 1 runs on both the early and the late shift).',
          },
        ],
      },
    },

    methodology: {
      de: {
        title: 'Daten & Bedienung',
        blocks: [
          {
            type: 'list',
            items: [
              '**Messwertspalte** — eine numerische Spalte mit den Einzelmessungen.',
              '**Einflussgrößen** — zwei bis vier Spalten mit den Stufen. Zeilen mit leerer Stufe oder nicht-numerischem Messwert werden übersprungen und gemeldet.',
              '**Reihenfolge** — am Griff ziehen. Die Rollenbeschriftung links wandert mit.',
              '**Schätzer** — *ANOVA (Henderson I)* zerlegt die sequenziellen Quadratsummen über die erwarteten mittleren Quadrate; *REML* schätzt die Komponenten direkt aus der Likelihood. Bei balanciertem Plan stimmen beide praktisch überein.',
            ],
          },
          {
            type: 'paragraph',
            content: 'Negative Varianzschätzungen werden **nach** dem Lösen auf 0 gesetzt und in der Tabelle gekennzeichnet. Ein solcher Fall heißt in der Regel: für diese Ebene liegen zu wenige Daten vor.',
          },
        ],
      },
      en: {
        title: 'Data & operation',
        blocks: [
          {
            type: 'list',
            items: [
              '**Measurement column** — one numeric column holding the single measurements.',
              '**Factors** — two to four columns of levels. Rows with an empty level or a non-numeric measurement are skipped and reported.',
              '**Order** — drag by the grip. The role label on the left moves with it.',
              '**Estimator** — *ANOVA (Henderson I)* decomposes the sequential sums of squares via expected mean squares; *REML* estimates the components directly from the likelihood. On a balanced design the two agree for practical purposes.',
            ],
          },
          {
            type: 'paragraph',
            content: 'Negative variance estimates are clamped to 0 **after** the solve and marked in the table. Such a case usually means there is too little data for that level.',
          },
        ],
      },
    },

    pitfalls: {
      de: {
        title: 'Fallstricke',
        blocks: [
          {
            type: 'list',
            items: [
              '**Unbalancierter Plan.** Sind die Zellen unterschiedlich besetzt, hängen die Komponenten vom Schätzverfahren ab. Das Modul weist darauf hin; REML ist dann die belastbarere Wahl.',
              '**Falsche Modellform.** Ein geschachtelter Plan, gekreuzt gerechnet, erzeugt Wechselwirkungsterme, die es gar nicht geben kann. Im Zweifel: existieren die Stufen des zweiten Faktors auch außerhalb der ersten?',
              '**Zu viele Stufen auf Position 1.** Über 30 Stufen wird die X-Achse unlesbar. Faktor mit weniger Stufen nach vorn.',
              '**Anteil ≠ Bedeutung.** Ein großer Varianzanteil sagt, wo die Streuung entsteht — nicht, ob sie stört. Erst der Vergleich mit der Toleranz macht daraus eine Aussage.',
              '**Reihenfolge ist Modell.** Das Umsortieren der Faktoren ändert im geschachtelten Fall die gerechneten Terme, nicht nur das Bild.',
            ],
          },
        ],
      },
      en: {
        title: 'Pitfalls',
        blocks: [
          {
            type: 'list',
            items: [
              '**Unbalanced design.** With unequally occupied cells the components depend on the estimator. The module says so; REML is the more dependable choice then.',
              '**Wrong model form.** A nested design computed as crossed produces interaction terms that cannot exist. When in doubt: do the second factor\'s levels also exist outside the first?',
              '**Too many levels in position 1.** Beyond 30 levels the x axis becomes unreadable. Move a factor with fewer levels to the front.',
              '**Share ≠ importance.** A large variance share says where the variation arises — not whether it hurts. Only the comparison with the tolerance turns it into a statement.',
              '**Order is model.** Reordering the factors changes the computed terms in the nested case, not just the picture.',
            ],
          },
        ],
      },
    },
  },
};
