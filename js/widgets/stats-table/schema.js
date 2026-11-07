/** Kennzahlentabelle je Reihe (Ergebnis von computeSeriesStats). */
import { defineWidget, list, object, text, number } from '../../core/model.js';

const n = number({ nullable: true });
const STATS = { n, mean: n, stddev: n, variance: n, seMean: n, median: n, min: n, max: n, range: n, q1: n, q3: n, skewness: n, kurtosis: n };
const interval = list(n, { optional: true });

export default defineWidget({
  name: 'stats-table',
  props: {
    rows: list(object({
      name: text(),
      color: text({ nullable: true, optional: true }),
      stats: object(STATS, { nullable: true }),
      ci: object({ mean: interval, variance: interval, stddev: interval }),
    })),
    confLevel: number({ exclusiveMin: 0, exclusiveMax: 100 }),
  },
});
