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
              '**Funktionsmodell** — jedes Paar hat einen eigenen Block, ein Klick auf ein offenes Paar legt ihn mit dem ersten Pfeil an. + legt einen weiteren Pfeil auf dem Paar an (etwa für die Gegenrichtung), der Pfeilknopf kehrt die Richtung um. Jede Funktion ist nützlich (ausreichend, unzureichend, übermäßig) oder schädlich. Der Rang ergibt sich aus dem Objekt: Wirkung auf das Zielobjekt = Basisfunktion, auf das Supersystem = Zusatzfunktion, auf eine Systemkomponente = Hilfsfunktion. Hilfsfunktionen sind nach ihrem Abstand gestuft: Ax1 wirkt auf eine Komponente, die selbst eine Basis- oder Zusatzfunktion trägt, Ax2 auf eine, die eine Ax1-Funktion trägt, und so weiter; der kürzeste Weg zählt. Ohne Weg zu einer Basis- oder Zusatzfunktion steht nur „Ax“. **Funktionsränge anzeigen** schreibt die Kürzel B, Ad und Ax1…Axn an die Pfeile, auch im Export.',
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
              '**Function model** — every pair has a block of its own; clicking an open pair creates it with its first arrow. + adds another arrow on the pair (e.g. for the opposite direction), the arrow button reverses the direction. Every function is useful (adequate, insufficient, excessive) or harmful. The rank follows from the object: acting on the target = basic function, on the supersystem = additional function, on a system component = auxiliary function. Auxiliary functions are graded by their distance: Ax1 acts on a component that carries a basic or additional function itself, Ax2 on one that carries an Ax1 function, and so on; the shortest way counts. Without a way to a basic or additional function it reads just “Ax”. **Show function ranks** writes the codes B, Ad and Ax1…Axn on the arrows, also in the export.',
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
    valueCost: {
      de: {
        title: 'Wert & Kosten',
        blocks: [
          {
            type: 'paragraph',
            content: 'Im Reiter **Komponenten** bekommt jede Systemkomponente ein Feld für ihre Kosten in Euro. Zielobjekt und Supersystem gehören nicht zum System und haben keine Kosten. Der **Funktionswert** einer Komponente wird nicht eingegeben, sondern aus dem Funktionsmodell berechnet: Jede nützliche Funktion, die sie trägt, zählt nach ihrem Rang — Basisfunktion 3, Zusatzfunktion 2, Hilfsfunktion 1. Schädliche Funktionen und unvollständige Entwürfe zählen 0.',
          },
          {
            type: 'list',
            items: [
              '**Normierung** — Wert und Kosten werden auf 0 bis 10 umgerechnet: Die Komponente mit dem höchsten Wert bzw. den höchsten Kosten erhält 10, die übrigen anteilig.',
              '**Diagramm** — x = normierter Funktionswert, y = normierte Kosten. Komponenten ohne Kosten fehlen im Diagramm und zeigen in der Tabelle „–“.',
              '**Quadranten** — die gestrichelten Linien bei 5 teilen das Diagramm. Oben links liegen Komponenten mit wenig Funktion und hohen Kosten: Sie sind die ersten Kandidaten für das **Trimmen**.',
            ],
          },
        ],
      },
      en: {
        title: 'Value & cost',
        blocks: [
          {
            type: 'paragraph',
            content: 'In the **Components** tab every system component gets a field for its cost in euros. The target and the supersystem are not part of the system and have no cost. A component’s **function value** is not entered but computed from the function model: every useful function it carries counts by its rank — basic function 3, additional function 2, auxiliary function 1. Harmful functions and incomplete drafts count 0.',
          },
          {
            type: 'list',
            items: [
              '**Normalisation** — value and cost are scaled to 0 to 10: the component with the highest value or cost gets 10, the others proportionally.',
              '**Plot** — x = normalised function value, y = normalised cost. Components without a cost are left out of the plot and show “–” in the table.',
              '**Quadrants** — the dashed lines at 5 split the plot. The top left holds components with little function and high cost: they are the first candidates for **trimming**.',
            ],
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
