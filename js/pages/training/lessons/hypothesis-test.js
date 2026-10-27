/**
 * D.Mike — Lesson "The idea of the hypothesis test" (hypothesis-test.js)
 *
 * Eight steps on filling machine A (μ₀ = 500 g, σ = 2 g, n = 10): a check
 * finds x̄ = 501.6 g. The learner first simulates a machine that has not
 * changed and sees how rarely a mean this far out appears; only then H₀, H₁,
 * the test statistic and the p-value are named. α enters as a threshold fixed
 * in advance, the observed mean becomes selectable, and the decision follows
 * the exact p. Then what p does not say, and the link to lesson 4's interval.
 * Error types and power are left to lesson 6.
 * Browser-free: the static handbook imports this in Node.
 */

export default {
  id: 'hypothesis-test',
  de: {
    title: 'Die Idee des Hypothesentests',
    summary: 'Wann ein Unterschied mehr ist als Zufall.',
    steps: [
      {
        title: 'Die Ausgangsfrage',
        blocks: [
          { type: 'paragraph', content: 'Die Qualitätskontrolle wiegt 10 Packungen von Anlage A. Der Mittelwert ist x̄ = 501,6 g, das Sollgewicht ist 500 g. Hat sich die Anlage verstellt – oder ist das Zufall?' },
          { type: 'paragraph', content: 'Aus der Lektion „Stichprobenverteilung und Grenzwertsatz“ wissen wir: x̄ wandert von Stichprobe zu Stichprobe, auch wenn sich an der Anlage nichts geändert hat. 1,6 g Abweichung können also durchaus Zufall sein. Die Frage ist nur, ob 1,6 g dafür ungewöhnlich viel sind.' },
          { type: 'paragraph', content: 'Das Konfidenzintervall der letzten Lektion sagt, wo μ plausibel liegt. Heute drehen wir die Frage um: Ist der Sollwert 500 g mit unserem x̄ noch vereinbar?' },
        ],
      },
      {
        title: 'Angenommen, nichts hat sich geändert',
        blocks: [
          { type: 'paragraph', content: 'Wir spielen den langweiligsten Fall durch: Die Anlage steht genau auf 500 g und streut wie immer mit σ = 2 g. Jede simulierte Stichprobe besteht aus 10 Packungen und liefert einen Mittelwert x̄. Das Diagramm sammelt diese Mittelwerte.' },
          { type: 'paragraph', content: 'Die durchgezogene Linie markiert unseren Wert 501,6 g, die gepunktete Linie den Spiegelwert 498,4 g auf der anderen Seite. Alle Mittelwerte, die mindestens so weit von 500 g entfernt liegen wie unserer, sind hervorgehoben – nach oben wie nach unten.' },
          { type: 'paragraph', content: 'Ziehe erst ein paar einzelne Stichproben, dann viele auf einmal. Beobachte in der Tabelle, wie oft ein Mittelwert so weit draußen landet wie unserer.' },
          { type: 'simulation', widget: 'null-distribution', params: { n: 10, observedChoices: [501.6] } },
          { type: 'insight', id: 'rare', revealAfterSamples: 1000, paragraphs: [
            'Mittelwerte, die so weit von 500 g entfernt liegen wie unsere 501,6 g, kommen nur in etwa einer von 100 Stichproben vor – obwohl sich in der Simulation an der Anlage nichts geändert hat.',
            'Für die Kontrolle heißt das: Entweder ist uns gerade ein seltener Zufall begegnet, oder die Annahme „Die Anlage steht noch auf 500 g“ stimmt nicht mehr. Wie man zwischen beiden entscheidet, zeigen die nächsten Schritte.',
          ] },
        ],
      },
      {
        title: 'Nullhypothese und p-Wert',
        blocks: [
          { type: 'paragraph', content: 'Jetzt bekommen die Dinge Namen. Die Annahme, die wir gerade simuliert haben, heißt {{term:nullhypothese|Nullhypothese}} H₀ („H null“): Es hat sich nichts geändert. Ihr Gegenstück ist die {{term:alternativhypothese|Alternativhypothese}} H₁: Die Anlage hat sich verstellt.' },
          { type: 'definition', term: 'Nullhypothese', formula: 'H_0\\colon \\mu = 500\\,\\text{g}', glossary: 'nullhypothese' },
          { type: 'definition', term: 'Alternativhypothese', formula: 'H_1\\colon \\mu \\neq 500\\,\\text{g}', glossary: 'alternativhypothese' },
          { type: 'paragraph', content: 'H₁ zählt beide Seiten: Eine Anlage, die zu viel einfüllt, ist ebenso verdächtig wie eine, die zu wenig einfüllt. Deshalb waren in der Simulation beide Ränder hervorgehoben.' },
          { type: 'paragraph', content: 'Wie weit draußen unser x̄ liegt, misst man in Standardfehlern (Lektion „Stichprobenverteilung und Grenzwertsatz“). μ₀ („mü null“) ist der Wert aus H₀, hier 500 g. Das Ergebnis heißt {{term:teststatistik|Teststatistik}} z.' },
          { type: 'definition', term: 'Teststatistik', formula: 'z = \\frac{\\bar{x} - \\mu_0}{\\sigma / \\sqrt{n}}', glossary: 'teststatistik' },
          { type: 'paragraph', content: 'Für unsere Kontrolle: Der Standardfehler ist 2 g / √10 ≈ 0,632 g, also z = 1,6 g / 0,632 g ≈ 2,53. Unser x̄ liegt gut zweieinhalb Standardfehler über 500 g.' },
          { type: 'paragraph', content: 'Bleibt die Frage aus der Simulation: Wie oft liegt x̄ unter H₀ so weit draußen? Diesen Anteil kann man auch ohne Simulation berechnen. Er heißt {{term:p-wert|p-Wert}}, kurz p.' },
          { type: 'definition', term: 'p-Wert', content: 'Die Wahrscheinlichkeit, unter der Annahme H₀ einen Mittelwert zu erhalten, der mindestens so weit von μ₀ entfernt liegt wie der beobachtete – auf beiden Seiten zusammen.', glossary: 'p-wert' },
          { type: 'paragraph', content: 'Für z ≈ 2,53 liest man ihn an der Glockenkurve ab: Jenseits von −2,53 und +2,53 liegen zusammen etwa 1,1 % der Fläche, also p ≈ 0,011. Diesen Wert hat der Anteil in der Simulation des vorigen Schritts angenähert.' },
          { type: 'simulation', widget: 'normal-tails', params: { z: 2.53 } },
        ],
      },
      {
        title: 'Die Entscheidung',
        blocks: [
          { type: 'paragraph', content: 'Wie selten ist selten genug? Diese Grenze legt man fest, bevor man die Daten ansieht: das {{term:signifikanzniveau|Signifikanzniveau}} α („alpha“), üblich sind 5 %. Damit legt man fest, wie viel Sicherheit man verlangt: Steht die Anlage wirklich noch auf 500 g, bleiben 95 % der Kontrollen ruhig, und nur jede zwanzigste schlägt grundlos Alarm. Es sind dieselben 95 % wie beim 95-%-Konfidenzintervall der letzten Lektion.' },
          { type: 'definition', term: 'Signifikanzniveau', content: 'Die Grenze α für den p-Wert, die vor der Auswertung festgelegt wird – hier α = 5 %. Liegt p darunter, verwirft man H₀.', glossary: 'signifikanzniveau' },
          { type: 'paragraph', content: 'Die Regel: Ist p kleiner als α, verwirft man H₀. Das Ergebnis heißt dann signifikant. Sonst behält man H₀ bei. Als Merksatz: „If p is low, H₀ must go“ – ist p klein, muss H₀ gehen. Die Simulation nähert p nur an; entschieden wird mit dem exakt berechneten p-Wert. Die Tabelle unter dem Diagramm unten zeigt ihn ab jetzt in der Zeile „p-Wert (exakt)“, direkt unter dem simulierten Anteil.' },
          { type: 'paragraph', content: 'Neu: Du kannst den beobachteten Mittelwert wählen. Ziehe viele Stichproben und probiere jeden der drei Werte aus. Die simulierten Mittelwerte bleiben beim Wechsel erhalten.' },
          { type: 'simulation', widget: 'null-distribution', params: { n: 10, observedChoices: [500.8, 501.2, 501.6], showP: true } },
          { type: 'insight', id: 'decision', revealAfterSamples: 1000, revealAfterChoices: 3, paragraphs: [
            'Bei 500,8 g ist p ≈ 0,21: So weit draußen landet etwa jede fünfte Stichprobe, H₀ wird beibehalten. Bei 501,2 g ist p ≈ 0,058 – knapp über 5 %, H₀ wird ebenfalls beibehalten. Erst bei 501,6 g ist p ≈ 0,011 kleiner als α, und H₀ wird verworfen.',
            'Die simulierte Verteilung hat sich dabei nie verändert. Geändert hat sich nur, wie weit draußen unser Wert liegt.',
          ] },
        ],
      },
      {
        title: 'Was der p-Wert nicht sagt',
        blocks: [
          { type: 'paragraph', content: 'Zwei Fehldeutungen liegen nahe – beide am Beispiel der Anlage A.' },
          { type: 'paragraph', content: 'Erstens: p = 0,011 heißt nicht „Die Anlage steht nur mit 1,1 % Wahrscheinlichkeit noch auf 500 g“. Der p-Wert wird unter der Annahme berechnet, dass H₀ gilt. Er sagt, wie selten solche Daten wären, falls H₀ stimmt – nicht, wie wahrscheinlich H₀ selbst ist.' },
          { type: 'paragraph', content: 'Zweitens: p = 0,21 heißt nicht, dass die Anlage auf 500 g steht. Eine Verstellung um 0,8 g lässt sich mit 10 Packungen schlicht nicht sicher erkennen. „H₀ beibehalten“ bedeutet: Die Daten sprechen nicht deutlich genug dagegen. Es bedeutet nicht: H₀ ist richtig.' },
          { type: 'paragraph', content: 'Ein Hypothesentest sammelt also nur Indizien gegen H₀ – einen Beweis liefert er nicht, weder für H₀ noch für H₁. Ein kleiner p-Wert ist ein deutliches Indiz gegen H₀. Ist p hoch, hat man (noch) kein Indiz gefunden – mehr Daten können es später liefern.' },
        ],
      },
      {
        title: 'Test und Konfidenzintervall',
        blocks: [
          { type: 'paragraph', content: 'Das 95-%-Konfidenzintervall der letzten Lektion führt zur selben Entscheidung. Für x̄ = 501,6 g reicht es von 500,4 g bis 502,8 g: 500 g liegt außerhalb, und p ist kleiner als 0,05. Für x̄ = 500,8 g reicht es von 499,6 g bis 502,0 g: 500 g liegt innerhalb, und p ist größer als 0,05.' },
          { type: 'table', headers: ['x̄', '95-%-Intervall', 'p', 'Entscheidung'], rows: [
            ['500,8 g', '499,6 bis 502,0 g', '0,21', 'beibehalten'],
            ['501,2 g', '499,96 bis 502,44 g', '0,058', 'beibehalten'],
            ['501,6 g', '500,4 bis 502,8 g', '0,011', 'verwerfen'],
          ] },
          { type: 'paragraph', content: 'Das ist kein Zufall: Ein zweiseitiger Test mit α = 5 % verwirft H₀ genau dann, wenn μ₀ außerhalb des 95-%-Intervalls liegt. Bei 501,2 g liegt die untere Grenze mit 499,96 g nur knapp unter 500 g – passend zu p knapp über 5 %.' },
          { type: 'paragraph', content: 'Noch ein Wort dazu, welchen Test wir gemacht haben. Die Teststatistik z aus Schritt 3 teilt durch σ/√n, also durch das bekannte σ = 2 g der Anlage. Ein Test, der so rechnet, heißt z-Test. Er setzt voraus, dass man σ kennt – etwa aus langer Erfahrung mit der Anlage.' },
          { type: 'paragraph', content: 'Im Betrieb kennt man σ meist nicht. Dann geht man vor wie in der letzten Lektion beim Konfidenzintervall: σ wird durch die Standardabweichung s der Stichprobe ersetzt, und p kommt aus der t-Verteilung statt aus der Glockenkurve. Das ist der t-Test für eine Stichprobe. Das Modul „Hypothesentest“ rechnet ihn, wenn du einen Mittelwert gegen einen Zielwert prüfst, und gibt genau diesen p-Wert aus. Die Idee bleibt dieselbe wie beim z-Test.' },
          { type: 'definition', term: 'Teststatistik beim t-Test', formula: 't = \\frac{\\bar{x} - \\mu_0}{s / \\sqrt{n}}' },
        ],
      },
      {
        title: 'Kurz geprüft',
        blocks: [
          { type: 'quiz', id: 'q-h0', question: 'Was besagt H₀ bei der Kontrolle von Anlage A?', options: [
            { text: 'Der Mittelwert der Stichprobe ist 500 g.', correct: false, feedback: 'Den Mittelwert der Stichprobe kennen wir schon – er ist 501,6 g. H₀ ist eine Aussage über die Anlage, also über μ.' },
            { text: 'Wir nehmen an, dass die Anlage im Mittel noch 500 g einfüllt (μ = 500 g), solange die Daten nicht deutlich dagegen sprechen.', correct: true, feedback: 'Genau: H₀ nimmt an, dass sich nichts geändert hat. Unter dieser Annahme wird p berechnet.' },
            { text: 'Die Anlage hat sich verstellt.', correct: false, feedback: 'Das ist die Alternativhypothese H₁. H₀ ist die Annahme, dass sich nichts geändert hat.' },
          ] },
          { type: 'quiz', id: 'q-p', question: 'Die Kontrolle ergibt p = 0,011. Was bedeutet das?', options: [
            { text: 'Die Anlage steht mit 1,1 % Wahrscheinlichkeit noch auf 500 g.', correct: false, feedback: 'Das ist die häufigste Fehldeutung. p wird unter der Annahme berechnet, dass H₀ gilt – es kann daher nicht angeben, wie wahrscheinlich H₀ ist.' },
            { text: '1,1 % der Packungen sind falsch befüllt.', correct: false, feedback: 'p sagt nichts über einzelne Packungen. Es bezieht sich auf den Mittelwert von Stichproben aus 10 Packungen.' },
            { text: 'Stünde die Anlage noch auf 500 g, käme ein so weit entferntes x̄ nur in etwa 1 % der Kontrollen vor.', correct: true, feedback: 'Genau: p beschreibt, wie selten solche Daten unter H₀ wären – so wie der Anteil in der Simulation.' },
          ] },
          { type: 'quiz', id: 'q-keep', question: 'Eine andere Kontrolle ergibt p = 0,21 bei α = 5 %. Was folgt daraus?', options: [
            { text: 'H₀ wird beibehalten: Wir haben kein Indiz gefunden, dass die Anlage von 500 g abweicht. Ausgeschlossen ist eine Verstellung damit nicht.', correct: true, feedback: 'Genau: Die Daten sprechen nicht deutlich genug gegen H₀. Eine kleine Verstellung kann trotzdem vorliegen.' },
            { text: 'Damit ist bewiesen, dass die Anlage auf 500 g steht.', correct: false, feedback: 'Beibehalten heißt nicht bewiesen. Eine Verstellung um 0,8 g etwa lässt sich mit 10 Packungen nicht sicher erkennen.' },
            { text: 'H₀ wird verworfen.', correct: false, feedback: 'Verworfen wird nur, wenn p kleiner als α ist. 0,21 liegt deutlich über 0,05.' },
          ] },
          { type: 'quiz', id: 'q-interval', question: 'Das 95-%-Konfidenzintervall ist 500,4 g bis 502,8 g. Wie entscheidet der Test mit α = 5 % für μ₀ = 500 g?', options: [
            { text: 'H₀ beibehalten, weil das Intervall schmal ist.', correct: false, feedback: 'Auf die Breite kommt es nicht an, sondern darauf, ob 500 g im Intervall liegt. Hier liegt 500 g außerhalb.' },
            { text: 'H₀ verwerfen, weil 500 g außerhalb des Intervalls liegt.', correct: true, feedback: 'Genau: Der zweiseitige Test mit 5 % verwirft H₀ genau dann, wenn μ₀ außerhalb des 95-%-Intervalls liegt.' },
            { text: 'Ohne p-Wert ist keine Aussage möglich.', correct: false, feedback: 'Das Intervall genügt: Liegt μ₀ außerhalb des 95-%-Intervalls, ist p kleiner als 0,05.' },
          ] },
        ],
      },
      {
        title: 'Was du mitnimmst',
        blocks: [
          { type: 'paragraph', content: 'Ein Hypothesentest nimmt an, dass sich nichts geändert hat (H₀). Der p-Wert sagt, wie selten so weit entfernte Daten unter dieser Annahme wären. Das Signifikanzniveau α wird vorher festgelegt; ist p kleiner als α, verwirft man H₀. Nicht verworfen heißt nicht bewiesen. Und ein zweiseitiger Test mit 5 % entscheidet wie die Frage, ob μ₀ im 95-%-Intervall liegt.' },
          { type: 'paragraph', content: 'Eine Frage bleibt offen: Mit α = 5 % schlägt der Test auch bei einer unveränderten Anlage in 5 % der Kontrollen an – und eine leicht verstellte Anlage übersieht er oft. Wie oft, und was man dagegen tun kann, zeigt die nächste Lektion.' },
        ],
      },
    ],
  },
  en: {
    title: 'The idea of a hypothesis test',
    summary: 'When a difference is more than chance.',
    steps: [
      {
        title: 'The starting question',
        blocks: [
          { type: 'paragraph', content: 'Quality control weighs 10 packs from machine A. The mean is x̄ = 501.6 g, the target weight is 500 g. Has the machine drifted – or is this chance?' },
          { type: 'paragraph', content: 'The lesson “Sampling distribution and the central limit theorem” showed: x̄ wanders from sample to sample, even when nothing about the machine has changed. A deviation of 1.6 g may well be chance. The only question is whether 1.6 g is unusually much for that.' },
          { type: 'paragraph', content: 'The confidence interval of the last lesson says where μ plausibly lies. Today we turn the question around: is the target 500 g still compatible with our x̄?' },
        ],
      },
      {
        title: 'Suppose nothing has changed',
        blocks: [
          { type: 'paragraph', content: 'We play through the most boring case: the machine is set exactly to 500 g and scatters as always with σ = 2 g. Every simulated sample consists of 10 packs and yields one mean x̄. The chart collects these means.' },
          { type: 'paragraph', content: 'The solid line marks our value 501.6 g, the dotted line the mirror value 498.4 g on the other side. All means at least as far from 500 g as ours are highlighted – above as well as below.' },
          { type: 'paragraph', content: 'Draw a few single samples first, then many at once. Watch in the table how often a mean lands as far out as ours.' },
          { type: 'simulation', widget: 'null-distribution', params: { n: 10, observedChoices: [501.6] } },
          { type: 'insight', id: 'rare', revealAfterSamples: 1000, paragraphs: [
            'Means as far from 500 g as our 501.6 g appear in only about one in 100 samples – although nothing about the machine changed in the simulation.',
            'For the check this means: either we just met a rare coincidence, or the assumption “the machine is still at 500 g” no longer holds. How to decide between the two, the next steps show.',
          ] },
        ],
      },
      {
        title: 'Null hypothesis and p-value',
        blocks: [
          { type: 'paragraph', content: 'Now things get names. The assumption we just simulated is called the {{term:nullhypothese|null hypothesis}} H₀ (“H nought”): nothing has changed. Its counterpart is the {{term:alternativhypothese|alternative hypothesis}} H₁: the machine has drifted.' },
          { type: 'definition', term: 'Null hypothesis', formula: 'H_0\\colon \\mu = 500\\,\\text{g}', glossary: 'nullhypothese' },
          { type: 'definition', term: 'Alternative hypothesis', formula: 'H_1\\colon \\mu \\neq 500\\,\\text{g}', glossary: 'alternativhypothese' },
          { type: 'paragraph', content: 'H₁ counts both sides: a machine that fills too much is just as suspicious as one that fills too little. That is why both edges were highlighted in the simulation.' },
          { type: 'paragraph', content: 'How far out our x̄ lies is measured in standard errors (lesson “Sampling distribution and the central limit theorem”). μ₀ (“mu nought”) is the value from H₀, here 500 g. The result is called the {{term:teststatistik|test statistic}} z.' },
          { type: 'definition', term: 'Test statistic', formula: 'z = \\frac{\\bar{x} - \\mu_0}{\\sigma / \\sqrt{n}}', glossary: 'teststatistik' },
          { type: 'paragraph', content: 'For our check: the standard error is 2 g / √10 ≈ 0.632 g, so z = 1.6 g / 0.632 g ≈ 2.53. Our x̄ lies a good two and a half standard errors above 500 g.' },
          { type: 'paragraph', content: 'That leaves the question from the simulation: how often does x̄ land this far out under H₀? This share can also be computed without a simulation. It is called the {{term:p-wert|p-value}}, p for short.' },
          { type: 'definition', term: 'p-value', content: 'The probability, assuming H₀, of getting a mean at least as far from μ₀ as the observed one – both sides together.', glossary: 'p-wert' },
          { type: 'paragraph', content: 'For z ≈ 2.53 it can be read off the bell curve: beyond −2.53 and +2.53 lie about 1.1 % of the area together, so p ≈ 0.011. This is the value the share in the previous step’s simulation approximated.' },
          { type: 'simulation', widget: 'normal-tails', params: { z: 2.53 } },
        ],
      },
      {
        title: 'The decision',
        blocks: [
          { type: 'paragraph', content: 'How rare is rare enough? This threshold is fixed before looking at the data: the {{term:signifikanzniveau|significance level}} α (“alpha”), usually 5 %. This sets how much certainty you demand: if the machine really is still at 500 g, 95 % of the checks stay quiet, and only one in twenty raises a false alarm. These are the same 95 % as in the 95 % confidence interval of the last lesson.' },
          { type: 'definition', term: 'Significance level', content: 'The threshold α for the p-value, fixed before the analysis – here α = 5 %. If p falls below it, H₀ is rejected.', glossary: 'signifikanzniveau' },
          { type: 'paragraph', content: 'The rule: if p is smaller than α, H₀ is rejected. The result is then called significant. Otherwise H₀ is kept. As a mnemonic: “If p is low, H₀ must go.” The simulation only approximates p; the decision uses the exactly computed p-value. From now on the table under the chart below shows it in the row “p-value (exact)”, right under the simulated share.' },
          { type: 'paragraph', content: 'New: you can choose the observed mean. Draw many samples and try each of the three values. The simulated means stay when you switch.' },
          { type: 'simulation', widget: 'null-distribution', params: { n: 10, observedChoices: [500.8, 501.2, 501.6], showP: true } },
          { type: 'insight', id: 'decision', revealAfterSamples: 1000, revealAfterChoices: 3, paragraphs: [
            'At 500.8 g, p ≈ 0.21: about every fifth sample lands this far out, H₀ is kept. At 501.2 g, p ≈ 0.058 – just above 5 %, H₀ is kept as well. Only at 501.6 g is p ≈ 0.011 smaller than α, and H₀ is rejected.',
            'The simulated distribution never changed. Only how far out our value lies did.',
          ] },
        ],
      },
      {
        title: 'What the p-value does not say',
        blocks: [
          { type: 'paragraph', content: 'Two misreadings are tempting – both on the example of machine A.' },
          { type: 'paragraph', content: 'First: p = 0.011 does not mean “the machine is still at 500 g with only 1.1 % probability”. The p-value is computed assuming that H₀ holds. It says how rare such data would be if H₀ were true – not how likely H₀ itself is.' },
          { type: 'paragraph', content: 'Second: p = 0.21 does not mean that the machine is at 500 g. A drift of 0.8 g simply cannot be detected reliably with 10 packs. “Keep H₀” means: the data do not speak clearly enough against it. It does not mean: H₀ is right.' },
          { type: 'paragraph', content: 'So a hypothesis test only collects evidence against H₀ – it delivers no proof, neither for H₀ nor for H₁. A small p-value is clear evidence against H₀. If p is high, you have found no evidence (yet) – more data may provide it later.' },
        ],
      },
      {
        title: 'Test and confidence interval',
        blocks: [
          { type: 'paragraph', content: 'The 95 % confidence interval of the last lesson leads to the same decision. For x̄ = 501.6 g it runs from 500.4 g to 502.8 g: 500 g lies outside, and p is smaller than 0.05. For x̄ = 500.8 g it runs from 499.6 g to 502.0 g: 500 g lies inside, and p is larger than 0.05.' },
          { type: 'table', headers: ['x̄', '95 % interval', 'p', 'Decision'], rows: [
            ['500.8 g', '499.6 to 502.0 g', '0.21', 'keep'],
            ['501.2 g', '499.96 to 502.44 g', '0.058', 'keep'],
            ['501.6 g', '500.4 to 502.8 g', '0.011', 'reject'],
          ] },
          { type: 'paragraph', content: 'This is no coincidence: a two-sided test with α = 5 % rejects H₀ exactly when μ₀ lies outside the 95 % interval. At 501.2 g the lower limit of 499.96 g lies just below 500 g – matching p just above 5 %.' },
          { type: 'paragraph', content: 'One more word on which test we ran. The test statistic z from step 3 divides by σ/√n, that is, by the known σ = 2 g of the machine. A test that calculates this way is called a z test. It requires that σ is known – for example from long experience with the machine.' },
          { type: 'paragraph', content: 'In practice, σ is usually unknown. Then you proceed as with the confidence interval in the last lesson: σ is replaced by the sample’s standard deviation s, and p comes from the t distribution instead of the bell curve. This is the 1-sample t test. The module “Hypothesis Test” runs it when you check a mean against a target and reports exactly this p-value. The idea stays the same as in the z test.' },
          { type: 'definition', term: 'Test statistic of the t test', formula: 't = \\frac{\\bar{x} - \\mu_0}{s / \\sqrt{n}}' },
        ],
      },
      {
        title: 'Quick check',
        blocks: [
          { type: 'quiz', id: 'q-h0', question: 'What does H₀ say in the check of machine A?', options: [
            { text: 'The sample mean is 500 g.', correct: false, feedback: 'We already know the sample mean – it is 501.6 g. H₀ is a statement about the machine, that is about μ.' },
            { text: 'We assume the machine still fills 500 g on average (μ = 500 g) as long as the data do not clearly speak against it.', correct: true, feedback: 'Right: H₀ assumes that nothing has changed. p is computed under this assumption.' },
            { text: 'The machine has drifted.', correct: false, feedback: 'That is the alternative hypothesis H₁. H₀ is the assumption that nothing has changed.' },
          ] },
          { type: 'quiz', id: 'q-p', question: 'The check gives p = 0.011. What does that mean?', options: [
            { text: 'The machine is still at 500 g with 1.1 % probability.', correct: false, feedback: 'This is the most common misreading. p is computed assuming that H₀ holds – so it cannot state how likely H₀ is.' },
            { text: '1.1 % of the packs are filled wrongly.', correct: false, feedback: 'p says nothing about single packs. It refers to the mean of samples of 10 packs.' },
            { text: 'If the machine were still at 500 g, an x̄ this far out would appear in only about 1 % of the checks.', correct: true, feedback: 'Right: p describes how rare such data would be under H₀ – just like the share in the simulation.' },
          ] },
          { type: 'quiz', id: 'q-keep', question: 'Another check gives p = 0.21 at α = 5 %. What follows?', options: [
            { text: 'H₀ is kept: we found no evidence that the machine deviates from 500 g. A drift is not ruled out by this.', correct: true, feedback: 'Right: the data do not speak clearly enough against H₀. A small drift may still be there.' },
            { text: 'This proves that the machine is at 500 g.', correct: false, feedback: 'Kept does not mean proven. A drift of 0.8 g, for example, cannot be detected reliably with 10 packs.' },
            { text: 'H₀ is rejected.', correct: false, feedback: 'H₀ is rejected only when p is smaller than α. 0.21 is well above 0.05.' },
          ] },
          { type: 'quiz', id: 'q-interval', question: 'The 95 % confidence interval is 500.4 g to 502.8 g. What does the test with α = 5 % decide for μ₀ = 500 g?', options: [
            { text: 'Keep H₀, because the interval is narrow.', correct: false, feedback: 'The width does not matter, only whether 500 g lies inside the interval. Here 500 g lies outside.' },
            { text: 'Reject H₀, because 500 g lies outside the interval.', correct: true, feedback: 'Right: the two-sided test at 5 % rejects H₀ exactly when μ₀ lies outside the 95 % interval.' },
            { text: 'No statement is possible without a p-value.', correct: false, feedback: 'The interval is enough: if μ₀ lies outside the 95 % interval, p is smaller than 0.05.' },
          ] },
        ],
      },
      {
        title: 'What you take away',
        blocks: [
          { type: 'paragraph', content: 'A hypothesis test assumes that nothing has changed (H₀). The p-value says how rare data this far out would be under that assumption. The significance level α is fixed beforehand; if p is smaller than α, H₀ is rejected. Not rejected does not mean proven. And a two-sided test at 5 % decides like the question whether μ₀ lies in the 95 % interval.' },
          { type: 'paragraph', content: 'One question remains: with α = 5 %, the test also raises an alarm for an unchanged machine in 5 % of the checks – and it often misses a slightly drifted one. How often, and what to do about it, the next lesson shows.' },
        ],
      },
    ],
  },
};
