/**
 * D.Mike — Course "Statistics basics" (statistics-basics.js)
 *
 * Manifest. Lessons without `content` are shown as "in preparation".
 * Browser-free: the static handbook imports this in Node.
 */

import variation from '../lessons/variation.js';
import sampling from '../lessons/sampling.js';
import samplingDistribution from '../lessons/sampling-distribution.js';

export default {
  id: 'statistics-basics',
  de: {
    title: 'Statistik-Grundlagen',
    summary: 'Von der Streuung bis zum Hypothesentest — jede Idee zum Ausprobieren.',
  },
  en: {
    title: 'Statistics basics',
    summary: 'From variation to the hypothesis test — every idea to try out yourself.',
  },
  lessons: [
    {
      id: 'variation',
      de: { title: 'Streuung und Verteilungen', summary: 'Warum kein Wert dem anderen gleicht und wie sich das beschreiben lässt.' },
      en: { title: 'Variation and distributions', summary: 'Why no two values are alike and how to describe that.' },
      prerequisites: [],
      content: variation,
    },
    {
      id: 'sampling',
      de: { title: 'Stichprobe und Grundgesamtheit', summary: 'Was wenige Messungen über alle möglichen Werte verraten.' },
      en: { title: 'Sample and population', summary: 'What a few measurements reveal about all possible values.' },
      prerequisites: ['variation'],
      content: sampling,
    },
    {
      id: 'sampling-distribution',
      de: { title: 'Stichprobenverteilung und Grenzwertsatz', summary: 'Warum Mittelwerte sich anders verhalten als Einzelwerte.' },
      en: { title: 'Sampling distribution and the central limit theorem', summary: 'Why means behave differently from individual values.' },
      prerequisites: ['sampling'],
      content: samplingDistribution,
    },
    {
      id: 'confidence-interval',
      de: { title: 'Konfidenzintervall', summary: 'Wie genau ein Mittelwert aus einer Stichprobe ist.' },
      en: { title: 'Confidence interval', summary: 'How precise a mean from a sample is.' },
      prerequisites: ['sampling-distribution'],
    },
    {
      id: 'hypothesis-test',
      de: { title: 'Die Idee des Hypothesentests', summary: 'Wann ein Unterschied mehr ist als Zufall.' },
      en: { title: 'The idea of a hypothesis test', summary: 'When a difference is more than chance.' },
      prerequisites: ['confidence-interval'],
    },
    {
      id: 'errors-power',
      de: { title: 'α, β und Power', summary: 'Welche Fehler ein Test machen kann und wie sich ihr Risiko steuern lässt.' },
      en: { title: 'α, β and power', summary: 'Which mistakes a test can make and how to control their risk.' },
      prerequisites: ['hypothesis-test'],
    },
  ],
};
