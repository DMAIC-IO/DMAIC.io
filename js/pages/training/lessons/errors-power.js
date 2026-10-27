/**
 * D.Mike — Lesson "α, β and power" (errors-power.js)
 *
 * Nine steps on filling machine A (μ₀ = 500 g, σ = 2 g): a check weighs n
 * packs and raises an alarm when x̄ lies outside the alarm limits, lesson 5's
 * rule p < α expressed in grams. The learner first simulates checks of an
 * unchanged machine and counts the false alarms, then of a machine drifted by
 * 1 g and counts the misses; only then the type I and type II error, β and
 * power are named. Drift, packs per check and α become selectable one at a
 * time, and the last experiment confirms the sample size the z formula plans
 * for a power of 90 %. Closes the course.
 * Browser-free: the static handbook imports this in Node.
 */

const DRIFTS = [0.5, 1, 1.5, 2];

export default {
  id: 'errors-power',
  de: {
    title: 'α, β und Power',
    summary: 'Welche Fehler ein Test machen kann und wie sich ihr Risiko steuern lässt.',
    steps: [
      {
        title: 'Die Ausgangsfrage',
        blocks: [
          { type: 'paragraph', content: 'In der letzten Lektion hat die Qualitätskontrolle 10 Packungen von Anlage A gewogen und mit einem Test entschieden, ob die Maschine noch auf 500 g steht. Diese Prüfung läuft nicht einmal, sondern in jeder Schicht – Hunderte Male im Jahr.' },
          { type: 'paragraph', content: 'Jedes Mal entscheidet der Test, und jedes Mal kann er danebenliegen. Auf zwei Arten: Er schlägt Alarm, obwohl sich nichts geändert hat. Oder er schweigt, obwohl sich die Maschine verschoben hat.' },
          { type: 'paragraph', content: 'Wie oft passiert das eine, wie oft das andere? Und was lässt sich dagegen tun? Das probieren wir in dieser Lektion aus.' },
        ],
      },
      {
        title: 'Wenn sich nichts geändert hat',
        blocks: [
          { type: 'paragraph', content: 'Zuerst übersetzen wir die Regel der letzten Lektion in Gramm. Der Test verwirft H₀, wenn p kleiner als 5 % ist. Das passiert genau dann, wenn x̄ mehr als 1,96 Standardfehler von 500 g entfernt liegt: 1,96 · 0,632 g ≈ 1,24 g. Daraus ergeben sich die Alarmgrenzen 498,76 g und 501,24 g. Liegt x̄ außerhalb, schlägt die Prüfung Alarm.' },
          { type: 'paragraph', content: 'Die Simulation spielt viele Prüfungen einer Maschine durch, die genau auf 500 g steht. Jede Prüfung wiegt 10 Packungen und liefert einen Mittelwert x̄. Die senkrechten Linien sind die Alarmgrenzen; die Mittelwerte außerhalb sind hervorgehoben.' },
          { type: 'paragraph', content: 'Führe erst ein paar einzelne Prüfungen durch, dann viele auf einmal. Beobachte in der Tabelle, wie oft die Prüfung Alarm schlägt.' },
          { type: 'simulation', widget: 'test-errors', params: { driftChoices: [0] } },
          { type: 'insight', id: 'false-alarms', revealAfterChecks: 1000, paragraphs: [
            'Etwa 5 von 100 Prüfungen schlagen Alarm – obwohl die Maschine in der Simulation genau 500 g einfüllt. Das ist kein Fehler der Simulation: Mit α = 5 % ist genau dieser Anteil eingeplant.',
            'Der Anteil der Fehlalarme ist also α. Wir haben ihn selbst gewählt, bevor wir die Daten angesehen haben.',
          ] },
          { type: 'definition', term: 'Fehler 1. Art', content: 'H₀ ist wahr – die Maschine steht auf 500 g –, und der Test verwirft H₀ trotzdem: ein Fehlalarm. Seine Wahrscheinlichkeit ist das Signifikanzniveau α, hier 5 %.', glossary: 'fehler-erster-art', afterInsight: 'false-alarms' },
        ],
      },
      {
        title: 'Wenn sich die Maschine verschoben hat',
        blocks: [
          { type: 'paragraph', content: 'Jetzt hat sich die Maschine verschoben: Sie füllt im Mittel 501 g ein. Die Prüfung weiß das nicht – sie testet weiter gegen 500 g, mit denselben Alarmgrenzen.' },
          { type: 'paragraph', content: 'Eine Verschiebung um 1 g ist echt. Eigentlich sollte die Prüfung jetzt jedes Mal Alarm schlagen. Führe wieder viele Prüfungen durch und beobachte die Tabelle.' },
          { type: 'simulation', widget: 'test-errors', params: { driftChoices: [1], showTheory: 'afterInsight' } },
          { type: 'insight', id: 'missed', revealAfterChecks: 1000, paragraphs: [
            'Nur etwa 35 von 100 Prüfungen schlagen Alarm. Etwa 65 übersehen die Verschiebung – obwohl sie echt ist.',
            'Die Mittelwerte streuen jetzt um 501 g statt um 500 g. Aber die meisten von ihnen landen trotzdem zwischen den Alarmgrenzen.',
          ] },
          { type: 'definition', term: 'Fehler 2. Art', content: 'H₀ ist falsch – die Maschine hat sich verschoben –, und der Test behält H₀ trotzdem bei: Die Verschiebung bleibt unentdeckt. Seine Wahrscheinlichkeit heißt β („beta“), hier etwa 65 %.', glossary: 'fehler-zweiter-art', afterInsight: 'missed' },
          { type: 'definition', term: 'Power (Teststärke)', formula: '\\text{Power} = 1 - \\beta', glossary: 'power', afterInsight: 'missed' },
          { type: 'paragraph', content: 'Die {{term:power|Power}} ist die Wahrscheinlichkeit, dass der Test eine echte Verschiebung erkennt – hier etwa 35 %. Anders als α wählt man sie nicht direkt: Sie hängt davon ab, wie groß die Verschiebung ist.', afterInsight: 'missed' },
          { type: 'paragraph', content: 'Zusammen ergeben sich vier mögliche Ausgänge einer Prüfung:', afterInsight: 'missed' },
          { type: 'table', headers: ['Maschine', 'H₀ beibehalten', 'H₀ verwerfen'], rows: [
            ['unverändert', 'richtig (1 − α)', 'Fehler 1. Art (α)'],
            ['verschoben', 'Fehler 2. Art (β)', 'richtig (Power 1 − β)'],
          ], afterInsight: 'missed' },
          { type: 'paragraph', content: 'Im Diagramm sind jetzt zwei Glockenkurven eingezeichnet: die Verteilung von x̄ bei einer Maschine auf 500 g und die bei 501 g. Die Fläche der ersten außerhalb der Alarmgrenzen ist α, die Fläche der zweiten zwischen den Grenzen ist β.', afterInsight: 'missed' },
        ],
      },
      {
        title: 'Größere Verschiebung',
        blocks: [
          { type: 'paragraph', content: 'Wie gut die Prüfung eine Verschiebung erkennt, hängt davon ab, wie groß sie ist. Neu: Du kannst die Verschiebung wählen. Die Tabelle zeigt jetzt zusätzlich die berechnete Power; die Simulation nähert sie an.' },
          { type: 'paragraph', content: 'Führe für mindestens drei Verschiebungen jeweils viele Prüfungen durch. Die Prüfungen jeder Einstellung bleiben beim Wechsel erhalten.' },
          { type: 'simulation', widget: 'test-errors', params: { driftChoices: DRIFTS, showTheory: true, showExact: true } },
          { type: 'insight', id: 'drift-size', revealAfterEachValue: { of: 'drift', k: 3, min: 100 }, paragraphs: [
            'Je größer die Verschiebung, desto öfter schlägt die Prüfung Alarm. Mit 10 Packungen erkennt sie 0,5 g nur in etwa 12 % der Prüfungen, 1 g in 35 %, 1,5 g in 66 % und 2 g in 89 %.',
            'Kleine Verschiebungen gehen also meistens durch. Ob das schlimm ist, hängt davon ab, wie viel Abweichung man sich leisten kann.',
          ] },
        ],
      },
      {
        title: 'Mehr Packungen',
        blocks: [
          { type: 'paragraph', content: 'Die Verschiebung kann man sich nicht aussuchen – die Zahl der Packungen pro Prüfung schon. Aus der Lektion „Stichprobenverteilung und Grenzwertsatz“ wissen wir: Der Standardfehler σ/√n wird kleiner, je mehr Werte in einen Mittelwert eingehen. Mit mehr Packungen werden beide Glockenkurven schmaler, die Alarmgrenzen rücken näher an 500 g heran, und die Kurven überlappen weniger.' },
          { type: 'paragraph', content: 'Neu: Du kannst auch die Zahl der Packungen pro Prüfung wählen. Probiere mindestens drei Werte aus, jeweils mit vielen Prüfungen.' },
          { type: 'simulation', widget: 'test-errors', params: { driftChoices: DRIFTS, nChoices: [10, 20, 40], showTheory: true, showExact: true } },
          { type: 'insight', id: 'more-packs', revealAfterEachValue: { of: 'n', k: 3, min: 100 }, paragraphs: [
            'Mehr Packungen bringen mehr Power. Mit 40 Packungen erkennt die Prüfung 1 g so oft wie mit 10 Packungen 2 g – in beiden Fällen in etwa 88,5 % der Prüfungen.',
            'Viermal so viele Packungen wirken also wie eine doppelt so große Verschiebung. Das liegt an der Wurzel im Standardfehler: √40 ist doppelt so groß wie √10.',
          ] },
        ],
      },
      {
        title: 'α gegen β',
        blocks: [
          { type: 'paragraph', content: 'Ein weiterer Hebel liegt nahe: α. Weniger Fehlalarme klingen gut – aber was kosten sie? Verschiebung und Packungen sind dafür wieder fest. Neu: Du kannst α wählen. Achte darauf, wie die Alarmgrenzen wandern.' },
          { type: 'paragraph', content: 'Probiere alle drei Werte aus, jeweils mit vielen Prüfungen.' },
          { type: 'simulation', widget: 'test-errors', params: { driftChoices: [1], alphaChoices: [0.01, 0.05, 0.1], showTheory: true, showExact: true } },
          { type: 'insight', id: 'alpha-beta', revealAfterEachValue: { of: 'alpha', k: 3, min: 100 }, paragraphs: [
            'Weniger Fehlalarme kosten Power. Bei 1 g Verschiebung und 10 Packungen erkennt die Prüfung die Verschiebung mit α = 1 % nur in etwa 16 % der Fälle, mit 5 % in 35 % und mit 10 % in 47 %.',
            'Ein kleineres α schiebt die Alarmgrenzen nach außen: Fehlalarme werden seltener, berechtigte Alarme aber auch. Wer beides will – wenige Fehlalarme und hohe Power –, dem helfen nur mehr Packungen.',
          ] },
        ],
      },
      {
        title: 'Wie viele Packungen brauche ich?',
        blocks: [
          { type: 'paragraph', content: 'Jetzt drehen wir die Frage um. Eine Verschiebung um 1 g soll in 90 % der Prüfungen auffallen, bei α = 5 %. Wie viele Packungen muss eine Prüfung dafür wiegen?' },
          { type: 'paragraph', content: 'Dafür gibt es eine Formel. δ („delta“) ist die Verschiebung, die die Prüfung erkennen soll, hier 1 g. z₁₋α/₂ = 1,960 kennen wir schon von den Alarmgrenzen. z₁₋β ist der entsprechende Wert für die gewünschte Power: Unterhalb von z₁₋β liegen 90 % der Standardnormalverteilung, also z₁₋β = 1,282.' },
          { type: 'definition', term: 'Packungen pro Prüfung für eine gewünschte Power', formula: 'n = \\left(\\frac{(z_{1-\\alpha/2} + z_{1-\\beta})\\,\\sigma}{\\delta}\\right)^2' },
          { type: 'paragraph', content: 'Für unsere Prüfung: (1,960 + 1,282)² · 2² / 1² ≈ 42,04. 42 Packungen wären knapp zu wenig, deshalb wird aufgerundet: 43 Packungen.' },
          { type: 'paragraph', content: 'Prüfe das in der Simulation nach: Die Prüfung wiegt jetzt 43 Packungen, die Maschine ist um 1 g verschoben. Führe viele Prüfungen durch.' },
          { type: 'simulation', widget: 'test-errors', params: { driftChoices: [1], nChoices: [43], showTheory: true, showExact: true } },
          { type: 'insight', id: 'plan-n', revealAfterChecks: 1000, paragraphs: [
            'Etwa 90 von 100 Prüfungen schlagen Alarm – so, wie geplant. Mit 43 statt 10 Packungen wird aus einer Prüfung, die 1 g meistens übersieht, eine, die die Verschiebung fast immer findet.',
          ] },
          { type: 'paragraph', content: 'Eine Einschränkung: Wir haben mit bekanntem σ gerechnet. In der Praxis ist σ meist unbekannt, und man rechnet wie in den letzten beiden Lektionen mit s und der t-Verteilung. Das Modul „Stichprobenumfang“ plant genau so, für den t-Test bei einer Stichprobe, und kommt für dieselbe Aufgabe auf 44 Packungen – eine mehr, der Preis dafür, dass σ geschätzt wird.' },
        ],
      },
      {
        title: 'Kurz geprüft',
        blocks: [
          { type: 'quiz', id: 'q-count', question: 'Anlage A wird mit α = 5 % 200-mal im Jahr geprüft; die Maschine verschiebt sich nie. Wie viele Alarme sind zu erwarten?', options: [
            { text: 'Keiner, weil sich nichts geändert hat.', correct: false, feedback: 'Auch eine unveränderte Maschine löst Fehlalarme aus: Mit α = 5 % schlägt im Mittel jede 20. Prüfung Alarm.' },
            { text: 'Etwa 5.', correct: false, feedback: '5 ist der Anteil in Prozent, nicht die Anzahl. 5 % von 200 Prüfungen sind 10.' },
            { text: 'Etwa 10.', correct: true, feedback: 'Genau: 5 % von 200 Prüfungen sind 10 Fehlalarme – obwohl sich nichts geändert hat.' },
          ] },
          { type: 'quiz', id: 'q-miss', question: 'Die Maschine füllt inzwischen 501 g ein. Die heutige Prüfung mit 10 Packungen schlägt keinen Alarm. Was ist passiert?', options: [
            { text: 'Ein Fehler 2. Art: Der Test hat eine echte Verschiebung übersehen.', correct: true, feedback: 'Genau: H₀ ist falsch, und der Test hat sie beibehalten. Bei 1 g und 10 Packungen passiert das in etwa 65 % der Prüfungen.' },
            { text: 'Ein Fehler 1. Art.', correct: false, feedback: 'Ein Fehler 1. Art ist ein Alarm ohne Grund. Hier gab es keinen Alarm, obwohl es einen Grund gab.' },
            { text: 'Die Prüfung beweist, dass die Maschine 500 g einfüllt.', correct: false, feedback: 'Kein Alarm beweist nichts. Die Maschine füllt 501 g ein – die Prüfung hat das nur nicht erkannt.' },
          ] },
          { type: 'quiz', id: 'q-power', question: 'Die Power für 1 g mit 10 Packungen beträgt etwa 35 %. Was bedeutet das?', options: [
            { text: 'Die Maschine hat sich mit 35 % Wahrscheinlichkeit verschoben.', correct: false, feedback: 'Die Power sagt nicht, ob sich die Maschine verschoben hat. Sie gibt an, wie oft der Test eine Verschiebung erkennt, falls es sie gibt.' },
            { text: 'Füllt die Maschine 501 g ein, schlagen etwa 35 von 100 Prüfungen Alarm.', correct: true, feedback: 'Genau: Die Power ist die Wahrscheinlichkeit, dass der Test eine echte Verschiebung erkennt – wie der Alarmanteil in der Simulation.' },
            { text: '35 % der Packungen sind zu schwer.', correct: false, feedback: 'Die Power bezieht sich auf Prüfungen, nicht auf einzelne Packungen.' },
          ] },
          { type: 'quiz', id: 'q-help', question: 'Du willst eine Verschiebung um 1 g öfter erkennen, ohne mehr Fehlalarme in Kauf zu nehmen. Was hilft?', options: [
            { text: 'α auf 10 % erhöhen.', correct: false, feedback: 'Das erhöht zwar die Power, aber auch die Fehlalarme: Bei einer unveränderten Maschine schlägt dann jede zehnte Prüfung Alarm.' },
            { text: 'α auf 1 % senken.', correct: false, feedback: 'Das senkt die Fehlalarme, kostet aber Power: Bei 1 g und 10 Packungen fällt sie von etwa 35 % auf 16 %.' },
            { text: 'Mehr Packungen pro Prüfung wiegen.', correct: true, feedback: 'Genau: Mehr Packungen machen die Glockenkurven schmaler. α bleibt bei 5 %, und die Power steigt – mit 43 Packungen auf etwa 90 %.' },
          ] },
        ],
      },
      {
        title: 'Was du mitnimmst',
        blocks: [
          { type: 'paragraph', content: 'Ein Test kann sich auf zwei Arten irren. Der Fehler 1. Art ist ein Alarm, obwohl sich nichts geändert hat; seine Wahrscheinlichkeit α legt man selbst fest. Der Fehler 2. Art ist eine übersehene Verschiebung; seine Wahrscheinlichkeit heißt β. Die Power 1 − β wächst mit der Größe der Verschiebung und mit der Zahl der Packungen, und sie sinkt, wenn man α kleiner wählt.' },
          { type: 'paragraph', content: 'Deshalb plant man den Stichprobenumfang vor der Prüfung: aus der Verschiebung, die man erkennen will, und der Power, die man dafür haben möchte.' },
          { type: 'paragraph', content: 'Damit endet der Kurs. Von der Streuung einzelner Werte über Stichprobe, Mittelwert und Standardfehler bis zu Konfidenzintervall und Hypothesentest hast du jede Idee selbst ausprobiert. Die Module „Hypothesentest“ und „Stichprobenumfang“ wenden sie auf echte Daten an.' },
        ],
      },
    ],
  },
  en: {
    title: 'α, β and power',
    summary: 'Which mistakes a test can make and how to control their risk.',
    steps: [
      {
        title: 'The starting question',
        blocks: [
          { type: 'paragraph', content: 'In the last lesson, quality control weighed 10 packs from machine A and used a test to decide whether the machine is still at 500 g. This check does not run once but every shift – hundreds of times a year.' },
          { type: 'paragraph', content: 'Every time the test decides, and every time it can be wrong. In two ways: it raises an alarm although nothing has changed. Or it stays silent although the machine has drifted.' },
          { type: 'paragraph', content: 'How often does the one happen, how often the other? And what can be done about it? That is what we try out in this lesson.' },
        ],
      },
      {
        title: 'When nothing has changed',
        blocks: [
          { type: 'paragraph', content: 'First we translate the rule of the last lesson into grams. The test rejects H₀ when p is smaller than 5 %. That happens exactly when x̄ lies more than 1.96 standard errors from 500 g: 1.96 · 0.632 g ≈ 1.24 g. This gives the alarm limits 498.76 g and 501.24 g. If x̄ lies outside, the check raises an alarm.' },
          { type: 'paragraph', content: 'The simulation plays through many checks of a machine set exactly to 500 g. Every check weighs 10 packs and yields one mean x̄. The vertical lines are the alarm limits; the means outside are highlighted.' },
          { type: 'paragraph', content: 'Run a few single checks first, then many at once. Watch in the table how often the check raises an alarm.' },
          { type: 'simulation', widget: 'test-errors', params: { driftChoices: [0] } },
          { type: 'insight', id: 'false-alarms', revealAfterChecks: 1000, paragraphs: [
            'About 5 in 100 checks raise an alarm – although the machine in the simulation fills exactly 500 g. This is not a flaw of the simulation: with α = 5 %, exactly this share is planned in.',
            'So the share of false alarms is α. We chose it ourselves, before looking at the data.',
          ] },
          { type: 'definition', term: 'Type I error', content: 'H₀ is true – the machine is at 500 g – and the test rejects H₀ anyway: a false alarm. Its probability is the significance level α, here 5 %.', glossary: 'fehler-erster-art', afterInsight: 'false-alarms' },
        ],
      },
      {
        title: 'When the machine has drifted',
        blocks: [
          { type: 'paragraph', content: 'Now the machine has drifted: it fills 501 g on average. The check does not know this – it still tests against 500 g, with the same alarm limits.' },
          { type: 'paragraph', content: 'A drift of 1 g is real. The check ought to raise an alarm every time now. Run many checks again and watch the table.' },
          { type: 'simulation', widget: 'test-errors', params: { driftChoices: [1], showTheory: 'afterInsight' } },
          { type: 'insight', id: 'missed', revealAfterChecks: 1000, paragraphs: [
            'Only about 35 in 100 checks raise an alarm. About 65 miss the drift – although it is real.',
            'The means now scatter around 501 g instead of 500 g. But most of them still land between the alarm limits.',
          ] },
          { type: 'definition', term: 'Type II error', content: 'H₀ is false – the machine has drifted – and the test keeps H₀ anyway: the drift goes undetected. Its probability is called β (“beta”), here about 65 %.', glossary: 'fehler-zweiter-art', afterInsight: 'missed' },
          { type: 'definition', term: 'Power', formula: '\\text{Power} = 1 - \\beta', glossary: 'power', afterInsight: 'missed' },
          { type: 'paragraph', content: '{{term:power|Power}} is the probability that the test detects a real drift – here about 35 %. Unlike α, it is not chosen directly: it depends on how large the drift is.', afterInsight: 'missed' },
          { type: 'paragraph', content: 'Together there are four possible outcomes of a check:', afterInsight: 'missed' },
          { type: 'table', headers: ['Machine', 'Keep H₀', 'Reject H₀'], rows: [
            ['unchanged', 'right (1 − α)', 'Type I error (α)'],
            ['drifted', 'Type II error (β)', 'right (power 1 − β)'],
          ], afterInsight: 'missed' },
          { type: 'paragraph', content: 'The chart now shows two bell curves: the distribution of x̄ for a machine at 500 g and the one at 501 g. The area of the first outside the alarm limits is α, the area of the second between the limits is β.', afterInsight: 'missed' },
        ],
      },
      {
        title: 'A larger drift',
        blocks: [
          { type: 'paragraph', content: 'How well the check detects a drift depends on how large it is. New: you can choose the drift. The table now also shows the computed power; the simulation approximates it.' },
          { type: 'paragraph', content: 'Run many checks for at least three drifts each. The checks of every setting stay when you switch.' },
          { type: 'simulation', widget: 'test-errors', params: { driftChoices: DRIFTS, showTheory: true, showExact: true } },
          { type: 'insight', id: 'drift-size', revealAfterEachValue: { of: 'drift', k: 3, min: 100 }, paragraphs: [
            'The larger the drift, the more often the check raises an alarm. With 10 packs it detects 0.5 g in only about 12 % of the checks, 1 g in 35 %, 1.5 g in 66 % and 2 g in 89 %.',
            'So small drifts mostly slip through. Whether that matters depends on how much deviation you can afford.',
          ] },
        ],
      },
      {
        title: 'More packs',
        blocks: [
          { type: 'paragraph', content: 'You cannot choose the drift – but you can choose the number of packs per check. The lesson “Sampling distribution and the central limit theorem” showed: the standard error σ/√n shrinks the more values go into a mean. With more packs both bell curves get narrower, the alarm limits move closer to 500 g, and the curves overlap less.' },
          { type: 'paragraph', content: 'New: you can also choose the number of packs per check. Try at least three values, each with many checks.' },
          { type: 'simulation', widget: 'test-errors', params: { driftChoices: DRIFTS, nChoices: [10, 20, 40], showTheory: true, showExact: true } },
          { type: 'insight', id: 'more-packs', revealAfterEachValue: { of: 'n', k: 3, min: 100 }, paragraphs: [
            'More packs bring more power. With 40 packs the check detects 1 g as often as with 10 packs 2 g – in both cases in about 88.5 % of the checks.',
            'So four times the packs act like twice the drift. That comes from the square root in the standard error: √40 is twice √10.',
          ] },
        ],
      },
      {
        title: 'α against β',
        blocks: [
          { type: 'paragraph', content: 'One more lever suggests itself: α. Fewer false alarms sound good – but what do they cost? Drift and packs are fixed again for this. New: you can choose α. Watch how the alarm limits move.' },
          { type: 'paragraph', content: 'Try all three values, each with many checks.' },
          { type: 'simulation', widget: 'test-errors', params: { driftChoices: [1], alphaChoices: [0.01, 0.05, 0.1], showTheory: true, showExact: true } },
          { type: 'insight', id: 'alpha-beta', revealAfterEachValue: { of: 'alpha', k: 3, min: 100 }, paragraphs: [
            'Fewer false alarms cost power. At a drift of 1 g and 10 packs the check detects the drift with α = 1 % in only about 16 % of the cases, with 5 % in 35 % and with 10 % in 47 %.',
            'A smaller α pushes the alarm limits outwards: false alarms become rarer, but so do justified ones. If you want both – few false alarms and high power – only more packs help.',
          ] },
        ],
      },
      {
        title: 'How many packs do I need?',
        blocks: [
          { type: 'paragraph', content: 'Now we turn the question around. A drift of 1 g should show up in 90 % of the checks, at α = 5 %. How many packs does a check need to weigh for that?' },
          { type: 'paragraph', content: 'There is a formula for this. δ (“delta”) is the drift the check should detect, here 1 g. z₁₋α/₂ = 1.960 we already know from the alarm limits. z₁₋β is the matching value for the desired power: 90 % of the standard normal distribution lies below z₁₋β, so z₁₋β = 1.282.' },
          { type: 'definition', term: 'Packs per check for a desired power', formula: 'n = \\left(\\frac{(z_{1-\\alpha/2} + z_{1-\\beta})\\,\\sigma}{\\delta}\\right)^2' },
          { type: 'paragraph', content: 'For our check: (1.960 + 1.282)² · 2² / 1² ≈ 42.04. 42 packs would be just too few, so we round up: 43 packs.' },
          { type: 'paragraph', content: 'Check this in the simulation: the check now weighs 43 packs, the machine has drifted by 1 g. Run many checks.' },
          { type: 'simulation', widget: 'test-errors', params: { driftChoices: [1], nChoices: [43], showTheory: true, showExact: true } },
          { type: 'insight', id: 'plan-n', revealAfterChecks: 1000, paragraphs: [
            'About 90 in 100 checks raise an alarm – as planned. With 43 instead of 10 packs, a check that mostly misses 1 g becomes one that almost always finds the drift.',
          ] },
          { type: 'paragraph', content: 'One caveat: we calculated with a known σ. In practice σ is usually unknown, and you work with s and the t distribution, as in the last two lessons. The module “Sample size” plans exactly that way, for the 1-sample t test, and arrives at 44 packs for the same task – one more, the price of estimating σ.' },
        ],
      },
      {
        title: 'Quick check',
        blocks: [
          { type: 'quiz', id: 'q-count', question: 'Machine A is checked 200 times a year at α = 5 %; the machine never drifts. How many alarms are to be expected?', options: [
            { text: 'None, because nothing has changed.', correct: false, feedback: 'An unchanged machine triggers false alarms too: with α = 5 %, on average every 20th check raises an alarm.' },
            { text: 'About 5.', correct: false, feedback: '5 is the share in percent, not the count. 5 % of 200 checks are 10.' },
            { text: 'About 10.', correct: true, feedback: 'Right: 5 % of 200 checks are 10 false alarms – although nothing has changed.' },
          ] },
          { type: 'quiz', id: 'q-miss', question: 'The machine now fills 501 g. Today’s check with 10 packs raises no alarm. What happened?', options: [
            { text: 'A Type II error: the test missed a real drift.', correct: true, feedback: 'Right: H₀ is false, and the test kept it. At 1 g and 10 packs this happens in about 65 % of the checks.' },
            { text: 'A Type I error.', correct: false, feedback: 'A Type I error is an alarm without a reason. Here there was no alarm although there was a reason.' },
            { text: 'The check proves that the machine fills 500 g.', correct: false, feedback: 'No alarm proves nothing. The machine fills 501 g – the check simply did not detect it.' },
          ] },
          { type: 'quiz', id: 'q-power', question: 'The power for 1 g with 10 packs is about 35 %. What does that mean?', options: [
            { text: 'The machine has drifted with 35 % probability.', correct: false, feedback: 'Power does not say whether the machine has drifted. It states how often the test detects a drift if there is one.' },
            { text: 'If the machine fills 501 g, about 35 in 100 checks raise an alarm.', correct: true, feedback: 'Right: power is the probability that the test detects a real drift – like the alarm share in the simulation.' },
            { text: '35 % of the packs are too heavy.', correct: false, feedback: 'Power refers to checks, not to single packs.' },
          ] },
          { type: 'quiz', id: 'q-help', question: 'You want to detect a drift of 1 g more often without accepting more false alarms. What helps?', options: [
            { text: 'Raise α to 10 %.', correct: false, feedback: 'That does raise the power, but also the false alarms: for an unchanged machine every tenth check then raises an alarm.' },
            { text: 'Lower α to 1 %.', correct: false, feedback: 'That lowers the false alarms but costs power: at 1 g and 10 packs it drops from about 35 % to 16 %.' },
            { text: 'Weigh more packs per check.', correct: true, feedback: 'Right: more packs make the bell curves narrower. α stays at 5 %, and the power rises – with 43 packs to about 90 %.' },
          ] },
        ],
      },
      {
        title: 'What you take away',
        blocks: [
          { type: 'paragraph', content: 'A test can be wrong in two ways. The Type I error is an alarm although nothing has changed; its probability α you fix yourself. The Type II error is a missed drift; its probability is called β. Power 1 − β grows with the size of the drift and with the number of packs, and it shrinks when you choose a smaller α.' },
          { type: 'paragraph', content: 'That is why the sample size is planned before the check: from the drift you want to detect and the power you want for it.' },
          { type: 'paragraph', content: 'This is where the course ends. From the variation of single values through sample, mean and standard error to confidence interval and hypothesis test, you tried out every idea yourself. The modules “Hypothesis test” and “Sample size” apply them to real data.' },
        ],
      },
    ],
  },
};
