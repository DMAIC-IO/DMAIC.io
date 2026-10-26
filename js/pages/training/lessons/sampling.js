/**
 * D.Mike — Lesson "Sample and population" (sampling.js)
 *
 * Six steps on filling machine A from lesson 1: all packs it ever fills are the
 * population (N, μ, σ), the packs we weigh are a sample (n, x̄, s). Samples are
 * drawn against the visible true curve, x̄ and s vary as estimates, and an
 * experiment with many samples of three shows why the variance divides by
 * n − 1. Each step adds one freedom: one sample -> several samples -> many
 * samples and two formulas. Nothing about how much x̄ varies (lesson 3).
 * Browser-free: the static handbook imports this in Node.
 */

export default {
  id: 'sampling',
  de: {
    title: 'Stichprobe und Grundgesamtheit',
    summary: 'Was wenige Messungen über alle möglichen Werte verraten.',
    steps: [
      {
        title: 'Die Ausgangsfrage',
        blocks: [
          { type: 'paragraph', content: 'In der Lektion „Streuung und Verteilungen“ haben wir Packungen von Anlage A gewogen, ein paar Hundert. Die Anlage füllt aber Tag für Tag weiter – über die Jahre Millionen Packungen.' },
          { type: 'paragraph', content: 'Was verraten die wenigen gewogenen Packungen über alle anderen? Um das sauber sagen zu können, braucht es zwei Begriffe mit eigenen Zeichen. Danach klären wir die offene Frage, warum s durch n − 1 teilt.' },
        ],
      },
      {
        title: 'Grundgesamtheit und Stichprobe',
        blocks: [
          { type: 'paragraph', content: 'Alle Packungen, die Anlage A jemals füllt, bilden die {{term:grundgesamtheit|Grundgesamtheit}}. Ihre Anzahl heißt N. Auch die Grundgesamtheit hat einen Mittelwert und eine Standardabweichung. Damit man sie nicht mit gemessenen Werten verwechselt, bekommen sie griechische Buchstaben: μ (gesprochen „mü“) für den Mittelwert, σ (gesprochen „sigma“) für die Standardabweichung.' },
          { type: 'definition', term: 'Grundgesamtheit', formula: '\\mu = \\frac{\\sum x_i}{N} \\qquad \\sigma = \\sqrt{\\frac{\\sum (x_i - \\mu)^2}{N}}', glossary: 'grundgesamtheit' },
          { type: 'paragraph', content: 'Bei Anlage A kennen wir die Grundgesamtheit, weil die Übung sie vorgibt: μ = 500 g, σ = 2 g. Im echten Betrieb kennt sie niemand – dafür müsste man jede Packung wiegen, auch die, die noch gar nicht gefüllt sind.' },
          { type: 'paragraph', content: 'Gewogen werden deshalb nur einige zufällig herausgegriffene Packungen: eine {{term:stichprobe|Stichprobe}}. Ihre Anzahl ist n, ihr Mittelwert x̄ und ihre Standardabweichung s – genau die Kennzahlen aus der ersten Lektion.' },
          { type: 'definition', term: 'Stichprobe', formula: '\\bar{x} = \\frac{\\sum x_i}{n} \\qquad s = \\sqrt{\\frac{\\sum (x_i - \\bar{x})^2}{n - 1}}', glossary: 'stichprobe' },
          { type: 'paragraph', content: 'Die Größe unter der Wurzel heißt {{term:varianz|Varianz}}: das Quadrat der Standardabweichung, σ² für die Grundgesamtheit, s² für die Stichprobe. Sie spielt in dieser Lektion noch eine Rolle.' },
          { type: 'definition', term: 'Varianz', formula: '\\sigma^2 = \\frac{\\sum (x_i - \\mu)^2}{N} \\qquad s^2 = \\frac{\\sum (x_i - \\bar{x})^2}{n - 1}', glossary: 'varianz' },
          { type: 'table', headers: ['', 'Grundgesamtheit', 'Stichprobe'], rows: [
            ['Anzahl', 'N', 'n'],
            ['Mittelwert', 'μ', 'x̄'],
            ['Standardabweichung', 'σ', 's'],
            ['Varianz', 'σ²', 's²'],
          ] },
          { type: 'paragraph', content: 'Zieh jetzt eine Stichprobe von Anlage A. Das Histogramm zeigt die gewogenen Packungen, die gestrichelte Kurve die Grundgesamtheit.' },
          { type: 'simulation', widget: 'sample-estimate', params: { n: 10, showTruth: true } },
          { type: 'insight', id: 'sample-glimpse', revealAfterSamples: 1, paragraphs: [
            'Die Stichprobe zeigt nur ein paar Punkte unter der Glocke – die Kurve selbst ist aus ihr kaum zu erkennen.',
            'x̄ und s liegen in der Nähe von μ = 500 g und σ = 2 g, treffen sie aber nicht genau.',
          ] },
        ],
      },
      {
        title: 'Jede Stichprobe schätzt anders',
        blocks: [
          { type: 'paragraph', content: 'Zieh mehrere Stichproben nacheinander, jede gleich groß. Die Liste unter der Tabelle hält x̄ und s der letzten Stichproben fest, die neueste oben.' },
          { type: 'simulation', widget: 'sample-estimate', params: { n: 10, showTruth: true, history: 5 } },
          { type: 'insight', id: 'estimates-vary', revealAfterSamples: 5, paragraphs: [
            'Jede Stichprobe liefert andere Werte für x̄ und s. μ und σ bleiben dagegen fest – sie gehören zur Anlage, nicht zur Stichprobe. In der Praxis sind sie fest, aber unbekannt.',
            'Deshalb heißen x̄ und s Schätzwerte: x̄ schätzt μ, s schätzt σ. Ein Schätzwert liegt meist in der Nähe des wahren Werts, aber fast nie genau darauf.',
            'Wie weit x̄ von Stichprobe zu Stichprobe wandert, ist die Frage der nächsten Lektion.',
          ] },
        ],
      },
      {
        title: 'Warum n − 1?',
        blocks: [
          { type: 'paragraph', content: 'Die Standardabweichung der **Stichprobe** s teilt durch n − 1, nicht durch n. Den Grund sieht man am besten an der Varianz. Für eine Stichprobe gibt es zwei Kandidaten:' },
          { type: 'list', items: [
            'geteilt durch n: $\\dfrac{\\sum (x_i - \\bar{x})^2}{n}$',
            'geteilt durch n − 1: $\\dfrac{\\sum (x_i - \\bar{x})^2}{n - 1} = s^2$',
          ] },
          { type: 'paragraph', content: 'Welcher trifft im Durchschnitt die Varianz der Grundgesamtheit, σ² = 4 g²? Zieh Stichproben aus nur drei Packungen – erst einzeln, dann sehr viele auf einmal – und vergleiche beide Durchschnitte mit der Zeile σ².' },
          { type: 'paragraph', content: 'Die beiden Durchschnitte liegen immer um denselben Faktor auseinander, denn sie stammen aus denselben Stichproben. Entscheidend ist, welcher von ihnen bei σ² landet.' },
          { type: 'simulation', widget: 'variance-check', params: { n: 3 } },
          { type: 'insight', id: 'n-minus-1', revealAfterSamples: 1000, paragraphs: [
            'Der Durchschnitt mit „geteilt durch n − 1“ kommt nahe an σ² = 4 g² heran; nach der Theorie sind es genau 4 g². Der Durchschnitt mit „geteilt durch n“ bleibt deutlich darunter – die Theorie sagt 8/3 ≈ 2,7 g².',
            'Der Grund: x̄ liegt immer mitten in der eigenen Stichprobe. Um ihren eigenen Mittelwert streuen die Werte deshalb weniger als um das unbekannte μ, und „geteilt durch n“ fällt im Schnitt zu klein aus. Das Teilen durch n − 1 gleicht genau das für die Varianz aus.',
            'Je größer die Stichprobe, desto kleiner der Unterschied: „Geteilt durch n“ liefert im Schnitt das (n − 1)/n-Fache von σ², bei n = 10 also 3,6 g². Eine Feinheit bleibt: s, die Wurzel aus s², fällt im Schnitt trotzdem etwas zu klein aus. Das nimmt man in Kauf.',
          ] },
        ],
      },
      {
        title: 'Kurz geprüft',
        blocks: [
          { type: 'quiz', id: 'q-fixed', question: 'Welcher Wert steht fest, ist in der Praxis aber unbekannt?', options: [
            { text: 'x̄', correct: false, feedback: 'x̄ berechnest du aus der Stichprobe – du kennst ihn also, aber er ändert sich mit jeder neuen Stichprobe.' },
            { text: 'μ', correct: true, feedback: 'Genau: μ ist der Mittelwert der Grundgesamtheit. Er steht fest, aber um ihn zu kennen, müsste man jede Packung wiegen.' },
            { text: 's', correct: false, feedback: 's kommt aus der Stichprobe: bekannt, sobald du gewogen hast, und bei jeder Stichprobe anders.' },
          ] },
          { type: 'quiz', id: 'q-estimate', question: 'Du wiegst 20 Packungen und erhältst x̄ = 500,4 g. Was ist 500,4 g?', options: [
            { text: 'Der wahre Mittelwert aller Packungen.', correct: false, feedback: 'Das wäre μ. 500,4 g ist der Mittelwert dieser 20 Packungen – eine neue Stichprobe ergäbe einen anderen Wert.' },
            { text: 'Der Mittelwert der Grundgesamtheit, weil n groß genug ist.', correct: false, feedback: 'Auch eine große Stichprobe bleibt eine Stichprobe. Mit mehr Packungen liegt x̄ meist näher an μ, ist aber nicht μ.' },
            { text: 'Ein Schätzwert für μ aus der Stichprobe.', correct: true, feedback: 'Genau: x̄ schätzt μ. Er liegt in der Nähe, aber nicht genau darauf – und ändert sich mit jeder Stichprobe.' },
          ] },
          { type: 'quiz', id: 'q-symbol', question: 'Welches Zeichen gehört zur Stichprobe?', options: [
            { text: 's', correct: true, feedback: 'Genau: s ist die Standardabweichung der Stichprobe, berechnet aus den gewogenen Packungen.' },
            { text: 'σ', correct: false, feedback: 'σ ist die Standardabweichung der Grundgesamtheit. Die griechischen Buchstaben stehen für die Grundgesamtheit.' },
            { text: 'N', correct: false, feedback: 'N ist die Zahl aller Packungen der Grundgesamtheit. Die Zahl der gewogenen Packungen heißt n.' },
          ] },
          { type: 'quiz', id: 'q-n-minus-1', question: 'Warum teilt s durch n − 1 und nicht durch n?', options: [
            { text: 'Damit das Ergebnis nie null wird.', correct: false, feedback: 'Null wird s nur, wenn alle Werte gleich sind – daran ändert der Nenner nichts. Es geht darum, dass „geteilt durch n“ im Schnitt zu klein ausfällt.' },
            { text: 'Um ihren eigenen Mittelwert x̄ streuen die Werte weniger als um μ – geteilt durch n wäre die Varianz im Schnitt zu klein.', correct: true, feedback: 'Genau, das hat dein Experiment gezeigt: Mit n − 1 trifft die Varianz s² im Durchschnitt σ².' },
            { text: 'Weil ein Wert immer ein Ausreißer ist.', correct: false, feedback: 'Mit Ausreißern hat das nichts zu tun. Auch in Stichproben ganz ohne auffällige Werte fällt „geteilt durch n“ im Schnitt zu klein aus.' },
          ] },
        ],
      },
      {
        title: 'Was du mitnimmst',
        blocks: [
          { type: 'paragraph', content: 'Die Grundgesamtheit – alle Packungen, mit N, μ und σ – ist das, was wir wissen wollen. Die Stichprobe – die gewogenen Packungen, mit n, x̄ und s – ist das, was wir messen. x̄ und s sind Schätzwerte für μ und σ und ändern sich von Stichprobe zu Stichprobe.' },
          { type: 'paragraph', content: 's teilt durch n − 1, weil die Varianz mit n im Schnitt zu klein ausfiele.' },
          { type: 'paragraph', content: 'Wenn x̄ mit jeder Stichprobe anders ausfällt: Wie stark schwankt x̄ eigentlich – und wird es mit größeren Stichproben ruhiger? Das zeigt die nächste Lektion.' },
        ],
      },
    ],
  },
  en: {
    title: 'Sample and population',
    summary: 'What a few measurements reveal about all possible values.',
    steps: [
      {
        title: 'The starting question',
        blocks: [
          { type: 'paragraph', content: 'In the lesson “Variation and distributions” we weighed packs from machine A, a few hundred of them. But the machine keeps filling day after day – millions of packs over the years.' },
          { type: 'paragraph', content: 'What do the few packs we weighed reveal about all the others? To say that cleanly we need two terms with their own symbols. Then we settle the open question of why s divides by n − 1.' },
        ],
      },
      {
        title: 'Population and sample',
        blocks: [
          { type: 'paragraph', content: 'All packs machine A ever fills form the {{term:grundgesamtheit|population}}. Their number is called N. The population has a mean and a standard deviation too. So they are not confused with measured values, they get Greek letters: μ (read “mu”) for the mean, σ (read “sigma”) for the standard deviation.' },
          { type: 'definition', term: 'Population', formula: '\\mu = \\frac{\\sum x_i}{N} \\qquad \\sigma = \\sqrt{\\frac{\\sum (x_i - \\mu)^2}{N}}', glossary: 'grundgesamtheit' },
          { type: 'paragraph', content: 'For machine A we know the population because the exercise sets it: μ = 500 g, σ = 2 g. In a real plant nobody knows it – you would have to weigh every pack, including those not yet filled.' },
          { type: 'paragraph', content: 'So only a few packs picked at random are weighed: a {{term:stichprobe|sample}}. Their number is n, their mean x̄ and their standard deviation s – exactly the figures from the first lesson.' },
          { type: 'definition', term: 'Sample', formula: '\\bar{x} = \\frac{\\sum x_i}{n} \\qquad s = \\sqrt{\\frac{\\sum (x_i - \\bar{x})^2}{n - 1}}', glossary: 'stichprobe' },
          { type: 'paragraph', content: 'The quantity under the square root is called the {{term:varianz|variance}}: the square of the standard deviation, σ² for the population, s² for the sample. It comes up again in this lesson.' },
          { type: 'definition', term: 'Variance', formula: '\\sigma^2 = \\frac{\\sum (x_i - \\mu)^2}{N} \\qquad s^2 = \\frac{\\sum (x_i - \\bar{x})^2}{n - 1}', glossary: 'varianz' },
          { type: 'table', headers: ['', 'Population', 'Sample'], rows: [
            ['Number', 'N', 'n'],
            ['Mean', 'μ', 'x̄'],
            ['Standard deviation', 'σ', 's'],
            ['Variance', 'σ²', 's²'],
          ] },
          { type: 'paragraph', content: 'Now draw a sample from machine A. The histogram shows the packs weighed, the dashed curve the population.' },
          { type: 'simulation', widget: 'sample-estimate', params: { n: 10, showTruth: true } },
          { type: 'insight', id: 'sample-glimpse', revealAfterSamples: 1, paragraphs: [
            'The sample shows only a few points under the bell – the curve itself can hardly be made out from it.',
            'x̄ and s lie close to μ = 500 g and σ = 2 g, but do not hit them exactly.',
          ] },
        ],
      },
      {
        title: 'Every sample estimates differently',
        blocks: [
          { type: 'paragraph', content: 'Draw several samples one after another, each of the same size. The list below the table keeps x̄ and s of the latest samples, newest on top.' },
          { type: 'simulation', widget: 'sample-estimate', params: { n: 10, showTruth: true, history: 5 } },
          { type: 'insight', id: 'estimates-vary', revealAfterSamples: 5, paragraphs: [
            'Every sample gives other values for x̄ and s. μ and σ, in contrast, stay fixed – they belong to the machine, not to the sample. In practice they are fixed but unknown.',
            'That is why x̄ and s are called estimates: x̄ estimates μ, s estimates σ. An estimate usually lies close to the true value, but almost never exactly on it.',
            'How far x̄ wanders from sample to sample is the question of the next lesson.',
          ] },
        ],
      },
      {
        title: 'Why n − 1?',
        blocks: [
          { type: 'paragraph', content: 'The standard deviation of the **sample** s divides by n − 1, not by n. The reason is easiest to see in the variance. For a sample there are two candidates:' },
          { type: 'list', items: [
            'divided by n: $\\dfrac{\\sum (x_i - \\bar{x})^2}{n}$',
            'divided by n − 1: $\\dfrac{\\sum (x_i - \\bar{x})^2}{n - 1} = s^2$',
          ] },
          { type: 'paragraph', content: 'Which one hits the population variance σ² = 4 g² on average? Draw samples of only three packs – first one at a time, then very many at once – and compare both averages with the σ² row.' },
          { type: 'paragraph', content: 'The two averages always differ by the same factor, because they come from the same samples. What matters is which of them lands at σ².' },
          { type: 'simulation', widget: 'variance-check', params: { n: 3 } },
          { type: 'insight', id: 'n-minus-1', revealAfterSamples: 1000, paragraphs: [
            'The average with “divided by n − 1” comes close to σ² = 4 g²; in theory it is exactly 4 g². The average with “divided by n” stays clearly below – theory says 8/3 ≈ 2.7 g².',
            'The reason: x̄ always lies right in the middle of its own sample. Around their own mean the values therefore scatter less than around the unknown μ, and “divided by n” comes out too small on average. Dividing by n − 1 corrects exactly that for the variance.',
            'The larger the sample, the smaller the gap: “divided by n” gives (n − 1)/n times σ² on average, so 3.6 g² at n = 10. One subtlety remains: s, the square root of s², still comes out slightly too small on average. That is accepted.',
          ] },
        ],
      },
      {
        title: 'Quick check',
        blocks: [
          { type: 'quiz', id: 'q-fixed', question: 'Which value is fixed but unknown in practice?', options: [
            { text: 'x̄', correct: false, feedback: 'You compute x̄ from the sample – so you know it, but it changes with every new sample.' },
            { text: 'μ', correct: true, feedback: 'Exactly: μ is the mean of the population. It is fixed, but to know it you would have to weigh every pack.' },
            { text: 's', correct: false, feedback: 's comes from the sample: known as soon as you have weighed, and different for every sample.' },
          ] },
          { type: 'quiz', id: 'q-estimate', question: 'You weigh 20 packs and get x̄ = 500.4 g. What is 500.4 g?', options: [
            { text: 'The true mean of all packs.', correct: false, feedback: 'That would be μ. 500.4 g is the mean of these 20 packs – a new sample would give another value.' },
            { text: 'The population mean, because n is large enough.', correct: false, feedback: 'Even a large sample is still a sample. With more packs x̄ usually lies closer to μ, but it is not μ.' },
            { text: 'An estimate of μ from the sample.', correct: true, feedback: 'Exactly: x̄ estimates μ. It lies close to it, but not exactly on it – and it changes with every sample.' },
          ] },
          { type: 'quiz', id: 'q-symbol', question: 'Which symbol belongs to the sample?', options: [
            { text: 's', correct: true, feedback: 'Exactly: s is the standard deviation of the sample, computed from the packs weighed.' },
            { text: 'σ', correct: false, feedback: 'σ is the standard deviation of the population. The Greek letters stand for the population.' },
            { text: 'N', correct: false, feedback: 'N is the number of all packs in the population. The number of packs weighed is n.' },
          ] },
          { type: 'quiz', id: 'q-n-minus-1', question: 'Why does s divide by n − 1 and not by n?', options: [
            { text: 'So that the result never becomes zero.', correct: false, feedback: 's is zero only when all values are equal – the denominator does not change that. The point is that “divided by n” comes out too small on average.' },
            { text: 'Around their own mean x̄ the values scatter less than around μ – divided by n the variance would be too small on average.', correct: true, feedback: 'Exactly, your experiment showed it: with n − 1 the variance s² hits σ² on average.' },
            { text: 'Because one value is always an outlier.', correct: false, feedback: 'Outliers have nothing to do with it. Even in samples without any striking values, “divided by n” comes out too small on average.' },
          ] },
        ],
      },
      {
        title: 'What you take away',
        blocks: [
          { type: 'paragraph', content: 'The population – all packs, with N, μ and σ – is what we want to know. The sample – the packs weighed, with n, x̄ and s – is what we measure. x̄ and s are estimates of μ and σ and change from sample to sample.' },
          { type: 'paragraph', content: 's divides by n − 1 because with n the variance would come out too small on average.' },
          { type: 'paragraph', content: 'If x̄ comes out differently with every sample: how much does x̄ actually vary – and does it settle with larger samples? The next lesson shows that.' },
        ],
      },
    ],
  },
};
