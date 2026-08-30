/**
 * D.Mike — Kano Module Handbook (kano-help.js)
 * Bilingual help content (DE/EN) for the Kano prioritization module.
 */

export default {
  moduleId: 'kano',
  sections: {
    overview: {
      de: {
        title: 'Überblick',
        blocks: [
          {
            type: 'paragraph',
            content: 'Das {{term:kano|Kano-Modell}} beantwortet eine Frage, die eine reine Bedürfnisliste offenlässt: Wirkt eine Anforderung überhaupt gleich stark, egal ob sie erfüllt ist oder nicht? Die Antwort ist meist nein. Manche Merkmale verärgern nur bei Fehlen, ohne bei Erfüllung zusätzlich zu begeistern; andere tun genau das Gegenteil. Das Modul ordnet jede erhobene Anforderung nach diesem Muster ein und liefert damit eine Priorisierung, die reine Wichtigkeitsskalen nicht leisten.',
          },
          {
            type: 'paragraph',
            content: 'Im DMAIC-Ablauf setzt Kano an, nachdem der {{term:voc|VoC}}→{{term:ctq|CTx}}-Baum Bedürfnisse, Treiber und Anforderungen sauber herausgearbeitet hat, und bevor daraus verbindlich entschieden wird, woran zuerst gearbeitet wird. Ohne diesen Zwischenschritt bekommt jede Anforderung dasselbe Gewicht — mit ihm zeigt sich, welche Merkmale den Unterschied zwischen „funktioniert“ und „begeistert“ machen.',
          },
          {
            type: 'definition',
            term: 'Basismerkmal (M)',
            content: 'Wird vorausgesetzt. Ist es erfüllt, fällt das kaum auf; fehlt es, entsteht deutliche Unzufriedenheit. Investitionen hier verhindern Ärger, sie erzeugen keine Begeisterung.',
          },
          {
            type: 'definition',
            term: 'Leistungsmerkmal (O)',
            content: 'Zufriedenheit steigt proportional zum Erfüllungsgrad, Unzufriedenheit sinkt entsprechend. Klassisches „mehr ist besser“ — hier wirkt jede Verbesserung direkt messbar.',
          },
          {
            type: 'definition',
            term: 'Begeisterungsmerkmal (A)',
            content: 'Wird nicht erwartet. Fehlt es, stört das kaum; ist es da, überrascht es positiv. Begeisterungsmerkmale wandern mit der Zeit oft zu Leistungs- oder sogar Basismerkmalen, sobald der Markt sich daran gewöhnt hat.',
          },
          {
            type: 'definition',
            term: 'Indifferent (I)',
            content: 'Weder Erfüllung noch Fehlen verändert die Zufriedenheit spürbar. Aufwand hier lohnt sich in der Regel nicht.',
          },
          {
            type: 'definition',
            term: 'Umgekehrt (R)',
            content: 'Die Reaktion läuft entgegengesetzt zur Erwartung — Befragte wären eher zufrieden, wenn das Merkmal fehlt. Häufig ein Hinweis darauf, dass die Anforderung falsch formuliert oder aus der falschen Perspektive gestellt wurde.',
          },
          {
            type: 'definition',
            term: 'Widersprüchlich (Q)',
            content: 'Die beiden Antworten zu einem Item widersprechen sich logisch. Kein inhaltliches Ergebnis, sondern ein Hinweis auf ein Datenproblem — siehe unten.',
          },
          {
            type: 'paragraph',
            content: 'Die Items kommen aus dem {{term:ctx-baum|VoC→CTx-Baum}}: wahlweise auf Ebene der Bedürfnisse, der Treiber oder der Requirements. Eine Kano-Instanz arbeitet immer auf genau einer dieser drei Ebenen; wer sowohl Bedürfnisse als auch Treiber bewerten will, legt zwei getrennte Instanzen an.',
          },
          {
            type: 'paragraph',
            content: 'Der Abgleich mit dem Baum läuft nie automatisch im Hintergrund. Eine Statuszeile zeigt an, wie viele Knoten neu hinzugekommen, umbenannt oder aus dem Baum verschwunden sind — erst ein Klick auf „Aus Baum übernehmen“ setzt das um. Verschwundene Knoten werden dabei nicht gelöscht, sondern nur als verwaist markiert; ihre bereits erfassten Antworten bleiben erhalten, falls der Knoten nur vorübergehend umgebaut wurde oder die Auswertung trotzdem noch gebraucht wird. Die Datenrichtung ist grundsätzlich einseitig: Das Kano-Modul liest aus dem Baum, schreibt aber nie in ihn zurück.',
          },
        ],
      },
      en: {
        title: 'Overview',
        blocks: [
          {
            type: 'paragraph',
            content: 'The {{term:kano|Kano model}} answers a question a plain needs list leaves open: does a requirement really matter the same amount whether it is met or not? Usually not. Some features only cause frustration when missing, without adding extra delight when present; others do the exact opposite. The module classifies every collected requirement along that pattern, producing a prioritization that a simple importance scale cannot deliver on its own.',
          },
          {
            type: 'paragraph',
            content: 'In the DMAIC flow, Kano comes into play once the {{term:voc|VoC}}→{{term:ctq|CTx}} tree has worked out needs, drivers, and requirements, and before a binding decision is made on what to tackle first. Skip this step and every requirement carries equal weight; run it, and it becomes visible which features separate "it works" from "it delights".',
          },
          {
            type: 'definition',
            term: 'Must-be (M)',
            content: 'Also called basic quality. Taken for granted. Meeting it barely registers; missing it causes clear dissatisfaction. Investment here prevents anger, it does not create delight.',
          },
          {
            type: 'definition',
            term: 'Performance (O)',
            content: 'Satisfaction rises with the degree of fulfillment, dissatisfaction falls accordingly. The classic "more is better" — every improvement here shows up directly.',
          },
          {
            type: 'definition',
            term: 'Attractive (A)',
            content: 'Also called excitement quality. Not expected at all. Its absence barely bothers anyone; its presence is a pleasant surprise. Attractive features tend to migrate toward performance or even must-be status once the market gets used to them.',
          },
          {
            type: 'definition',
            term: 'Indifferent (I)',
            content: 'Neither fulfilling nor omitting the feature moves satisfaction in any noticeable way. Effort spent here rarely pays off.',
          },
          {
            type: 'definition',
            term: 'Reverse (R)',
            content: 'The reaction runs opposite to what was expected — respondents would actually be happier without the feature. Often a sign that the requirement was phrased wrong or asked from the wrong perspective.',
          },
          {
            type: 'definition',
            term: 'Questionable (Q)',
            content: 'The two answers to one item logically contradict each other. Not a substantive result but a signal of a data problem — see below.',
          },
          {
            type: 'paragraph',
            content: 'Items come from the VoC→CTx tree, at the level of needs, drivers, or requirements — whichever is chosen. One Kano instance always works on exactly one of these three levels; anyone who needs to rate both needs and drivers creates two separate instances.',
          },
          {
            type: 'paragraph',
            content: 'Reconciling with the tree never happens silently in the background. A status line reports how many nodes were added, renamed, or have disappeared from the tree — only clicking "adopt from tree" carries that over. Vanished nodes are never deleted, only flagged as orphaned; their already-captured answers are kept, in case the node was only temporarily restructured or the results are still needed. Data flow is strictly one-directional: the Kano module reads from the tree but never writes back to it.',
          },
        ],
      },
    },

    methodology: {
      de: {
        title: 'Vorgehen',
        blocks: [
          {
            type: 'paragraph',
            content: 'Die Erfassung ist nach Befragten organisiert: eine Reiterleiste erlaubt es, zwischen mehreren Personen zu wechseln, ohne dass sich die Item-Liste ändert. Zu jedem Item werden zwei Fragen auf derselben fünfstufigen Reaktionsskala gestellt — von „das würde mich sehr freuen“ bis „das würde mich sehr stören“: einmal, wie die Reaktion ausfällt, wenn die Anforderung erfüllt ist (funktionale Frage), einmal, wie sie ausfällt, wenn sie nicht erfüllt ist (dysfunktionale Frage).',
          },
          {
            type: 'paragraph',
            content: 'Beide Fragen sind nötig, weil erst ihre Kombination die Kategorie ergibt. Eine einzelne Frage kann nicht unterscheiden, ob Zustimmung zu „das ist mir wichtig“ auf ein Basis-, Leistungs- oder Begeisterungsmerkmal zurückgeht — dieselbe hohe Wichtigkeit sieht bei allen dreien gleich aus. Erst das Antwortpaar, nachgeschlagen in der klassischen Kano-Auswertungstabelle, trennt die sechs Kategorien.',
          },
          {
            type: 'paragraph',
            content: 'Optional lässt sich eine dritte Frage nach der Wichtigkeit zuschalten, auf einer Skala von 1 (völlig unwichtig) bis 9 (außerordentlich wichtig). Sie verändert die Kategorie eines Items nicht — dafür bleiben allein die beiden Kano-Fragen maßgeblich —, fließt aber als Blasengröße ins Better/Worse-Diagramm und hilft, innerhalb einer Kategorie zu priorisieren. Wo die Befragung kurz bleiben muss oder die relative Rangfolge innerhalb einer Kategorie ohnehin nicht gebraucht wird, lässt sie sich weglassen.',
          },
          {
            type: 'paragraph',
            content: 'Die Kategorie eines Items ist der Modalwert über alle Befragten: welche der sechs Kategorien am häufigsten vorkommt. Bei einem Gleichstand entscheidet die Reihenfolge M > O > A > I > R > Q — die stärkere, eindeutigere Kategorie gewinnt —, und die Zeile wird zusätzlich als Gleichstand markiert, damit das nicht unbemerkt bleibt.',
          },
          {
            type: 'paragraph',
            content: 'Aus denselben Zähldaten entstehen zwei Kennzahlen: CS = (A+O)/(A+O+M+I) beschreibt das Zufriedenheitspotenzial, wenn die Anforderung erfüllt wird — je näher an 1, desto mehr Zufriedenheit lässt sich gewinnen. DS = −(O+M)/(A+O+M+I) beschreibt das Unzufriedenheitsrisiko, wenn sie nicht erfüllt wird — je näher an −1, desto größer der Schaden bei Nichterfüllung. R und Q stehen bewusst nicht im Nenner: Sie drücken keine Präferenz für oder gegen die Anforderung aus, sondern eine Umkehrung der erwarteten Reaktion (R) beziehungsweise einen Widerspruch in den Antworten (Q). Sie in die Kennzahl einzurechnen würde CS und DS verwässern, statt sie zu schärfen. Bestehen die Antworten zu einem Item ausschließlich aus R und Q, wird der Nenner 0 — dann gibt es keine Kennzahl, die Anzeige zeigt „—“.',
          },
          {
            type: 'paragraph',
            content: 'Das Better/Worse-Diagramm trägt CS und DS gegeneinander auf: x = |DS|, y = CS, mit Hilfslinien bei jeweils 0,5. Ist die dritte Frage aktiv, wächst die Blasengröße mit der mittleren Wichtigkeit des Items. Unter dem Diagramm stehen die vier Quadranten als Legende: oben links Begeisterung, oben rechts Leistung, unten links Indifferent, unten rechts Basis.',
          },
          {
            type: 'paragraph',
            content: 'Ein hoher Anteil widersprüchlicher (Q-)Antworten ist so gut wie nie ein inhaltlicher Befund, sondern fast immer ein Zeichen, dass eine Frage missverstanden oder mit vertauschter Polung beantwortet wurde. Das Modul warnt, sobald der Q-Anteil 10 % übersteigt — sowohl insgesamt als auch pro Item. In diesem Fall lohnt es sich, die betroffene Formulierung zu prüfen und im Zweifel bei der befragten Person nachzufragen, statt die Kategorie unbesehen zu übernehmen.',
          },
        ],
      },
      en: {
        title: 'Approach',
        blocks: [
          {
            type: 'paragraph',
            content: 'Capture is organized by respondent: a tab bar switches between people without changing the item list. Each item carries two questions on the same five-step reaction scale — from "I would be delighted" to "I would be very unhappy": one asking how the respondent reacts if the requirement is met (the functional question), one asking how they react if it is not (the dysfunctional question).',
          },
          {
            type: 'paragraph',
            content: 'Both questions are needed because only their combination yields the category. A single question cannot tell whether agreeing with "this matters to me" reflects a must-be, performance, or attractive feature — the same high importance looks identical for all three. Only the answer pair, looked up in the classic Kano evaluation table, separates the six categories.',
          },
          {
            type: 'paragraph',
            content: 'An optional third question adds importance on a scale from 1 (not important at all) to 9 (extremely important). It does not change an item\'s category — that is decided solely by the two Kano questions — but feeds bubble size in the Better/Worse chart and helps rank items within the same category. Where the survey needs to stay short, or a within-category ranking is not needed anyway, it can be left out.',
          },
          {
            type: 'paragraph',
            content: 'An item\'s category is the modal value across all respondents: whichever of the six categories occurs most often. On a tie, the order M > O > A > I > R > Q decides — the stronger, more decisive category wins — and the row is additionally flagged as a tie so it does not go unnoticed.',
          },
          {
            type: 'paragraph',
            content: 'The same counts produce two metrics: CS = (A+O)/(A+O+M+I) describes the satisfaction potential if the requirement is fulfilled — the closer to 1, the more satisfaction is up for grabs. DS = −(O+M)/(A+O+M+I) describes the dissatisfaction risk if it is not — the closer to −1, the greater the damage from not delivering. R and Q are deliberately excluded from the denominator: they express no preference for or against the requirement, only a reversal of the expected reaction (R) or a contradiction between the answers (Q). Counting them in would dilute CS and DS rather than sharpen them. If an item\'s answers are entirely R and Q, the denominator becomes 0 — no metric applies, and the display shows "—".',
          },
          {
            type: 'paragraph',
            content: 'The Better/Worse chart plots CS against DS: x = |DS|, y = CS, with reference lines at 0.5 on each axis. When the third question is active, bubble size grows with the item\'s mean importance. Below the chart, the four quadrants appear as a legend: top-left attractive, top-right performance, bottom-left indifferent, bottom-right must-be.',
          },
          {
            type: 'paragraph',
            content: 'A high share of questionable (Q) answers is almost never a substantive finding — it is nearly always a sign that a question was misunderstood or answered with reversed polarity. The module warns once the Q share exceeds 10%, both overall and per item. When that happens, it is worth reviewing the wording in question and, when in doubt, asking the respondent again rather than accepting the category at face value.',
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
            term: 'Eine Ebene für alles nutzen wollen',
            content: 'Eine Kano-Instanz bewertet immer nur eine Baumebene. Wer Bedürfnisse und Treiber getrennt einordnen will, braucht zwei Instanzen — nicht eine Ebene wechseln und hoffen, dass die alten Antworten passen.',
          },
          {
            type: 'definition',
            term: 'Den Sync-Hinweis ignorieren',
            content: 'Ändert sich der Baum, bleibt die Item-Liste so lange auf altem Stand, bis „Aus Baum übernehmen“ geklickt wird. Wer die Statuszeile übergeht, wertet unbemerkt veraltete oder umbenannte Items aus.',
          },
          {
            type: 'definition',
            term: 'Verwaiste Items sofort löschen',
            content: 'Ein aus dem Baum verschwundener Knoten wird markiert, nicht gelöscht — die Antworten bleiben erhalten. Vor dem manuellen Löschen lohnt sich ein Blick, ob der Knoten nur umbenannt oder verschoben wurde und die Antworten weiterhin gültig sind.',
          },
          {
            type: 'definition',
            term: 'Die dritte Frage bei knapper Zeit erzwingen',
            content: 'Wichtigkeit verändert keine Kategorie, nur die Priorisierung innerhalb einer Kategorie. Wo dafür keine Zeit ist, liefert die Auswertung ohne dritte Frage trotzdem vollständige M/O/A/I/R/Q-Kategorien.',
          },
          {
            type: 'definition',
            term: 'Hohen Q-Anteil als Ergebnis akzeptieren',
            content: 'Ein Item mit vielen widersprüchlichen Antworten ist kein „Kano-Q-Merkmal“ im fachlichen Sinn, sondern ein Hinweis auf eine missverständliche Frage. Erst die Formulierung klären, dann die Kategorie ernst nehmen.',
          },
          {
            type: 'definition',
            term: 'Basismerkmale nach CS abwerten',
            content: 'Ein niedriger CS-Wert bei hohem DS bedeutet nicht „unwichtig“ — im Gegenteil, ein Fehlen dieser Anforderung kostet stark. Basismerkmale gehören trotzdem sichergestellt, auch wenn sie im Diagramm nicht durch hohes CS auffallen.',
          },
        ],
      },
      en: {
        title: 'Pitfalls',
        blocks: [
          {
            type: 'definition',
            term: 'Trying to cover everything with one level',
            content: 'A Kano instance always rates a single tree level. Anyone who needs to classify needs and drivers separately needs two instances — not a level switch hoping the old answers still apply.',
          },
          {
            type: 'definition',
            term: 'Ignoring the sync status',
            content: 'When the tree changes, the item list stays on the old state until "adopt from tree" is clicked. Skipping the status line means evaluating outdated or renamed items without noticing.',
          },
          {
            type: 'definition',
            term: 'Deleting orphaned items right away',
            content: 'A node that vanished from the tree is flagged, not deleted — its answers are kept. Before deleting it manually, check whether the node was only renamed or moved and the answers are still valid.',
          },
          {
            type: 'definition',
            term: 'Forcing the third question under time pressure',
            content: 'Importance does not change an item\'s category, only its ranking within a category. Where time is short, the evaluation still produces complete M/O/A/I/R/Q categories without it.',
          },
          {
            type: 'definition',
            term: 'Accepting a high Q share as a result',
            content: 'An item with many contradictory answers is not a genuine "Kano Q feature" — it signals a confusingly worded question. Clarify the wording first, then take the category seriously.',
          },
          {
            type: 'definition',
            term: 'Downgrading must-be features by their CS value',
            content: 'A low CS combined with a high DS does not mean "unimportant" — quite the opposite, missing this requirement is costly. Must-be features still need to be secured even though they never stand out with a high CS in the chart.',
          },
        ],
      },
    },
  },
};
