/**
 * D.Mike — TRIZ Function Analysis Module Handbook
 * Bilingual help content (DE/EN).
 */

export default {
  moduleId: 'triz-function-analysis',
  sections: {
    overview: {
      de: {
        title: 'Überblick',
        blocks: [
          {
            type: 'paragraph',
            content: 'Die **{{term:funktionsanalyse|Funktionsanalyse}}** ist der übliche erste Schritt einer {{term:triz|TRIZ}}-Problemanalyse. Sie zerlegt ein technisches System in seine Komponenten, hält fest, welche Komponenten miteinander in {{term:wechselwirkung|Wechselwirkung}} stehen, und beschreibt jede Wechselwirkung als Funktion: **Träger – Verb – Objekt**.',
          },
          {
            type: 'list',
            items: [
              '**Komponenten** — ein Zielobjekt (worauf die Hauptfunktion wirkt), die Systemkomponenten und die Elemente des {{term:supersystem|Supersystems}}.',
              '**Interaktionen** — in der Matrix werden die Paare angekreuzt, die sich berühren oder beeinflussen. Jedes Kreuz ist ein Kandidat für mindestens eine Funktion. Ein zweiter Klick setzt ein „x“: Das Paar ist bewusst ausgeschlossen, ein dritter leert die Zelle wieder.',
              '**Funktionsmodell** — jedes Paar hat einen eigenen Block, ein Klick auf ein offenes Paar legt ihn mit dem ersten Pfeil an. + legt einen weiteren Pfeil auf dem Paar an (etwa für die Gegenrichtung), der Pfeilknopf kehrt die Richtung um. Jede Funktion ist nützlich (ausreichend, unzureichend, übermäßig) oder schädlich. Der Rang ergibt sich aus dem Objekt: Wirkung auf das Zielobjekt = Basisfunktion, auf das Supersystem = Zusatzfunktion, auf eine Systemkomponente = Hilfsfunktion.',
            ],
          },
          {
            type: 'paragraph',
            content: 'Schädliche, unzureichende und übermäßige Funktionen erscheinen in der **Nachteilsliste**. Sie sind der Ausgangspunkt für die {{term:substanz-feld-analyse|Stoff-Feld-Analyse}} und für die Widerspruchswerkzeuge.',
          },
        ],
      },
      en: {
        title: 'Overview',
        blocks: [
          {
            type: 'paragraph',
            content: '**{{term:funktionsanalyse|Function analysis}}** is the usual first step of a {{term:triz|TRIZ}} problem analysis. It breaks a technical system down into components, records which components {{term:wechselwirkung|interact}}, and describes every interaction as a function: **carrier – verb – object**.',
          },
          {
            type: 'list',
            items: [
              '**Components** — one target (what the main function acts on), the system components and the elements of the {{term:supersystem|supersystem}}.',
              '**Interactions** — tick the pairs in the matrix that touch or influence each other. Every tick is a candidate for at least one function. A second click sets an “x”: the pair is deliberately excluded; a third click clears the cell.',
              '**Function model** — every pair has a block of its own; clicking an open pair creates it with its first arrow. + adds another arrow on the pair (e.g. for the opposite direction), the arrow button reverses the direction. Every function is useful (adequate, insufficient, excessive) or harmful. The rank follows from the object: acting on the target = basic function, on the supersystem = additional function, on a system component = auxiliary function.',
            ],
          },
          {
            type: 'paragraph',
            content: 'Harmful, insufficient and excessive functions appear in the **disadvantage list**. They are the starting point for {{term:substanz-feld-analyse|Su-Field analysis}} and the contradiction tools.',
          },
        ],
      },
    },
    notation: {
      de: {
        title: 'Notation im Diagramm',
        blocks: [
          {
            type: 'list',
            items: [
              '**Durchgezogener Pfeil** — nützlich, ausreichend.',
              '**Gestrichelter Pfeil** — nützlich, aber unzureichend.',
              '**Dicker Pfeil** — nützlich, aber übermäßig.',
              '**Wellenlinie (rot)** — schädliche Funktion.',
              '**Oval** — Zielobjekt; **Kasten** — Systemkomponente; **Sechseck (gestrichelt)** — Supersystem-Element.',
            ],
          },
          {
            type: 'paragraph',
            content: 'Die Komponenten lassen sich verschieben, ebenso die Verben an den Pfeilen: Der Pfeil knickt dann am Verb. Die Anordnung wird gespeichert. „Anordnung zurücksetzen“ stellt die automatische Startanordnung wieder her und macht alle Pfeile wieder gerade. Ein Klick auf eine Komponente oder eine Funktion hebt sie und die zugehörigen Pfeile hervor.',
          },
        ],
      },
      en: {
        title: 'Diagram notation',
        blocks: [
          {
            type: 'list',
            items: [
              '**Solid arrow** — useful, adequate.',
              '**Dashed arrow** — useful but insufficient.',
              '**Bold arrow** — useful but excessive.',
              '**Wavy line (red)** — harmful function.',
              '**Oval** — target; **box** — system component; **hexagon (dashed)** — supersystem element.',
            ],
          },
          {
            type: 'paragraph',
            content: 'Components can be dragged, and so can the verbs on the arrows: the arrow then bends at the verb. The layout is saved. "Reset layout" restores the automatic start layout and straightens all arrows. Clicking a component or a function highlights it and the related arrows.',
          },
        ],
      },
    },
    example: {
      de: {
        title: 'Beispiel: Zahnbürste',
        blocks: [
          {
            type: 'paragraph',
            content: 'Zielobjekt ist der **Belag**. Die Borsten entfernen ihn (nützlich, aber **unzureichend** — die Zwischenräume werden kaum erreicht), die Zahnpasta löst ihn. Bürstenkopf, Griff und Hand halten bzw. führen — Hilfs- und Zusatzfunktionen. Bei zu hohem Druck **verletzen** die Borsten das Zahnfleisch, der Belag selbst **reizt** es (beides schädlich). Die Nachteilsliste nennt genau diese drei Punkte. In der Matrix ist jedes Paar entschieden: Haken für Paare, die zusammenwirken, „x“ für alle anderen. Das Beispiel lässt sich über die Beispielprojekte laden.',
          },
        ],
      },
      en: {
        title: 'Example: toothbrush',
        blocks: [
          {
            type: 'paragraph',
            content: 'The target is the **plaque**. The bristles remove it (useful but **insufficient** — the gaps are hardly reached), the toothpaste dissolves it. Brush head, handle and hand hold or guide — auxiliary and additional functions. With too much pressure the bristles **injure** the gums, and the plaque itself **irritates** them (both harmful). The disadvantage list names exactly these three points. Every pair in the matrix is decided: a tick for pairs that interact, an “x” for all others. The example can be loaded from the example projects.',
          },
        ],
      },
    },
  },
};
