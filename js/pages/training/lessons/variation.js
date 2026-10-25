/**
 * D.Mike — Lesson "Variation and distributions" (variation.js)
 *
 * Eight steps: the bell of a filling machine introduces histogram, mean, range
 * and standard deviation, each with its formula; the counter's skewed waiting
 * times then show which of it holds for any shape. Each step adds one freedom:
 * one machine -> mean line -> two machines -> bands -> another shape.
 * Browser-free: the static handbook imports this in Node.
 */

export default {
  id: 'variation',
  de: {
    title: 'Streuung und Verteilungen',
    summary: 'Warum kein Wert dem anderen gleicht und wie sich das beschreiben lässt.',
    steps: [
      {
        title: 'Die Ausgangsfrage',
        blocks: [
          { type: 'paragraph', content: 'Eine Abfüllanlage füllt Packungen mit 500 g. Wiegt man die Packungen nach, wiegt keine genau 500 g – die eine etwas mehr, die andere etwas weniger. Diese Unterschiede heißen Streuung.' },
          { type: 'paragraph', content: 'Wie beschreibt man Werte, die alle verschieden sind? Mit einer Liste aller Gewichte kommt man nicht weit. Wir suchen ein Bild und ein paar Kennzahlen, die das Wesentliche festhalten – und finden sie durch Ausprobieren.' },
        ],
      },
      {
        title: 'Experiment: Packungen wiegen',
        blocks: [
          { type: 'paragraph', content: 'Wiege zuerst einzelne Packungen von Anlage A, dann viele auf einmal. Jedes Gewicht landet in einem Balken des {{term:histogramm|Histogramms}}: Der Balken zählt, wie viele Packungen in diesen Gewichtsbereich fallen.' },
          { type: 'paragraph', content: 'Das Bild, das so entsteht – wie oft welche Werte vorkommen –, heißt die Verteilung der Werte.' },
          { type: 'simulation', widget: 'value-distribution', params: { processes: ['fill-a'], stats: ['count', 'min', 'max'] } },
          { type: 'insight', id: 'bell', revealAfterValues: 100, paragraphs: [
            'Die meisten Gewichte drängen sich in der Mitte. Je weiter ein Gewicht von der Mitte entfernt ist, desto seltener kommt es vor – und das auf beiden Seiten gleich: Die Verteilung ist symmetrisch.',
            'Diese Glockenform tritt so oft auf, dass sie einen eigenen Namen hat: {{term:normalverteilung|Normalverteilung}}.',
          ] },
        ],
      },
      {
        title: 'Wo liegt die Mitte? Der Mittelwert',
        blocks: [
          { type: 'paragraph', content: 'Die erste Kennzahl beschreibt, wo die Werte liegen: der {{term:mittelwert|Mittelwert}}. Man zählt alle Gewichte zusammen und teilt durch ihre Anzahl:' },
          { type: 'definition', term: 'Mittelwert', formula: '\\bar{x} = \\frac{\\sum x_i}{n}', glossary: 'mittelwert' },
          { type: 'paragraph', content: 'Dabei steht xᵢ für das Gewicht der i-ten Packung, n für die Zahl der gewogenen Packungen und Σ für „alle zusammengezählt“. Das Ergebnis x̄ (gesprochen „x quer“) erscheint jetzt als Linie im Histogramm. Wiege wieder einige Packungen und beobachte, wohin die Linie wandert.' },
          { type: 'simulation', widget: 'value-distribution', params: { processes: ['fill-a'], showMean: true, stats: ['count', 'min', 'max', 'mean'] } },
          { type: 'insight', id: 'mean-center', revealAfterValues: 100, paragraphs: [
            'Bei wenigen Packungen springt die Linie noch hin und her, mit vielen kommt sie zur Ruhe – bei etwa 500 g.',
            'Und sie steht genau unter dem Gipfel der Glocke: Bei einer symmetrischen Verteilung liegt der Mittelwert dort, wo die meisten Werte sind.',
          ] },
        ],
      },
      {
        title: 'Wie breit? Spannweite und Standardabweichung',
        blocks: [
          { type: 'paragraph', content: 'Jetzt stehen zwei Anlagen nebeneinander, beide auf 500 g eingestellt. Wiege bei beiden viele Packungen und vergleiche die Bilder.' },
          { type: 'paragraph', content: 'Das einfachste Maß für die Breite ist die {{term:spannweite|Spannweite}}: der Abstand zwischen der leichtesten und der schwersten Packung.' },
          { type: 'definition', term: 'Spannweite', formula: 'R = x_{\\max} - x_{\\min}', glossary: 'spannweite' },
          { type: 'paragraph', content: 'Die {{term:standardabweichung|Standardabweichung}} s nutzt dagegen alle Werte: Sie misst, wie weit die Gewichte typischerweise vom Mittelwert x̄ entfernt liegen. Dazu quadriert man jeden Abstand, mittelt die Quadrate und zieht am Ende die Wurzel:' },
          { type: 'definition', term: 'Standardabweichung', formula: 's = \\sqrt{\\frac{\\sum (x_i - \\bar{x})^2}{n - 1}}', glossary: 'standardabweichung' },
          { type: 'paragraph', content: 'Warum hier durch n − 1 und nicht durch n geteilt wird, klärt die nächste Lektion.' },
          { type: 'simulation', widget: 'value-distribution', params: { processes: ['fill-a', 'fill-b'], showMean: true, stats: ['count', 'mean', 'min', 'max', 'range', 'sd'] } },
          { type: 'insight', id: 'spread-compare', revealAfterEach: 100, paragraphs: [
            'Beide Anlagen treffen im Mittel 500 g, aber Anlage B streut deutlich breiter. Der Mittelwert allein verrät das nicht – die Standardabweichung schon: etwa 2 g bei Anlage A, etwa 5 g bei Anlage B.',
            'Die Spannweite hängt nur an den zwei extremsten Packungen. Wiege weiter und beobachte die Tabelle: R wächst, je mehr du wiegst, weil früher oder später eine noch leichtere oder schwerere Packung dabei ist. s bleibt dagegen stabil.',
          ] },
        ],
      },
      {
        title: 'Die Faustregel der Glocke',
        blocks: [
          { type: 'paragraph', content: 'Die Bänder im Histogramm reichen jetzt eine und zwei Standardabweichungen um den Mittelwert: x̄ ± 1 s und x̄ ± 2 s. Die Tabelle zählt, welcher Anteil der Packungen in jedes Band fällt.' },
          { type: 'paragraph', content: 'Wiege viele Packungen, wechsle dann die Anlage und wiege dort ebenso viele. Vergleiche die Anteile.' },
          { type: 'simulation', widget: 'value-distribution', params: { processes: ['fill-a', 'fill-b'], selectable: true, showMean: true, bands: [1, 2], stats: ['count', 'mean', 'sd'] } },
          { type: 'insight', id: 'rule-of-thumb', revealAfterValues: 100, paragraphs: [
            'Etwa zwei Drittel der Packungen liegen innerhalb von x̄ ± 1 s, etwa 95 % innerhalb von x̄ ± 2 s – bei beiden Anlagen, obwohl ihre Breite so verschieden ist.',
            'Das ist die Faustregel der Glocke: Kennt man bei einer Normalverteilung x̄ und s, weiß man ungefähr, wo welcher Anteil der Werte liegt.',
          ] },
        ],
      },
      {
        title: 'Gilt das auch für Wartezeiten?',
        blocks: [
          { type: 'paragraph', content: 'Nicht alles ist glockenförmig. Am Schalter einer Behörde warten die meisten Kunden kurz, einige aber sehr lange. Miss jetzt ihre Wartezeiten.' },
          { type: 'paragraph', content: 'Mittelwert, Standardabweichung und das Band x̄ ± 1 s funktionieren genau wie eben. Eine Verteilung, die zu einer Seite weit ausläuft, heißt {{term:schiefe|schief}}.' },
          { type: 'simulation', widget: 'value-distribution', params: { processes: ['waiting'], showMean: true, bands: [1], stats: ['count', 'mean', 'sd', 'belowMean'] } },
          { type: 'insight', id: 'skewed-mean', revealAfterValues: 100, paragraphs: [
            'Hier steht der Mittelwert nicht unter dem Gipfel. Die wenigen langen Wartezeiten ziehen ihn nach rechts: Etwa 63 % der Kunden warten kürzer als der Mittelwert.',
            'Auch die Faustregel stimmt nicht mehr: Innerhalb von x̄ ± 1 s liegen etwa 86 % der Wartezeiten, nicht zwei Drittel. x̄ und s gibt es für jede Verteilung – die Zwei-Drittel-Regel gehört zur Glocke.',
          ] },
        ],
      },
      {
        title: 'Kurz geprüft',
        blocks: [
          { type: 'quiz', id: 'q-reliable', question: 'Zwei Anlagen füllen im Mittel beide 500 g. Bei Anlage A ist s = 5 g, bei Anlage B ist s = 2 g. Welche füllt zuverlässiger nahe an 500 g?', options: [
            { text: 'Anlage A – größeres s heißt, sie trifft öfter.', correct: false, feedback: 'Umgekehrt: s misst, wie weit die Gewichte typischerweise vom Mittelwert entfernt liegen. Bei 5 g weichen sie weiter ab als bei 2 g.' },
            { text: 'Anlage B mit s = 2 g.', correct: true, feedback: 'Genau: Gleicher Mittelwert, aber kleinere Standardabweichung – die Packungen von Anlage B liegen enger um 500 g.' },
            { text: 'Beide gleich, denn der Mittelwert ist gleich.', correct: false, feedback: 'Der Mittelwert sagt nur, wo die Werte liegen, nicht wie breit sie streuen. Das hast du bei den zwei Anlagen gesehen.' },
          ] },
          { type: 'quiz', id: 'q-sd-calc', question: 'Drei Packungen wiegen 498 g, 500 g und 502 g. Wie groß ist die Standardabweichung s?', options: [
            { text: '2 g', correct: true, feedback: 'Genau: x̄ = 500 g, die Abstandsquadrate sind 4, 0 und 4, ihre Summe 8. Geteilt durch n − 1 = 2 ergibt 4, die Wurzel daraus 2 g.' },
            { text: 'etwa 1,63 g', correct: false, feedback: 'Das kommt heraus, wenn man durch n = 3 teilt statt durch n − 1 = 2. Die Formel für s teilt durch n − 1.' },
            { text: '4 g', correct: false, feedback: 'Das ist die Spannweite R = 502 g − 498 g. Die Standardabweichung nutzt alle Abstände zum Mittelwert.' },
          ] },
          { type: 'quiz', id: 'q-two-thirds', question: 'Die Füllgewichte sind glockenförmig verteilt mit x̄ = 500 g und s = 2 g. Welcher Anteil der Packungen wiegt ungefähr zwischen 498 g und 502 g?', options: [
            { text: 'etwa 95 %', correct: false, feedback: '95 % liegen innerhalb von x̄ ± 2 s, also zwischen 496 g und 504 g. 498 g bis 502 g ist nur x̄ ± 1 s.' },
            { text: 'etwa die Hälfte', correct: false, feedback: 'Es sind mehr: Bei der Glocke liegen die Werte dicht um die Mitte, innerhalb von x̄ ± 1 s etwa zwei Drittel.' },
            { text: 'etwa zwei Drittel', correct: true, feedback: 'Genau: 498 g bis 502 g ist x̄ ± 1 s, und dort liegen bei einer Normalverteilung etwa zwei Drittel der Werte.' },
          ] },
          { type: 'quiz', id: 'q-wait-below', question: 'Die mittlere Wartezeit am Schalter beträgt 35 Minuten. Warten die meisten Kunden länger oder kürzer?', options: [
            { text: 'Die meisten warten kürzer.', correct: true, feedback: 'Genau: Die Wartezeiten sind schief. Wenige sehr lange Wartezeiten ziehen den Mittelwert nach oben, sodass etwa 63 % der Kunden darunter bleiben.' },
            { text: 'Genau die Hälfte wartet länger, die Hälfte kürzer.', correct: false, feedback: 'Das gilt ungefähr bei einer symmetrischen Verteilung wie der Glocke. Bei schiefen Wartezeiten liegt der Mittelwert nicht in der Mitte der Werte.' },
            { text: 'Die meisten warten länger.', correct: false, feedback: 'Umgekehrt: Die meisten Kunden warten kurz. Erst die wenigen langen Wartezeiten heben den Mittelwert auf 35 Minuten.' },
          ] },
        ],
      },
      {
        title: 'Was du mitnimmst',
        blocks: [
          { type: 'paragraph', content: 'Gemessene Werte streuen, und ihre Verteilung zeigt, wie. Der Mittelwert x̄ beschreibt, wo die Werte liegen, die Standardabweichung s, wie breit sie streuen – für jede Form der Verteilung. Die Faustregel mit zwei Dritteln und 95 % gilt dagegen nur für die Glocke.' },
          { type: 'paragraph', content: 'Bisher haben wir einfach Packungen einer Anlage gewogen. Die nächste Lektion fragt, was ein paar Messungen über alle Werte verraten, die die Anlage überhaupt liefern kann – und warum s deshalb durch n − 1 teilt.' },
        ],
      },
    ],
  },
  en: {
    title: 'Variation and distributions',
    summary: 'Why no two values are alike and how to describe that.',
    steps: [
      {
        title: 'The starting question',
        blocks: [
          { type: 'paragraph', content: 'A filling machine fills packs with 500 g. Weigh the packs and none weighs exactly 500 g – one a little more, another a little less. These differences are called variation.' },
          { type: 'paragraph', content: 'How do you describe values that are all different? A list of every weight does not get you far. We are looking for a picture and a few figures that capture what matters – and we find them by trying things out.' },
        ],
      },
      {
        title: 'Experiment: weighing packs',
        blocks: [
          { type: 'paragraph', content: 'First weigh single packs from machine A, then many at once. Each weight lands in a bar of the {{term:histogramm|histogram}}: the bar counts how many packs fall into that weight range.' },
          { type: 'paragraph', content: 'The picture that emerges – how often which values occur – is called the distribution of the values.' },
          { type: 'simulation', widget: 'value-distribution', params: { processes: ['fill-a'], stats: ['count', 'min', 'max'] } },
          { type: 'insight', id: 'bell', revealAfterValues: 100, paragraphs: [
            'Most weights crowd in the middle. The further a weight is from the middle, the rarer it is – and equally so on both sides: the distribution is symmetric.',
            'This bell shape occurs so often that it has its own name: the {{term:normalverteilung|normal distribution}}.',
          ] },
        ],
      },
      {
        title: 'Where is the middle? The mean',
        blocks: [
          { type: 'paragraph', content: 'The first figure describes where the values lie: the {{term:mittelwert|mean}}. Add up all weights and divide by how many there are:' },
          { type: 'definition', term: 'Mean', formula: '\\bar{x} = \\frac{\\sum x_i}{n}', glossary: 'mittelwert' },
          { type: 'paragraph', content: 'Here xᵢ stands for the weight of the i-th pack, n for the number of packs weighed and Σ for “all added up”. The result x̄ (read “x bar”) now appears as a line in the histogram. Weigh some packs again and watch where the line moves.' },
          { type: 'simulation', widget: 'value-distribution', params: { processes: ['fill-a'], showMean: true, stats: ['count', 'min', 'max', 'mean'] } },
          { type: 'insight', id: 'mean-center', revealAfterValues: 100, paragraphs: [
            'With few packs the line still jumps back and forth; with many it settles down – at about 500 g.',
            'And it sits right below the peak of the bell: in a symmetric distribution the mean lies where most values are.',
          ] },
        ],
      },
      {
        title: 'How wide? Range and standard deviation',
        blocks: [
          { type: 'paragraph', content: 'Now two machines stand side by side, both set to 500 g. Weigh many packs on both and compare the pictures.' },
          { type: 'paragraph', content: 'The simplest measure of width is the {{term:spannweite|range}}: the distance between the lightest and the heaviest pack.' },
          { type: 'definition', term: 'Range', formula: 'R = x_{\\max} - x_{\\min}', glossary: 'spannweite' },
          { type: 'paragraph', content: 'The {{term:standardabweichung|standard deviation}} s, in contrast, uses all values: it measures how far the weights typically lie from the mean x̄. To get it, square each distance, average the squares and finally take the square root:' },
          { type: 'definition', term: 'Standard deviation', formula: 's = \\sqrt{\\frac{\\sum (x_i - \\bar{x})^2}{n - 1}}', glossary: 'standardabweichung' },
          { type: 'paragraph', content: 'Why this divides by n − 1 and not by n is explained in the next lesson.' },
          { type: 'simulation', widget: 'value-distribution', params: { processes: ['fill-a', 'fill-b'], showMean: true, stats: ['count', 'mean', 'min', 'max', 'range', 'sd'] } },
          { type: 'insight', id: 'spread-compare', revealAfterEach: 100, paragraphs: [
            'Both machines hit 500 g on average, but machine B spreads clearly wider. The mean alone does not tell you that – the standard deviation does: about 2 g for machine A, about 5 g for machine B.',
            'The range depends only on the two most extreme packs. Keep weighing and watch the table: R grows the more you weigh, because sooner or later an even lighter or heavier pack turns up. s, in contrast, stays stable.',
          ] },
        ],
      },
      {
        title: 'The bell’s rule of thumb',
        blocks: [
          { type: 'paragraph', content: 'The bands in the histogram now reach one and two standard deviations around the mean: x̄ ± 1 s and x̄ ± 2 s. The table counts which share of the packs falls into each band.' },
          { type: 'paragraph', content: 'Weigh many packs, then switch the machine and weigh just as many there. Compare the shares.' },
          { type: 'simulation', widget: 'value-distribution', params: { processes: ['fill-a', 'fill-b'], selectable: true, showMean: true, bands: [1, 2], stats: ['count', 'mean', 'sd'] } },
          { type: 'insight', id: 'rule-of-thumb', revealAfterValues: 100, paragraphs: [
            'About two thirds of the packs lie within x̄ ± 1 s, about 95 % within x̄ ± 2 s – for both machines, although their widths are so different.',
            'That is the bell’s rule of thumb: once you know x̄ and s of a normal distribution, you know roughly where which share of the values lies.',
          ] },
        ],
      },
      {
        title: 'Does this hold for waiting times too?',
        blocks: [
          { type: 'paragraph', content: 'Not everything is bell-shaped. At the counter of a public office most customers wait briefly, but a few wait very long. Now measure their waiting times.' },
          { type: 'paragraph', content: 'Mean, standard deviation and the band x̄ ± 1 s work just as before. A distribution that runs out far to one side is called {{term:schiefe|skewed}}.' },
          { type: 'simulation', widget: 'value-distribution', params: { processes: ['waiting'], showMean: true, bands: [1], stats: ['count', 'mean', 'sd', 'belowMean'] } },
          { type: 'insight', id: 'skewed-mean', revealAfterValues: 100, paragraphs: [
            'Here the mean does not sit below the peak. The few long waiting times pull it to the right: about 63 % of the customers wait less than the mean.',
            'The rule of thumb no longer holds either: about 86 % of the waiting times lie within x̄ ± 1 s, not two thirds. x̄ and s exist for every distribution – the two-thirds rule belongs to the bell.',
          ] },
        ],
      },
      {
        title: 'Quick check',
        blocks: [
          { type: 'quiz', id: 'q-reliable', question: 'Two machines both fill 500 g on average. Machine A has s = 5 g, machine B has s = 2 g. Which one fills more reliably close to 500 g?', options: [
            { text: 'Machine A – a larger s means it hits more often.', correct: false, feedback: 'The other way round: s measures how far the weights typically lie from the mean. At 5 g they deviate further than at 2 g.' },
            { text: 'Machine B with s = 2 g.', correct: true, feedback: 'Exactly: same mean, but a smaller standard deviation – machine B’s packs lie closer around 500 g.' },
            { text: 'Both the same, since the mean is the same.', correct: false, feedback: 'The mean only says where the values lie, not how widely they spread. You saw that with the two machines.' },
          ] },
          { type: 'quiz', id: 'q-sd-calc', question: 'Three packs weigh 498 g, 500 g and 502 g. What is the standard deviation s?', options: [
            { text: '2 g', correct: true, feedback: 'Exactly: x̄ = 500 g, the squared distances are 4, 0 and 4, their sum 8. Divided by n − 1 = 2 gives 4, its square root 2 g.' },
            { text: 'about 1.63 g', correct: false, feedback: 'That is what you get dividing by n = 3 instead of n − 1 = 2. The formula for s divides by n − 1.' },
            { text: '4 g', correct: false, feedback: 'That is the range R = 502 g − 498 g. The standard deviation uses all distances to the mean.' },
          ] },
          { type: 'quiz', id: 'q-two-thirds', question: 'The fill weights are bell-shaped with x̄ = 500 g and s = 2 g. About what share of the packs weighs between 498 g and 502 g?', options: [
            { text: 'about 95 %', correct: false, feedback: '95 % lie within x̄ ± 2 s, that is between 496 g and 504 g. 498 g to 502 g is only x̄ ± 1 s.' },
            { text: 'about half', correct: false, feedback: 'It is more: in the bell the values lie close around the middle, about two thirds within x̄ ± 1 s.' },
            { text: 'about two thirds', correct: true, feedback: 'Exactly: 498 g to 502 g is x̄ ± 1 s, and in a normal distribution about two thirds of the values lie there.' },
          ] },
          { type: 'quiz', id: 'q-wait-below', question: 'The mean waiting time at the counter is 35 minutes. Do most customers wait longer or shorter?', options: [
            { text: 'Most wait shorter.', correct: true, feedback: 'Exactly: the waiting times are skewed. A few very long waits pull the mean up, so about 63 % of the customers stay below it.' },
            { text: 'Exactly half wait longer, half shorter.', correct: false, feedback: 'That roughly holds for a symmetric distribution like the bell. With skewed waiting times the mean does not lie in the middle of the values.' },
            { text: 'Most wait longer.', correct: false, feedback: 'The other way round: most customers wait briefly. Only the few long waits lift the mean to 35 minutes.' },
          ] },
        ],
      },
      {
        title: 'What you take away',
        blocks: [
          { type: 'paragraph', content: 'Measured values vary, and their distribution shows how. The mean x̄ describes where the values lie, the standard deviation s how widely they spread – for any shape of distribution. The rule of thumb with two thirds and 95 %, however, holds only for the bell.' },
          { type: 'paragraph', content: 'So far we simply weighed packs from one machine. The next lesson asks what a few measurements reveal about all the values the machine can deliver at all – and why s therefore divides by n − 1.' },
        ],
      },
    ],
  },
};
