/**
 * D.Mike — Activity Flowchart Module Help (activity-flowchart-help.js)
 * Bilingual help content (DE/EN) for the activity flowchart module.
 */
export default {
  moduleId: 'activity-flowchart',
  sections: {
    overview: {
      de: {
        title: 'Aufbau',
        blocks: [
          { type: 'paragraph', content: 'Das {{term:flussdiagramm|Activity-Flowchart}} bildet eine Kette aus Aktivitäten (Rechtecke) und Entscheidungen (Rauten) von links nach rechts ab. In der Raute steht eine Ja/Nein-Frage; ihre beiden Ausgänge sind an den Ecken beschriftet, an denen sie die Raute verlassen: „Ja" rechts, wo die Kette weiterläuft, „Nein" unten. „Ja" ist dabei der Weiterfluss selbst und trägt kein Ziel. Nur der Nein-Ausgang zweigt ab: Er öffnet unter dem Hauptpfad ein eigenes Band, und erst an dessen Ende steht das Ziel — der nächste Schritt, das Prozessende oder ein Sprung auf einen anderen Schritt.' },
        ],
      },
      en: {
        title: 'Structure',
        blocks: [
          { type: 'paragraph', content: 'The {{term:flussdiagramm|Activity Flowchart}} renders a left-to-right chain of activities (rectangles) and decisions (diamonds). A diamond holds a yes/no question, and its two exits are labelled at the vertices they leave from: "Yes" on the right, where the chain flows on, "No" at the bottom. "Yes" is the flow on itself and carries no target. Only the No exit branches off: it opens a band of its own below the main path, and the target sits at the end of that band — the next step, the process end, or a jump to another step.' },
        ],
      },
    },

    whenToUse: {
      de: {
        title: 'Wann verwenden?',
        blocks: [
          { type: 'paragraph', content: 'Das Activity Flowchart eignet sich in der Analyze-Phase, wenn ein Ablauf mit klaren Entscheidungspunkten und möglichen Rücksprüngen dokumentiert werden soll — z. B. Freigabe-, Prüf- oder Genehmigungsprozesse. Im Unterschied zur Prozesskarte verzichtet es bewusst auf Swim Lanes, Input/Output-Klassifikation und Wertschöpfungstypen und konzentriert sich auf die reine Ablauflogik inklusive Verzweigungen.' },
        ],
      },
      en: {
        title: 'When to use',
        blocks: [
          { type: 'paragraph', content: 'The Activity Flowchart fits the Analyze phase when a workflow needs clear decision points and possible loop-backs — e.g. approval, review, or sign-off processes. Unlike the process map, it deliberately drops swim lanes, input/output classification, and value-type tags, focusing purely on flow logic including branches.' },
        ],
      },
    },

    howToUse: {
      de: {
        title: 'Bedienung',
        blocks: [
          { type: 'paragraph', content: 'Über „Aktivität hinzufügen" wird ein neuer Schritt am Ende der Kette angelegt, über „Entscheidung hinzufügen" eine Raute mit Ja/Nein-Ausgängen. Der Ja-Ausgang ist der Weiterfluss: am rechten Zipfel läuft der Wertstrom einfach nach rechts zum nächsten Schritt weiter, es gibt dort nichts zu wählen. Der Nein-Ausgang öffnet dagegen ein eigenes Band unter dem Hauptpfad; erst an dessen Ende sitzt der Target-Picker mit „Nächster Schritt", „Prozessende" oder einem beliebigen anderen Schritt, und dort steht das Ziel immer ausgeschrieben. Ein Rücksprung ist mit ↩ markiert und damit eine Nacharbeitsschleife. Karten und Rauten werden an der blauen Nummer gegriffen; überall sonst bleibt der Text markierbar. Zieht man einen Schritt auf einen Pfeil zwischen zwei Schritten, nimmt er genau diese Stelle in der Kette ein — auch vor dem ersten und hinter dem letzten Schritt, wo während des Ziehens je ein zusätzlicher Pfeil erscheint. Über „Detail-Schritte" lässt sich jede Karte in Unter-Schritte aufklappen. Über „Importieren aus …" lassen sich Schritte aus einer bestehenden SIPOC- oder Process-Map-Instanz übernehmen.' },
        ],
      },
      en: {
        title: 'How to use',
        blocks: [
          { type: 'paragraph', content: 'Use "Add activity" to append a new step at the end of the chain, and "Add decision" for a diamond with Yes/No outputs. The Yes exit is the flow on: at the right vertex the value stream simply continues to the right into the next step, so there is nothing to choose there. The No exit, by contrast, opens a band of its own below the main path; only at its end sits the target picker with "next step", "process end", or any other step, and the target is always spelled out there. A jump back is marked with ↩ and is a rework loop. Cards and diamonds are grabbed by their blue number, so text stays selectable everywhere else. Drop a step on an arrow between two steps and it takes exactly that place in the chain — including in front of the first and behind the last step, where an extra arrow appears while dragging. "Detail steps" expands any card into sub-steps. "Import from …" pulls steps in from an existing SIPOC or Process Map instance.' },
        ],
      },
    },

    noBranchBand: {
      de: {
        title: 'Nein-Band',
        blocks: [
          { type: 'paragraph', content: 'Jede Raute öffnet unter dem Hauptpfad ein eigenes Band für ihren Nein-Zweig. Darin lassen sich eigene Aktivitäten und weitere Rauten anlegen — eine Raute im Band öffnet ihrerseits ein Band darunter, beliebig tief verschachtelt. Am Ende jedes Nein-Bandes steht ein Platzhalter mit zwei Tasten, „Aktivität hinzufügen" und „Entscheidung hinzufügen", und dahinter der Ausgang des Bandes.' },
          { type: 'paragraph', content: 'Der Ausgang schreibt sein Ziel immer aus: der nächste Schritt, das Prozessende als Sackgasse (etwa „verschrotten") oder ein Sprung auf einen anderen Schritt — rückwärts mit ↩ als Nacharbeitsschleife markiert, vorwärts als Wiedereinstieg weiter unten in der Kette. Am Wort „Nein" an der unteren Spitze der Raute steht dagegen kein Ziel mehr; es beschriftet nur noch die Kante, die ins Band hinunterführt.' },
          { type: 'paragraph', content: 'Eine Karte wird an zwei Stellen gegriffen, die sich nicht überschneiden: der Drop auf eine Bandzeile ändert, in welchem Band die Karte liegt, und lässt ihre Kettenposition unangetastet; der Drop auf einen Pfeil zwischen zwei Karten ändert die Kettenposition und lässt das Band unangetastet. Wird eine Raute selbst gezogen, nimmt sie ihr ganzes Band als zusammenhängenden Block mit. Wird sie gelöscht, löst sich ihr Band auf — die Schritte darin erben das Band der gelöschten Raute, statt mit ihr gelöscht zu werden.' },
        ],
      },
      en: {
        title: 'No-branch band',
        blocks: [
          { type: 'paragraph', content: 'Every diamond opens its own band below the main path for its No branch. Inside it, activities and further diamonds can be added — a diamond inside a band opens a band of its own underneath, nested as deep as needed. At the end of every No band sits a placeholder with two buttons, "Add activity" and "Add decision", and behind it the band\'s exit.' },
          { type: 'paragraph', content: 'The exit always spells out its target: the next step, the process end as a dead end (e.g. "scrap"), or a jump to another step — marked with ↩ for a jump back as a rework loop, or plain for a jump forward re-entering the chain further down. At the "No" word at the diamond\'s lower vertex, by contrast, no target is shown any more — it only labels the edge leading down into the band.' },
          { type: 'paragraph', content: 'A card is grabbed for two gestures that never overlap: dropping it on a band row changes which band it lives in and leaves its chain position untouched; dropping it on an arrow between two cards changes its chain position and leaves the band untouched. Dragging a diamond itself takes its whole band along as one connected block. Deleting it dissolves its band — the steps inside inherit the deleted diamond\'s own band instead of being deleted along with it.' },
        ],
      },
    },

    reworkLoops: {
      de: {
        title: 'Rework-Loops',
        blocks: [
          { type: 'paragraph', content: 'Zeigt der Ausgang eines Nein-Bands auf einen früheren statt auf den nächsten Schritt, entsteht ein Nacharbeits-Bogen (Rework-Loop) — das Ziel steht am Bandausgang, mit ↩ als Schleifen-Markierung, nicht mehr an der Raute selbst. Der Umweg kann dabei mehr sein als ein bloßer Rücksprung: im Band lassen sich vor dem Sprung zurück beliebig viele Überarbeitungs-Schritte anlegen, z. B. „Angebot überarbeiten" vor der Rückkehr in die Kalkulation. Ein visueller Bogen über die betroffenen Schritte ist noch nicht gerendert; das folgt in einem späteren Task. Jede Schleife braucht einen erreichbaren Ausgang, sonst bleibt der Prozess in der Analyse hängen; ein Ziel „Prozessende" auf mindestens einem Zweig verhindert das.' },
        ],
      },
      en: {
        title: 'Rework loops',
        blocks: [
          { type: 'paragraph', content: 'When a band\'s exit points back to an earlier step instead of the next one, a rework loop appears — the target is spelled out at the band\'s exit, marked with ↩, no longer at the diamond itself. The detour can be more than a bare jump back: the band can hold any number of revision steps before the jump back, e.g. "Revise quote" before returning to the calculation. A visual arc spanning the affected steps is not rendered yet; that follows in a later task. Every loop needs a reachable exit, otherwise the process gets stuck in the analysis; setting "process end" on at least one branch prevents that.' },
        ],
      },
    },
  },
};
