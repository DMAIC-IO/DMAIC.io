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
          { type: 'paragraph', content: 'Das Activity-Flowchart bildet eine Kette aus Aktivitäten (Rechtecke) und Entscheidungen (Rauten) von links nach rechts ab. In der Raute steht eine Ja/Nein-Frage; ihre beiden Ausgänge sind an den Ecken beschriftet, an denen sie die Raute verlassen: „Ja" rechts, wo die Kette weiterläuft, „Nein" unten. Jeder Ausgang kann auf den nächsten Schritt, das Prozessende oder einen früheren Schritt (Nacharbeits-Bogen) zeigen.' },
        ],
      },
      en: {
        title: 'Structure',
        blocks: [
          { type: 'paragraph', content: 'The Activity Flowchart renders a left-to-right chain of activities (rectangles) and decisions (diamonds). A diamond holds a yes/no question, and its two exits are labelled at the vertices they leave from: "Yes" on the right, where the chain flows on, "No" at the bottom. Each exit can point to the next step, the process end, or an earlier step (a rework loop).' },
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
          { type: 'paragraph', content: 'Über „Aktivität hinzufügen" wird ein neuer Schritt am Ende der Kette angelegt, über „Entscheidung hinzufügen" eine Raute mit Ja/Nein-Ausgängen. Der Ja-Ausgang ist der Weiterfluss: am rechten Zipfel läuft der Wertstrom einfach nach rechts zum nächsten Schritt weiter, es gibt dort nichts zu wählen. Nur der Nein-Ausgang hat ein Ziel — ein Klick darauf öffnet den Target-Picker mit „Nächster Schritt", „Prozessende" oder einem beliebigen anderen Schritt. Unter dem Wort steht das Ziel nur dann, wenn es vom einfachen Weiterfluss abweicht; ein Rücksprung ist mit ↩ markiert und damit eine Nacharbeitsschleife. Karten und Rauten werden an der blauen Nummer gegriffen; überall sonst bleibt der Text markierbar. Zieht man einen Schritt auf einen Pfeil zwischen zwei Schritten, nimmt er genau diese Stelle in der Kette ein — auch vor dem ersten und hinter dem letzten Schritt, wo während des Ziehens je ein zusätzlicher Pfeil erscheint. Über „Detail-Schritte" lässt sich jede Karte in Unter-Schritte aufklappen. Über „Importieren aus …" lassen sich Schritte aus einer bestehenden SIPOC- oder Process-Map-Instanz übernehmen.' },
        ],
      },
      en: {
        title: 'How to use',
        blocks: [
          { type: 'paragraph', content: 'Use "Add activity" to append a new step at the end of the chain, and "Add decision" for a diamond with Yes/No outputs. The Yes exit is the flow on: at the right vertex the value stream simply continues to the right into the next step, so there is nothing to choose there. Only the No exit has a target — clicking it opens the target picker with "next step", "process end", or any other step. The target is spelled out under the word only where it deviates from simply flowing on; a jump back is marked with ↩ and is a rework loop. Cards and diamonds are grabbed by their blue number, so text stays selectable everywhere else. Drop a step on an arrow between two steps and it takes exactly that place in the chain — including in front of the first and behind the last step, where an extra arrow appears while dragging. "Detail steps" expands any card into sub-steps. "Import from …" pulls steps in from an existing SIPOC or Process Map instance.' },
        ],
      },
    },

    reworkLoops: {
      de: {
        title: 'Rework-Loops',
        blocks: [
          { type: 'paragraph', content: 'Zeigt eine Entscheidung auf einen früheren statt auf den nächsten Schritt, entsteht ein Nacharbeits-Bogen (Rework-Loop) — das Ziel steht unter dem Ja- bzw. Nein-Ausgang, mit ↩ als Schleifen-Markierung. Ein visueller Bogen über die betroffenen Schritte ist noch nicht gerendert; das folgt in einem späteren Task. Jede Schleife braucht einen erreichbaren Ausgang, sonst bleibt der Prozess in der Analyse hängen; ein Ziel „Prozessende" auf mindestens einem Zweig verhindert das.' },
        ],
      },
      en: {
        title: 'Rework loops',
        blocks: [
          { type: 'paragraph', content: 'When a decision points back to an earlier step instead of the next one, a rework loop appears — the target is spelled out under the Yes or No exit, marked with ↩. A visual arc spanning the affected steps is not rendered yet; that follows in a later task. Every loop needs a reachable exit, otherwise the process gets stuck in the analysis; setting "process end" on at least one branch prevents that.' },
        ],
      },
    },
  },
};
