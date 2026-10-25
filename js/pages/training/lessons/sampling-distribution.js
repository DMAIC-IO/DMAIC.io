/**
 * D.Mike — Lesson "Sampling distribution & CLT" (sampling-distribution.js)
 *
 * STUB: two steps that exercise every block type. Replaced by the real
 * lesson later. Browser-free: the static handbook imports this in Node.
 */

export default {
  id: 'sampling-distribution',
  de: {
    title: 'Stichprobenverteilung und Grenzwertsatz',
    summary: 'Warum Mittelwerte sich anders verhalten als Einzelwerte.',
    steps: [
      {
        title: 'Experiment: eine schiefe Grundgesamtheit',
        blocks: [
          { type: 'heading', content: 'Wartezeiten am Schalter' },
          { type: 'paragraph', content: 'Die meisten Kunden warten kurz, einige sehr lange. Wir ziehen {{term:stichprobe|Stichproben}} aus dieser {{term:grundgesamtheit|Grundgesamtheit}}.' },
          { type: 'simulation', widget: 'sampling-distribution', params: { population: 'skewed', n: 2, lockPopulation: true, lockN: true, showTheory: false } },
          { type: 'insight', id: 'means-narrower', revealAfter: 50, paragraphs: [
            'Die Mittelwerte streuen weniger als die Einzelwerte.',
          ] },
          { type: 'list', items: ['Ziehe einzelne Stichproben.', 'Ziehe danach viele auf einmal.'] },
          { type: 'quiz', id: 'q-means-vs-single', question: 'Was passiert mit der Streuung, wenn du Mittelwerte statt Einzelwerte betrachtest?', options: [
            { text: 'Sie wird kleiner.', correct: true, feedback: 'Richtig: Lange und kurze Wartezeiten gleichen sich beim Mitteln aus.' },
            { text: 'Sie wird größer.', correct: false, feedback: 'Nein, das Mitteln gleicht Ausreißer eher aus.' },
          ] },
        ],
      },
      {
        title: 'Eine gleichverteilte Grundgesamtheit',
        blocks: [
          { type: 'heading', content: 'Andere Form, gleiche Frage' },
          { type: 'steps', items: ['Wähle eine Stichprobengröße.', 'Ziehe 1000 Stichproben.', 'Vergleiche die Form.'] },
          { type: 'simulation', widget: 'sampling-distribution', params: { population: 'uniform', n: 5, lockPopulation: true, lockN: false, showTheory: false, trackN: true } },
          { type: 'definition', term: 'Standardfehler', content: 'SE = σ / √n', glossary: 'standardfehler' },
          { type: 'table', headers: ['n', 'Streuung der Mittelwerte'], rows: [['2', 'größer'], ['30', 'kleiner']] },
          { type: 'note', content: 'Die Werte in der Tabelle sind nur eine Richtung, keine Messwerte.' },
          { type: 'insight', id: 'bell-shape', revealAfterShapes: 2, revealAfterN: 3, paragraphs: [
            'Mit wachsendem n werden die Mittelwerte glockenförmig.',
          ] },
          { type: 'quiz', id: 'q-bigger-n', question: 'Wie verändert ein größeres n die Breite der Mittelwerte?', options: [
            { text: 'Sie wird schmaler.', correct: true, feedback: 'Richtig: Die Breite fällt mit 1/√n.' },
            { text: 'Sie bleibt gleich.', correct: false, feedback: 'Nein, sie nimmt mit n ab.' },
          ] },
        ],
      },
    ],
  },
  en: {
    title: 'Sampling distribution and the central limit theorem',
    summary: 'Why means behave differently from individual values.',
    steps: [
      {
        title: 'Experiment: a skewed population',
        blocks: [
          { type: 'heading', content: 'Waiting times at the counter' },
          { type: 'paragraph', content: 'Most customers wait briefly, a few wait very long. We draw {{term:stichprobe|samples}} from this {{term:grundgesamtheit|population}}.' },
          { type: 'simulation', widget: 'sampling-distribution', params: { population: 'skewed', n: 2, lockPopulation: true, lockN: true, showTheory: false } },
          { type: 'insight', id: 'means-narrower', revealAfter: 50, paragraphs: [
            'The means vary less than the individual values.',
          ] },
          { type: 'list', items: ['Draw single samples.', 'Then draw many at once.'] },
          { type: 'quiz', id: 'q-means-vs-single', question: 'What happens to the spread when you look at means instead of individual values?', options: [
            { text: 'It gets smaller.', correct: true, feedback: 'Correct: long and short waits balance out when averaged.' },
            { text: 'It gets larger.', correct: false, feedback: 'No, averaging tends to balance out extreme values.' },
          ] },
        ],
      },
      {
        title: 'A uniform population',
        blocks: [
          { type: 'heading', content: 'Different shape, same question' },
          { type: 'steps', items: ['Choose a sample size.', 'Draw 1000 samples.', 'Compare the shape.'] },
          { type: 'simulation', widget: 'sampling-distribution', params: { population: 'uniform', n: 5, lockPopulation: true, lockN: false, showTheory: false, trackN: true } },
          { type: 'definition', term: 'Standard error', content: 'SE = σ / √n', glossary: 'standardfehler' },
          { type: 'table', headers: ['n', 'Spread of the means'], rows: [['2', 'larger'], ['30', 'smaller']] },
          { type: 'note', content: 'The table values only indicate a direction; they are not measurements.' },
          { type: 'insight', id: 'bell-shape', revealAfterShapes: 2, revealAfterN: 3, paragraphs: [
            'As n grows, the means become bell-shaped.',
          ] },
          { type: 'quiz', id: 'q-bigger-n', question: 'How does a larger n change the width of the means?', options: [
            { text: 'It gets narrower.', correct: true, feedback: 'Correct: the width falls with 1/√n.' },
            { text: 'It stays the same.', correct: false, feedback: 'No, it decreases with n.' },
          ] },
        ],
      },
    ],
  },
};
