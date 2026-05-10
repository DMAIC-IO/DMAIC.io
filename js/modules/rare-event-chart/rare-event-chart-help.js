/**
 * D.Mike — Rare-Event Chart Module Handbook (rare-event-chart-help.js)
 */

export default {
  moduleId: 'rare-event-chart',
  sections: {
    overview: {
      de: {
        title: 'Regelkarten für seltene Ereignisse',
        blocks: [
          {
            type: 'paragraph',
            content: 'Bei seltenen Ereignissen (Unfälle, Werkzeugbrüche, Defekte mit niedriger Rate) sind Shewhart-Karten und attributive Karten unbrauchbar — sie würden tagelang Nullen zeigen, dann einen einzelnen Sprung, der wie ein Ausreißer aussieht. Spezialisierte Karten kommen mit der zugrundeliegenden Verteilung klar.',
          },
          {
            type: 'definition',
            term: 'g-Karte (Gelegenheiten zwischen Ereignissen)',
            content: 'Plottet die Anzahl der Einheiten oder Tage zwischen zwei aufeinanderfolgenden Ereignissen. Geometrische Verteilung. Eingriffsgrenzen nach Benneyan: CL = ḡ, UCL/LCL = ḡ ± 3·√(ḡ·(ḡ+1)).',
          },
          {
            type: 'definition',
            term: 't-Karte (Zeit zwischen Ereignissen)',
            content: 'Plottet die Zeitspanne zwischen Ereignissen (kontinuierlich, exponentialverteilt). Zur Auswertung wird die Zeitachse transformiert: y = t^(1/3.6) (Nelson 1994). Auf y werden I-MR-Limits gerechnet, die KPI-Anzeige rück-transformiert sie wieder auf die Originalskala.',
          },
          {
            type: 'paragraph',
            content: 'Beide Karten haben üblicherweise eine LCL nahe Null. Wichtige Signale sind Sprünge nach oben (eine außergewöhnlich lange „ruhige" Strecke ist seltener nützlich als eine plötzliche Häufung).',
          },
        ],
      },
      en: {
        title: 'Control Charts for Rare Events',
        blocks: [
          {
            type: 'paragraph',
            content: 'For rare events (accidents, tool breaks, low-rate defects) Shewhart and attribute charts are useless — they would show zeros for days then one isolated jump that looks like an outlier. Specialised charts handle the underlying distribution properly.',
          },
          {
            type: 'definition',
            term: 'g chart (opportunities between events)',
            content: 'Plots the number of units or days between two consecutive events. Geometric distribution. Limits per Benneyan: CL = ḡ, UCL/LCL = ḡ ± 3·√(ḡ·(ḡ+1)).',
          },
          {
            type: 'definition',
            term: 't chart (time between events)',
            content: 'Plots the time between events (continuous, exponentially distributed). The time axis is transformed: y = t^(1/3.6) (Nelson 1994). I-MR limits are computed on y; the KPI strip back-transforms them to the original scale.',
          },
          {
            type: 'paragraph',
            content: 'Both charts typically have an LCL near zero. The actionable signals are upward jumps (a long quiet stretch is rarely as useful as a sudden cluster).',
          },
        ],
      },
    },

    pitfalls: {
      de: {
        title: 'Stolperfallen',
        blocks: [
          { type: 'definition', term: 'Falsche Datenart', content: 'Die g-Karte braucht Zähldaten zwischen Ereignissen, die t-Karte braucht echte Zeitdauern. Bei Verwechslung sind die Limits unsinnig.' },
          { type: 'definition', term: 'Zu wenige Ereignisse', content: 'Mit weniger als ~20 Beobachtungen schwankt ḡ stark, die Limits sind dann nicht belastbar. Klassische SPC-Faustregel von 25–30 Punkten gilt auch hier.' },
          { type: 'definition', term: 'Nicht-stationäre Rate', content: 'Beide Karten setzen voraus, dass die Ereignisrate konstant ist. Bei klar wachsender Rate (z. B. nach Werkzeugverschleiß) erst aufteilen, dann Karten je Stage rechnen.' },
        ],
      },
      en: {
        title: 'Pitfalls',
        blocks: [
          { type: 'definition', term: 'Wrong data type', content: 'The g chart needs counts between events; the t chart needs actual time durations. Mixing them yields nonsense limits.' },
          { type: 'definition', term: 'Too few events', content: 'With fewer than ~20 observations ḡ fluctuates strongly and the limits are unreliable. Classic 25–30-point SPC rule applies here too.' },
          { type: 'definition', term: 'Non-stationary rate', content: 'Both charts assume the event rate is constant. With a clearly increasing rate (e.g. after tool wear) split the data first and run separate charts.' },
        ],
      },
    },
  },
};
