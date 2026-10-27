/**
 * D.Mike — Lesson "Confidence interval" (confidence-interval.js)
 *
 * Seven steps on filling machine A (μ = 500 g, σ = 2 g). The standard error
 * from lesson 3 becomes a range x̄ ± 1.96·σ/√n; many samples show that about
 * 95 % of these intervals contain μ — the level belongs to the procedure, not
 * to one interval. Each step adds one freedom: everything locked -> n and
 * level free -> σ replaced by s, with the 1.96 and the t interval side by
 * side. No significance or p-value (lessons 5 and 6).
 * Browser-free: the static handbook imports this in Node.
 */

export default {
  id: 'confidence-interval',
  de: {
    title: 'Konfidenzintervall',
    summary: 'Wie genau ein Mittelwert aus einer Stichprobe ist.',
    steps: [
      {
        title: 'Die Ausgangsfrage',
        blocks: [
          { type: 'paragraph', content: 'Wir haben n = 10 Packungen von Anlage A gewogen und den Mittelwert x̄ = 500,6 g erhalten. Aus der Lektion „Stichprobe und Grundgesamtheit“ wissen wir: x̄ ist nur ein Schätzwert für den wahren Mittelwert μ. Und die letzte Lektion hat gezeigt, dass x̄ von Stichprobe zu Stichprobe wandert.' },
          { type: 'paragraph', content: 'Wie weit darf x̄ von μ entfernt sein? Eine einzelne Zahl sagt das nicht. Ein Bereich um x̄ kann es – wenn man weiß, wie man ihn baut und wie man ihn liest.' },
        ],
      },
      {
        title: 'Vom Standardfehler zum Bereich',
        blocks: [
          { type: 'paragraph', content: 'Aus der letzten Lektion: Die Mittelwerte vieler Stichproben streuen glockenförmig um μ, mit dem {{term:standardfehler|Standardfehler}} SE = σ/√n. Für eine Glockenkurve gilt: Etwa 95 % aller x̄ liegen höchstens 1,96 · SE von μ entfernt.' },
          { type: 'paragraph', content: 'Diesen Satz kann man umdrehen: Liegt x̄ höchstens 1,96 · SE von μ entfernt, dann liegt auch μ höchstens 1,96 · SE von x̄ entfernt. Legt man also um x̄ einen Bereich von 1,96 Standardfehlern nach beiden Seiten, erhält man ein Konfidenzintervall.' },
          { type: 'definition', term: 'Konfidenzintervall', formula: '\\bar{x} \\pm 1{,}96 \\cdot \\frac{\\sigma}{\\sqrt{n}}', glossary: 'konfidenzintervall' },
          { type: 'paragraph', content: 'Für unsere Stichprobe: σ = 2 g und n = 10 ergeben SE = 2 g / √10 ≈ 0,63 g. Die halbe Breite ist 1,96 · 0,63 g ≈ 1,24 g. Das Intervall reicht also von 500,6 g − 1,24 g bis 500,6 g + 1,24 g, gerundet von 499,4 g bis 501,8 g.' },
          { type: 'paragraph', content: 'Ob μ wirklich darin liegt, verrät die eine Stichprobe nicht. Im nächsten Schritt ziehst du viele Stichproben und zählst nach.' },
        ],
      },
      {
        title: 'Experiment: Wie oft trifft das Intervall?',
        blocks: [
          { type: 'paragraph', content: 'Jede Stichprobe besteht aus 10 Packungen von Anlage A und liefert ihr eigenes x̄ und damit ihr eigenes Intervall. Das Diagramm zeigt jedes Intervall als waagerechte Linie, die neueste oben. Die senkrechte Linie ist μ = 500 g – in der Übung kennen wir μ, im Betrieb nicht. Intervalle, die μ verfehlen, sind hervorgehoben.' },
          { type: 'paragraph', content: 'Ziehe erst ein paar einzelne Stichproben und schau dir die Intervalle an. Ziehe dann viele auf einmal und beobachte in der Tabelle, wie oft das Intervall μ enthält.' },
          { type: 'simulation', widget: 'interval-coverage', params: { nChoices: [10], levelChoices: [0.95] } },
          { type: 'insight', id: 'hit-rate', revealAfterSamples: 1000, paragraphs: [
            'Etwa 95 von 100 Intervallen enthalten μ. Die übrigen verfehlen es – und keinem einzelnen Intervall sieht man an, ob es zu ihnen gehört.',
            'Die 95 % sind also eine Eigenschaft des Verfahrens: Baut man sehr oft so ein Intervall, trifft es in etwa 95 % der Fälle. Ein einzelnes, schon berechnetes Intervall enthält μ oder nicht. Im Betrieb kennen wir μ nicht und erfahren nie, welcher Fall vorliegt.',
          ] },
        ],
      },
      {
        title: 'Wovon hängt die Breite ab?',
        blocks: [
          { type: 'paragraph', content: 'Die 95 % heißen {{term:konfidenzniveau|Konfidenzniveau}}. Du kannst es jetzt ebenso wählen wie den Stichprobenumfang n.' },
          { type: 'definition', term: 'Konfidenzniveau', content: 'Der Anteil der Intervalle, die über viele Wiederholungen des Verfahrens μ enthalten – zum Beispiel 95 %.', glossary: 'konfidenzniveau' },
          { type: 'paragraph', content: 'Das Niveau legt den Faktor z vor dem Standardfehler fest. Die halbe Breite des Intervalls ist z · σ/√n.' },
          { type: 'table', headers: ['Konfidenzniveau', 'Faktor z'], rows: [
            ['90 %', '1,645'],
            ['95 %', '1,96'],
            ['99 %', '2,576'],
          ] },
          { type: 'paragraph', content: 'Probiere mindestens zwei Stichprobenumfänge und zwei Niveaus aus und ziehe für jede Einstellung viele Stichproben. Die Tabelle zählt jede Einstellung für sich: Wechselst du zurück, geht die Zählung dort weiter.' },
          { type: 'simulation', widget: 'interval-coverage', params: { nChoices: [5, 10, 40], levelChoices: [0.9, 0.95, 0.99] } },
          { type: 'insight', id: 'width', revealAfterSettings: 2, paragraphs: [
            'Größeres n macht das Intervall schmaler: Viermal so viele Packungen halbieren die Breite, denn n steht unter der Wurzel. Bei 95 % sind es mit n = 10 etwa ± 1,24 g, mit n = 40 etwa ± 0,62 g.',
            'Mehr Sicherheit kostet Breite: 99 % ergibt breitere Intervalle als 95 %, 90 % schmalere.',
            'Die Trefferquote folgt dem Niveau, nicht n: Bei jedem Stichprobenumfang treffen die 95-%-Intervalle etwa 95 % der Fälle. Ein größeres n macht das Intervall genauer, nicht häufiger richtig.',
          ] },
        ],
      },
      {
        title: 'Und wenn σ unbekannt ist?',
        blocks: [
          { type: 'paragraph', content: 'Bisher haben wir mit σ = 2 g gerechnet. Im Betrieb ist σ aber unbekannt, wie μ auch. Dann bleibt nur die Standardabweichung s der Stichprobe als Schätzwert.' },
          { type: 'paragraph', content: 'Jede Stichprobe besteht jetzt aus nur 5 Packungen und liefert zwei Intervalle aus denselben Werten, als Paar übereinander: eines mit s und dem Faktor 1,96, eines mit s und einem größeren Faktor t aus der {{term:t-verteilung|t-Verteilung}}. Welcher Faktor t gilt, hängt von den {{term:freiheitsgrade|Freiheitsgraden}} ab, hier n − 1 = 4.' },
          { type: 'definition', term: 't-Intervall', formula: '\\bar{x} \\pm t \\cdot \\frac{s}{\\sqrt{n}}', glossary: 't-verteilung' },
          { type: 'paragraph', content: 'Ziehe viele Stichproben und vergleiche die beiden Zeilen der Tabelle. Achte im Diagramm auf Paare, bei denen nur eines der beiden Intervalle μ verfehlt.' },
          { type: 'simulation', widget: 'interval-coverage', params: { nChoices: [5], levelChoices: [0.95], sigma: 'unknown', compare: true } },
          { type: 'insight', id: 't-factor', revealAfterSamples: 1000, paragraphs: [
            'Mit dem Faktor 1,96 treffen deutlich weniger als 95 % der Intervalle, theoretisch nur etwa 88 %. Der Grund: s schwankt selbst von Stichprobe zu Stichprobe und ist oft zu klein. Dann wird das Intervall zu kurz und verfehlt μ.',
            'Der t-Faktor gleicht das aus. Bei n = 5 ist er 2,776 statt 1,96, das Intervall wird breiter, und es treffen wieder etwa 95 %. Je größer n, desto verlässlicher wird s und desto näher rückt t an 1,96 – bei n = 10 ist t schon 2,262.',
          ] },
          { type: 'paragraph', content: 'Genau dieses t-Intervall gibt das Modul „Hypothesentest“ beim t-Test für eine Stichprobe als Konfidenzintervall aus.' },
        ],
      },
      {
        title: 'Kurz geprüft',
        blocks: [
          { type: 'quiz', id: 'q-meaning', question: 'Eine Stichprobe von Anlage A ergibt das 95-%-Konfidenzintervall 499,4 g bis 501,8 g. Was bedeuten die 95 %?', options: [
            { text: 'μ liegt mit 95 % Wahrscheinlichkeit in diesem Intervall.', correct: false, feedback: 'Das ist die häufigste Fehldeutung. μ ist fest: Dieses eine Intervall enthält μ oder nicht. Die 95 % beschreiben, wie oft das Verfahren über viele Stichproben trifft.' },
            { text: '95 % aller Packungen wiegen zwischen 499,4 und 501,8 g.', correct: false, feedback: 'Das Intervall gilt für den Mittelwert μ, nicht für einzelne Packungen. Einzelne Packungen streuen mit σ = 2 g viel weiter: Etwa 95 % liegen zwischen 496 und 504 g.' },
            { text: 'Von vielen so berechneten Intervallen enthalten etwa 95 % μ.', correct: true, feedback: 'Genau: Die 95 % gehören zum Verfahren. Ob gerade dieses Intervall zu den Treffern gehört, sieht man ihm nicht an.' },
          ] },
          { type: 'quiz', id: 'q-n', question: 'Statt 10 wiegst du jetzt 40 Packungen pro Stichprobe, weiter mit 95 %. Was passiert mit dem Intervall?', options: [
            { text: 'Es wird etwa ein Viertel so breit.', correct: false, feedback: 'Nicht ganz – n steht unter der Wurzel. Viermal so viele Packungen machen das Intervall nur halb so breit.' },
            { text: 'Es wird etwa halb so breit.', correct: true, feedback: 'Genau: √40 / √10 = 2. Bei σ = 2 g schrumpft die halbe Breite von etwa 1,24 g auf etwa 0,62 g.' },
            { text: 'Es bleibt gleich breit, trifft aber öfter.', correct: false, feedback: 'Umgekehrt: Die Trefferquote folgt dem Niveau und bleibt bei etwa 95 %. Schmaler wird das Intervall – das größere n macht es genauer.' },
          ] },
          { type: 'quiz', id: 'q-level', question: 'Du bleibst bei 10 Packungen, wechselst aber von 95 % auf 99 %. Wie verändert sich das Intervall?', options: [
            { text: 'Es wird breiter.', correct: true, feedback: 'Genau: Der Faktor steigt von 1,96 auf 2,576. Mehr Sicherheit kostet Breite.' },
            { text: 'Es wird schmaler.', correct: false, feedback: 'Umgekehrt: Damit mehr Intervalle μ enthalten, müssen sie weiter reichen. Der Faktor steigt von 1,96 auf 2,576.' },
            { text: 'Es bleibt gleich breit, trifft aber öfter.', correct: false, feedback: 'Mehr Treffer gibt es nur mit breiteren Intervallen: Der Faktor steigt von 1,96 auf 2,576.' },
          ] },
          { type: 'quiz', id: 'q-t', question: 'σ ist unbekannt, du wiegst 5 Packungen. Warum rechnest du mit dem t-Faktor statt mit 1,96?', options: [
            { text: 't macht das Intervall schmaler und damit genauer.', correct: false, feedback: 'Umgekehrt: Bei n = 5 ist t = 2,776, das Intervall wird breiter. Genau deshalb trifft es wieder in etwa 95 % der Fälle.' },
            { text: '1,96 gilt erst ab 100 Werten.', correct: false, feedback: 'Eine feste Grenze gibt es nicht: Der t-Faktor nähert sich mit wachsendem n allmählich 1,96 – bei n = 10 ist er 2,262, bei n = 30 noch 2,045.' },
            { text: 's schwankt und ist oft zu klein; mit 1,96 träfe das Intervall deutlich seltener als in 95 % der Fälle.', correct: true, feedback: 'Genau: Mit 1,96 treffen bei n = 5 nur etwa 88 %. Der größere t-Faktor gleicht die Unsicherheit von s aus.' },
          ] },
        ],
      },
      {
        title: 'Was du mitnimmst',
        blocks: [
          { type: 'paragraph', content: 'Ein Konfidenzintervall ist x̄ ± Faktor · Standardfehler. Das Konfidenzniveau ist die Trefferquote des Verfahrens über viele Stichproben – ein einzelnes Intervall enthält μ oder nicht. Die Breite schrumpft mit √n und wächst mit dem Niveau. Ist σ unbekannt, rechnet man mit s und dem t-Faktor.' },
          { type: 'paragraph', content: 'Ein Konfidenzintervall sagt, wo μ plausibel liegt. Die nächste Lektion dreht die Frage um: Passt ein bestimmter Wert, zum Beispiel das Sollgewicht 500 g, noch zu den Daten?' },
        ],
      },
    ],
  },
  en: {
    title: 'Confidence interval',
    summary: 'How precise a mean from a sample is.',
    steps: [
      {
        title: 'The starting question',
        blocks: [
          { type: 'paragraph', content: 'We weighed n = 10 packs from machine A and got the mean x̄ = 500.6 g. The lesson “Sample and population” showed: x̄ is only an estimate of the true mean μ. And the last lesson showed that x̄ wanders from sample to sample.' },
          { type: 'paragraph', content: 'How far from μ may x̄ be? A single number does not say. A range around x̄ can – if you know how to build it and how to read it.' },
        ],
      },
      {
        title: 'From the standard error to a range',
        blocks: [
          { type: 'paragraph', content: 'From the last lesson: the means of many samples scatter in a bell shape around μ, with the {{term:standardfehler|standard error}} SE = σ/√n. For a bell curve, about 95 % of all x̄ lie at most 1.96 · SE away from μ.' },
          { type: 'paragraph', content: 'This statement can be turned around: if x̄ lies at most 1.96 · SE away from μ, then μ also lies at most 1.96 · SE away from x̄. So a range of 1.96 standard errors on both sides of x̄ gives a confidence interval.' },
          { type: 'definition', term: 'Confidence interval', formula: '\\bar{x} \\pm 1.96 \\cdot \\frac{\\sigma}{\\sqrt{n}}', glossary: 'konfidenzintervall' },
          { type: 'paragraph', content: 'For our sample: σ = 2 g and n = 10 give SE = 2 g / √10 ≈ 0.63 g. The half-width is 1.96 · 0.63 g ≈ 1.24 g. The interval therefore runs from 500.6 g − 1.24 g to 500.6 g + 1.24 g, rounded from 499.4 g to 501.8 g.' },
          { type: 'paragraph', content: 'Whether μ really lies inside, the one sample does not tell. In the next step you draw many samples and count.' },
        ],
      },
      {
        title: 'Experiment: how often does the interval hit?',
        blocks: [
          { type: 'paragraph', content: 'Each sample consists of 10 packs from machine A and yields its own x̄ and thus its own interval. The chart shows each interval as a horizontal line, the newest on top. The vertical line is μ = 500 g – in the exercise we know μ, in production we do not. Intervals that miss μ are highlighted.' },
          { type: 'paragraph', content: 'First draw a few single samples and look at the intervals. Then draw many at once and watch in the table how often the interval contains μ.' },
          { type: 'simulation', widget: 'interval-coverage', params: { nChoices: [10], levelChoices: [0.95] } },
          { type: 'insight', id: 'hit-rate', revealAfterSamples: 1000, paragraphs: [
            'About 95 out of 100 intervals contain μ. The rest miss it – and nothing about a single interval shows whether it is one of them.',
            'So the 95 % are a property of the procedure: build such an interval very often and it hits in about 95 % of cases. A single interval, once computed, either contains μ or it does not. In production we do not know μ and never learn which case we are in.',
          ] },
        ],
      },
      {
        title: 'What does the width depend on?',
        blocks: [
          { type: 'paragraph', content: 'The 95 % are called the {{term:konfidenzniveau|confidence level}}. You can now choose it, just like the sample size n.' },
          { type: 'definition', term: 'Confidence level', content: 'The share of intervals that contain μ over many repetitions of the procedure – for example 95 %.', glossary: 'konfidenzniveau' },
          { type: 'paragraph', content: 'The level sets the factor z in front of the standard error. The half-width of the interval is z · σ/√n.' },
          { type: 'table', headers: ['Confidence level', 'Factor z'], rows: [
            ['90 %', '1.645'],
            ['95 %', '1.96'],
            ['99 %', '2.576'],
          ] },
          { type: 'paragraph', content: 'Try at least two sample sizes and two levels and draw many samples for each setting. The table counts each setting on its own: switch back and the count continues there.' },
          { type: 'simulation', widget: 'interval-coverage', params: { nChoices: [5, 10, 40], levelChoices: [0.9, 0.95, 0.99] } },
          { type: 'insight', id: 'width', revealAfterSettings: 2, paragraphs: [
            'A larger n makes the interval narrower: four times as many packs halve the width, because n sits under the square root. At 95 % it is about ± 1.24 g with n = 10 and about ± 0.62 g with n = 40.',
            'More confidence costs width: 99 % gives wider intervals than 95 %, 90 % narrower ones.',
            'The hit rate follows the level, not n: at every sample size the 95 % intervals hit in about 95 % of cases. A larger n makes the interval more precise, not more often right.',
          ] },
        ],
      },
      {
        title: 'And if σ is unknown?',
        blocks: [
          { type: 'paragraph', content: 'So far we calculated with σ = 2 g. In production, though, σ is unknown, just like μ. Then all that is left is the sample standard deviation s as an estimate.' },
          { type: 'paragraph', content: 'Each sample now consists of only 5 packs and yields two intervals from the same values, drawn as a pair: one with s and the factor 1.96, one with s and a larger factor t from the {{term:t-verteilung|t-distribution}}. Which factor t applies depends on the {{term:freiheitsgrade|degrees of freedom}}, here n − 1 = 4.' },
          { type: 'definition', term: 't interval', formula: '\\bar{x} \\pm t \\cdot \\frac{s}{\\sqrt{n}}', glossary: 't-verteilung' },
          { type: 'paragraph', content: 'Draw many samples and compare the two rows of the table. In the chart, look for pairs where only one of the two intervals misses μ.' },
          { type: 'simulation', widget: 'interval-coverage', params: { nChoices: [5], levelChoices: [0.95], sigma: 'unknown', compare: true } },
          { type: 'insight', id: 't-factor', revealAfterSamples: 1000, paragraphs: [
            'With the factor 1.96 clearly fewer than 95 % of the intervals hit, in theory only about 88 %. The reason: s itself varies from sample to sample and is often too small. Then the interval is too short and misses μ.',
            'The t factor makes up for this. At n = 5 it is 2.776 instead of 1.96, the interval becomes wider, and about 95 % hit again. The larger n, the more reliable s and the closer t gets to 1.96 – at n = 10 t is already 2.262.',
          ] },
          { type: 'paragraph', content: 'This very t interval is the confidence interval the module “Hypothesis Test” reports for a one-sample t-test.' },
        ],
      },
      {
        title: 'Quick check',
        blocks: [
          { type: 'quiz', id: 'q-meaning', question: 'A sample from machine A gives the 95 % confidence interval 499.4 g to 501.8 g. What do the 95 % mean?', options: [
            { text: 'μ lies in this interval with 95 % probability.', correct: false, feedback: 'That is the most common misreading. μ is fixed: this one interval either contains μ or it does not. The 95 % describe how often the procedure hits over many samples.' },
            { text: '95 % of all packs weigh between 499.4 and 501.8 g.', correct: false, feedback: 'The interval is about the mean μ, not about single packs. Single packs scatter much further with σ = 2 g: about 95 % lie between 496 and 504 g.' },
            { text: 'Of many intervals computed this way, about 95 % contain μ.', correct: true, feedback: 'Exactly: the 95 % belong to the procedure. Whether this particular interval is one of the hits cannot be seen from it.' },
          ] },
          { type: 'quiz', id: 'q-n', question: 'Instead of 10 you now weigh 40 packs per sample, still at 95 %. What happens to the interval?', options: [
            { text: 'It becomes about a quarter as wide.', correct: false, feedback: 'Not quite – n sits under the square root. Four times as many packs make the interval only half as wide.' },
            { text: 'It becomes about half as wide.', correct: true, feedback: 'Exactly: √40 / √10 = 2. With σ = 2 g the half-width shrinks from about 1.24 g to about 0.62 g.' },
            { text: 'It stays as wide but hits more often.', correct: false, feedback: 'The other way round: the hit rate follows the level and stays at about 95 %. The interval gets narrower – the larger n makes it more precise.' },
          ] },
          { type: 'quiz', id: 'q-level', question: 'You stay at 10 packs but switch from 95 % to 99 %. How does the interval change?', options: [
            { text: 'It becomes wider.', correct: true, feedback: 'Exactly: the factor rises from 1.96 to 2.576. More confidence costs width.' },
            { text: 'It becomes narrower.', correct: false, feedback: 'The other way round: for more intervals to contain μ, they must reach further. The factor rises from 1.96 to 2.576.' },
            { text: 'It stays as wide but hits more often.', correct: false, feedback: 'More hits only come with wider intervals: the factor rises from 1.96 to 2.576.' },
          ] },
          { type: 'quiz', id: 'q-t', question: 'σ is unknown and you weigh 5 packs. Why do you use the t factor instead of 1.96?', options: [
            { text: 't makes the interval narrower and therefore more exact.', correct: false, feedback: 'The other way round: at n = 5, t = 2.776 and the interval becomes wider. That is exactly why it hits in about 95 % of cases again.' },
            { text: '1.96 only applies from 100 values on.', correct: false, feedback: 'There is no fixed limit: the t factor gradually approaches 1.96 as n grows – at n = 10 it is 2.262, at n = 30 still 2.045.' },
            { text: 's varies and is often too small; with 1.96 the interval would hit clearly less often than in 95 % of cases.', correct: true, feedback: 'Exactly: with 1.96 only about 88 % hit at n = 5. The larger t factor makes up for the uncertainty in s.' },
          ] },
        ],
      },
      {
        title: 'What you take away',
        blocks: [
          { type: 'paragraph', content: 'A confidence interval is x̄ ± factor · standard error. The confidence level is the hit rate of the procedure over many samples – a single interval either contains μ or it does not. The width shrinks with √n and grows with the level. If σ is unknown, you use s and the t factor.' },
          { type: 'paragraph', content: 'A confidence interval says where μ plausibly lies. The next lesson turns the question around: does a particular value, for example the target weight 500 g, still fit the data?' },
        ],
      },
    ],
  },
};
