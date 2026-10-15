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
              '**Interaktionen** — in der Matrix werden die Paare angekreuzt, die sich berühren oder beeinflussen. Jedes Kreuz ist ein Kandidat für mindestens eine Funktion.',
              '**Funktionsmodell** — jede Funktion ist nützlich (ausreichend, unzureichend, übermäßig) oder schädlich. Der Rang ergibt sich aus dem Objekt: Wirkung auf das Zielobjekt = Basisfunktion, auf das Supersystem = Zusatzfunktion, auf eine Systemkomponente = Hilfsfunktion.',
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
              '**Interactions** — tick the pairs in the matrix that touch or influence each other. Every tick is a candidate for at least one function.',
              '**Function model** — every function is useful (adequate, insufficient, excessive) or harmful. The rank follows from the object: acting on the target = basic function, on the supersystem = additional function, on a system component = auxiliary function.',
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
              '**Kasten mit kräftigem Rand** — Zielobjekt; **gestrichelter Kasten** — Supersystem-Element.',
            ],
          },
          {
            type: 'paragraph',
            content: 'Die Kästen lassen sich verschieben; die Anordnung wird gespeichert. „Anordnung zurücksetzen“ stellt die automatische Startanordnung wieder her. Ein Klick auf einen Kasten oder eine Funktion hebt die zugehörigen Pfeile hervor.',
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
              '**Box with a strong border** — target; **dashed box** — supersystem element.',
            ],
          },
          {
            type: 'paragraph',
            content: 'Boxes can be dragged; the layout is saved. "Reset layout" restores the automatic start layout. Clicking a box or a function highlights the related arrows.',
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
            content: 'Zielobjekt ist der **Belag**. Die Borsten entfernen ihn (nützlich, aber **unzureichend** — die Zwischenräume werden kaum erreicht), die Zahnpasta löst ihn. Bürstenkopf, Griff und Hand halten bzw. führen — Hilfs- und Zusatzfunktionen. Bei zu hohem Druck **verletzen** die Borsten das Zahnfleisch (schädlich). Die Nachteilsliste nennt genau diese beiden Punkte. Das Beispiel lässt sich über die Beispielprojekte laden.',
          },
        ],
      },
      en: {
        title: 'Example: toothbrush',
        blocks: [
          {
            type: 'paragraph',
            content: 'The target is the **plaque**. The bristles remove it (useful but **insufficient** — the gaps are hardly reached), the toothpaste dissolves it. Brush head, handle and hand hold or guide — auxiliary and additional functions. With too much pressure the bristles **injure** the gums (harmful). The disadvantage list names exactly these two points. The example can be loaded from the example projects.',
          },
        ],
      },
    },
  },
};
