/**
 * D.Mike — Lesson "Sampling distribution & CLT" (sampling-distribution.js)
 *
 * Seven steps on one example (waiting times at a counter). Each step adds one
 * freedom: everything locked -> n free -> population free -> theory overlay.
 * Browser-free: the static handbook imports this in Node.
 */

const N_FROM_ONE = [1, 2, 5, 10, 30, 50];

export default {
  id: 'sampling-distribution',
  de: {
    title: 'Stichprobenverteilung und Grenzwertsatz',
    summary: 'Warum Mittelwerte sich anders verhalten als Einzelwerte.',
    steps: [
      {
        title: 'Die Ausgangsfrage',
        blocks: [
          { type: 'paragraph', content: 'Viele Verfahren der Statistik urteilen über den Mittelwert einer Stichprobe und rechnen dabei mit einer Glockenform. Echte Prozessdaten sind aber oft schief – zum Beispiel die Wartezeiten der Kunden an einem Schalter.' },
          { type: 'paragraph', content: 'Warum funktionieren die Verfahren trotzdem? Weil sie über Mittelwerte urteilen – und Mittelwerte verhalten sich anders als Einzelwerte. Das probieren wir jetzt aus.' },
        ],
      },
      {
        title: 'Experiment: eine schiefe Grundgesamtheit',
        blocks: [
          { type: 'paragraph', content: 'Das linke Diagramm zeigt die {{term:grundgesamtheit|Grundgesamtheit}}: alle Wartezeiten, die der Schalter liefern kann. Sie ist stark schief – die meisten Kunden warten kurz, einige sehr lange.' },
          { type: 'paragraph', content: 'Jede {{term:stichprobe|Stichprobe}} misst einige zufällige Wartezeiten und bildet ihren Mittelwert x̄. Rechts landet dieser eine Mittelwert. Ziehe ein paar einzelne Stichproben und danach viele auf einmal.' },
          { type: 'simulation', widget: 'sampling-distribution', params: { population: 'skewed', n: 2, lockPopulation: true, lockN: true, showTheory: false } },
          { type: 'insight', id: 'means-narrower', revealAfter: 100, paragraphs: [
            'Vergleiche die beiden Bilder: Rechts reicht die Verteilung nicht mehr so weit nach rechts hinaus. Eine sehr lange Wartezeit wird beim Mitteln meist durch eine kürzere ausgeglichen – die Ausreißer auf der langen Seite werden weniger.',
            'Und vergleiche die Tabellen darunter: Der Mittelwert ändert sich kaum, er liegt rechts wie links bei etwa 35. Die Streuung aber geht zurück – von 15 auf etwa 11. Genau das schauen wir uns im nächsten Schritt genauer an.',
          ] },
        ],
      },
      {
        title: 'Was passiert bei größerem n?',
        blocks: [
          { type: 'paragraph', content: 'Jetzt darfst du die Zahl der Wartezeiten pro Stichprobe verändern – das ist der Stichprobenumfang n. Probiere verschiedene Werte aus und ziehe jeweils viele Stichproben. Achte auf zwei Dinge: die Form und die Breite der Verteilung rechts. Die Diagramme darunter halten für jedes n den Mittelwert und die Streuung der Mittelwerte fest.' },
          { type: 'paragraph', content: 'Die Verteilung dieser Mittelwerte heißt {{term:stichprobenverteilung|Stichprobenverteilung}}.' },
          { type: 'simulation', widget: 'sampling-distribution', params: { population: 'skewed', n: 5, lockPopulation: true, lockN: false, showTheory: false, trackN: true } },
          { type: 'insight', id: 'larger-n', revealAfter: 100, revealAfterN: 3, paragraphs: [
            'Mit wachsendem n werden die Mittelwerte immer symmetrischer und glockenförmiger – und zugleich schmaler. Obwohl die Wartezeiten selbst schief bleiben.',
            'Die Punkte unten zeigen: Der Mittelwert bleibt, wo er ist. Die Streuung fällt erst schnell, dann immer langsamer.',
          ] },
        ],
      },
      {
        title: 'Gilt das für jede Grundgesamtheit?',
        blocks: [
          { type: 'paragraph', content: 'Jetzt darfst du auch die Grundgesamtheit wechseln: normalverteilt, gleichverteilt, schief oder zweigipflig. Beginne bei jeder mit dem kleinsten n, erhöhe n dann Schritt für Schritt und ziehe jedes Mal viele Stichproben.' },
          { type: 'paragraph', content: 'Bei einer Stichprobe aus nur einem Wert (n = 1) sieht die rechte Verteilung genauso aus wie die linke – jeder „Mittelwert“ ist ja nur ein einzelner Wert.' },
          { type: 'simulation', widget: 'sampling-distribution', params: { population: 'bimodal', n: 1, lockPopulation: false, lockN: false, showTheory: false, trackN: true, nChoices: N_FROM_ONE } },
          { type: 'insight', id: 'clt', revealAfterShapes: 2, revealAfterN: 3, paragraphs: [
            'Egal wie die Einzelwerte verteilt sind: Die Mittelwerte werden mit wachsendem n immer glockenförmiger. Das ist der {{term:zentraler-grenzwertsatz|zentrale Grenzwertsatz}}.',
            'Wie schnell das geht, hängt von der Form der Grundgesamtheit ab – vergleiche schief und gleichverteilt.',
          ] },
        ],
      },
      {
        title: 'Wie breit wird die Glocke? Der Standardfehler',
        blocks: [
          { type: 'paragraph', content: 'Die Streuung der Mittelwerte heißt Standardfehler. Sie hängt nur von der Streuung der Einzelwerte σ und vom Stichprobenumfang n ab:' },
          { type: 'definition', term: 'Standardfehler', formula: '\\mathit{SE} = \\frac{\\sigma}{\\sqrt{n}}', glossary: 'standardfehler' },
          { type: 'paragraph', content: 'Die gestrichelte Kurve zeigt jetzt die Vorhersage der Theorie: eine {{term:normalverteilung|Normalverteilung}} mit dem Mittelwert μ der Grundgesamtheit und der Streuung σ/√n. Vergleiche sie mit deiner Simulation und mit den Kennzahlen darunter. Im unteren Diagramm erscheint σ/√n als Kurve – deine Punkte aus den vorigen Schritten sind schon da.' },
          { type: 'simulation', widget: 'sampling-distribution', params: { population: 'skewed', n: 10, lockPopulation: false, lockN: false, showTheory: true, trackN: true, nChoices: N_FROM_ONE } },
        ],
      },
      {
        title: 'Kurz geprüft',
        blocks: [
          { type: 'quiz', id: 'q-se-quadruple', question: 'Statt 4 misst du jetzt 16 Kunden pro Stichprobe. Was passiert mit der Streuung der Mittelwerte?', options: [
            { text: 'Sie viertelt sich.', correct: false, feedback: 'Nicht ganz – n steht unter der Wurzel. Viermal so viele Werte machen den Standardfehler nur halb so groß.' },
            { text: 'Sie halbiert sich.', correct: true, feedback: 'Genau: √16 / √4 = 2. Für halbe Streuung brauchst du vierfachen Aufwand.' },
            { text: 'Sie bleibt gleich, nur die Form ändert sich.', correct: false, feedback: 'Die Form nähert sich der Glocke an, aber auch die Breite schrumpft – mit σ/√n.' },
          ] },
          { type: 'quiz', id: 'q-mean-location', question: 'Die Wartezeiten sind schief, ihr Mittelwert μ liegt bei 35 Minuten. Du ziehst 1000 Stichproben mit n = 30. Wo liegt der Mittelwert der 1000 Stichprobenmittelwerte?', options: [
            { text: 'Deutlich darunter, weil die meisten Kunden kurz warten.', correct: false, feedback: 'Die vielen kurzen Wartezeiten sind in μ schon eingerechnet. Die Stichprobenmittelwerte treffen μ im Mittel genau – auch bei schiefen Daten.' },
            { text: 'Deutlich darüber, weil die langen Wartezeiten nach oben ziehen.', correct: false, feedback: 'Die langen Wartezeiten stecken bereits in μ. Im Mittel landen die Stichprobenmittelwerte genau bei μ.' },
            { text: 'Bei etwa 35 Minuten – genau dort, wo μ liegt.', correct: true, feedback: 'Genau: Die Stichprobenmittelwerte streuen um μ, egal wie groß n ist. Mit wachsendem n bleibt ihre Lage, ihre Streuung wird kleiner.' },
          ] },
          { type: 'quiz', id: 'q-clt-forty', question: 'Die Wartezeiten sind deutlich schief. Du misst immer wieder je 40 Kunden und bildest den Mittelwert. Welche Form hat die Verteilung dieser Mittelwerte?', options: [
            { text: 'Genauso schief wie die einzelnen Wartezeiten.', correct: false, feedback: 'Die einzelnen Wartezeiten bleiben schief, ihre Mittelwerte aber werden mit wachsendem n glockenförmig – das hast du in der Simulation gesehen.' },
            { text: 'Annähernd glockenförmig.', correct: true, feedback: 'Das ist der zentrale Grenzwertsatz. Bei sehr schiefen Wartezeiten oder Ausreißern braucht es mehr Werte, und für die einzelnen Wartezeiten gilt das nicht: die bleiben schief.' },
          ] },
          { type: 'quiz', id: 'q-clt-shapes', question: 'Drei Filialen: In der ersten sind die Wartezeiten gleichverteilt, in der zweiten schief, in der dritten zweigipflig. Du ziehst überall 1000 Stichproben mit n = 30. Welche Form haben die drei Verteilungen der Mittelwerte?', options: [
            { text: 'Alle drei annähernd glockenförmig.', correct: true, feedback: 'Genau: Der zentrale Grenzwertsatz verlangt keine bestimmte Form der Einzelwerte. Die Ausgangsform bestimmt nur, wie groß n sein muss – bei n = 30 reicht es für alle drei.' },
            { text: 'Jede behält ihre Form: gleichverteilt, schief, zweigipflig.', correct: false, feedback: 'Das gilt für die einzelnen Wartezeiten. Ihre Mittelwerte werden mit wachsendem n glockenförmig, ganz gleich, wie die Einzelwerte verteilt sind – das hast du beim Vergleich der Grundgesamtheiten gesehen.' },
            { text: 'Zwei werden glockenförmig, die zweigipflige bleibt zweigipflig.', correct: false, feedback: 'Auch die zwei Gipfel verschwinden: Jede Stichprobe mischt Kunden aus beiden Gruppen, und die Mittelwerte sammeln sich in einer Glocke dazwischen.' },
          ] },
        ],
      },
      {
        title: 'Was du mitnimmst',
        blocks: [
          { type: 'paragraph', content: 'Mittelwerte aus Stichproben streuen weniger als Einzelwerte, und zwar um den Faktor √n. Mit wachsendem n wird ihre Verteilung glockenförmig – fast unabhängig davon, wie die Einzelwerte verteilt sind. Für die einzelnen Werte gilt das nicht – die Wartezeiten selbst bleiben schief.' },
          { type: 'paragraph', content: 'Genau darauf baut der Hypothesentest auf: Er fragt, ob ein beobachteter Mittelwert in diese Glocke passt oder ob er so weit außen liegt, dass Zufall als Erklärung unplausibel wird. Das ist das Thema der nächsten Lektionen.' },
        ],
      },
    ],
  },
  en: {
    title: 'Sampling distribution and the central limit theorem',
    summary: 'Why means behave differently from individual values.',
    steps: [
      {
        title: 'The starting question',
        blocks: [
          { type: 'paragraph', content: 'Many statistical methods judge the mean of a sample and count on a bell shape. Real process data are often skewed, though – for example the waiting times of customers at a counter.' },
          { type: 'paragraph', content: 'So why do these methods still work? Because they judge means – and means behave differently from individual values. Let’s try it out.' },
        ],
      },
      {
        title: 'Experiment: a skewed population',
        blocks: [
          { type: 'paragraph', content: 'The left chart shows the {{term:grundgesamtheit|population}}: all waiting times the counter can deliver. It is strongly skewed – most customers wait briefly, a few very long.' },
          { type: 'paragraph', content: 'Each {{term:stichprobe|sample}} measures a few random waiting times and computes their mean x̄. That one mean lands on the right. Draw a few single samples, then many at once.' },
          { type: 'simulation', widget: 'sampling-distribution', params: { population: 'skewed', n: 2, lockPopulation: true, lockN: true, showTheory: false } },
          { type: 'insight', id: 'means-narrower', revealAfter: 100, paragraphs: [
            'Compare the two pictures: on the right the distribution no longer reaches as far out to the right. A very long waiting time is usually offset by a shorter one when averaging – there are fewer outliers on the long side.',
            'And compare the tables below: the mean hardly changes, it is about 35 on both sides. The spread, however, goes down – from 15 to about 11. That is what we look at more closely in the next step.',
          ] },
        ],
      },
      {
        title: 'What happens with larger n?',
        blocks: [
          { type: 'paragraph', content: 'Now you may change the number of waiting times per sample – the sample size n. Try different values and draw many samples each time. Watch two things: the shape and the width of the distribution on the right. The charts below record the mean and the spread of the means for every n.' },
          { type: 'paragraph', content: 'The distribution of these means is called the {{term:stichprobenverteilung|sampling distribution}}.' },
          { type: 'simulation', widget: 'sampling-distribution', params: { population: 'skewed', n: 5, lockPopulation: true, lockN: false, showTheory: false, trackN: true } },
          { type: 'insight', id: 'larger-n', revealAfter: 100, revealAfterN: 3, paragraphs: [
            'With growing n the means become more and more symmetric and bell-shaped – and narrower at the same time. Even though the waiting times themselves stay skewed.',
            'The points below show: the mean stays where it is. The spread drops fast at first, then ever more slowly.',
          ] },
        ],
      },
      {
        title: 'Does this hold for every population?',
        blocks: [
          { type: 'paragraph', content: 'Now you may switch the population too: normal, uniform, skewed or bimodal. For each one start with the smallest n, then increase n step by step and draw many samples each time.' },
          { type: 'paragraph', content: 'With a sample of just one value (n = 1) the distribution on the right looks just like the one on the left – each “mean” is only a single value.' },
          { type: 'simulation', widget: 'sampling-distribution', params: { population: 'bimodal', n: 1, lockPopulation: false, lockN: false, showTheory: false, trackN: true, nChoices: N_FROM_ONE } },
          { type: 'insight', id: 'clt', revealAfterShapes: 2, revealAfterN: 3, paragraphs: [
            'No matter how the individual values are distributed: with growing n the means become more and more bell-shaped. That is the {{term:zentraler-grenzwertsatz|central limit theorem}}.',
            'How fast this happens depends on the shape of the population – compare skewed and uniform.',
          ] },
        ],
      },
      {
        title: 'How wide is the bell? The standard error',
        blocks: [
          { type: 'paragraph', content: 'The spread of the means is called the standard error. It depends only on the spread of the individual values σ and on the sample size n:' },
          { type: 'definition', term: 'Standard error', formula: '\\mathit{SE} = \\frac{\\sigma}{\\sqrt{n}}', glossary: 'standardfehler' },
          { type: 'paragraph', content: 'The dashed curve now shows the theory’s prediction: a {{term:normalverteilung|normal distribution}} with the population mean μ and the spread σ/√n. Compare it with your simulation and with the figures below. In the lower chart σ/√n appears as a curve – your points from the previous steps are already there.' },
          { type: 'simulation', widget: 'sampling-distribution', params: { population: 'skewed', n: 10, lockPopulation: false, lockN: false, showTheory: true, trackN: true, nChoices: N_FROM_ONE } },
        ],
      },
      {
        title: 'Quick check',
        blocks: [
          { type: 'quiz', id: 'q-se-quadruple', question: 'Instead of 4 you now measure 16 customers per sample. What happens to the spread of the means?', options: [
            { text: 'It drops to a quarter.', correct: false, feedback: 'Not quite – n sits under the square root. Four times the values make the standard error only half as large.' },
            { text: 'It halves.', correct: true, feedback: 'Exactly: √16 / √4 = 2. Half the spread costs four times the effort.' },
            { text: 'It stays the same, only the shape changes.', correct: false, feedback: 'The shape approaches the bell, but the width shrinks too – with σ/√n.' },
          ] },
          { type: 'quiz', id: 'q-mean-location', question: 'The waiting times are skewed, their mean μ is 35 minutes. You draw 1000 samples with n = 30. Where does the mean of the 1000 sample means lie?', options: [
            { text: 'Clearly below, because most customers wait briefly.', correct: false, feedback: 'The many short waiting times are already part of μ. On average the sample means hit μ exactly – even for skewed data.' },
            { text: 'Clearly above, because the long waiting times pull it up.', correct: false, feedback: 'The long waiting times are already part of μ. On average the sample means land exactly at μ.' },
            { text: 'At about 35 minutes – right where μ lies.', correct: true, feedback: 'Exactly: the sample means scatter around μ, whatever n is. With growing n their location stays, their spread shrinks.' },
          ] },
          { type: 'quiz', id: 'q-clt-forty', question: 'The waiting times are clearly skewed. You repeatedly measure 40 customers and take the mean. What shape does the distribution of these means have?', options: [
            { text: 'Just as skewed as the individual waiting times.', correct: false, feedback: 'The individual waiting times stay skewed, but their means become bell-shaped with growing n – you saw that in the simulation.' },
            { text: 'Approximately bell-shaped.', correct: true, feedback: 'That is the central limit theorem. Very skewed data or outliers need more values, and it does not hold for the individual waiting times: they stay skewed.' },
          ] },
          { type: 'quiz', id: 'q-clt-shapes', question: 'Three branches: in the first the waiting times are uniform, in the second skewed, in the third bimodal. In each you draw 1000 samples with n = 30. What shape do the three distributions of the means have?', options: [
            { text: 'All three approximately bell-shaped.', correct: true, feedback: 'Exactly: the central limit theorem does not require any particular shape of the individual values. The starting shape only decides how large n must be – at n = 30 it is enough for all three.' },
            { text: 'Each keeps its shape: uniform, skewed, bimodal.', correct: false, feedback: 'That holds for the individual waiting times. Their means become bell-shaped with growing n, however the individual values are distributed – you saw that when comparing the populations.' },
            { text: 'Two become bell-shaped, the bimodal one stays bimodal.', correct: false, feedback: 'The two peaks disappear as well: every sample mixes customers from both groups, and the means gather in one bell between them.' },
          ] },
        ],
      },
      {
        title: 'What you take away',
        blocks: [
          { type: 'paragraph', content: 'Sample means vary less than individual values, by a factor of √n. With growing n their distribution becomes bell-shaped – almost regardless of how the individual values are distributed. This does not hold for the individual values – the waiting times themselves stay skewed.' },
          { type: 'paragraph', content: 'This is exactly what the hypothesis test builds on: it asks whether an observed mean fits into this bell or lies so far out that chance becomes an implausible explanation. That is the topic of the next lessons.' },
        ],
      },
    ],
  },
};
