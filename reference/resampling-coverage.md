# Resampling coverage study

Empirical coverage of nominal 95 % one-sample bootstrap intervals from `app/dev/js/engines/resampling-engine.js`.
Parameters: reps = 1000, B = 2000, n = 20, seed = 20261010.
Monte-Carlo standard error of a coverage near 0.95: ±0.0069.

Regenerate (cwd `app/dev`): `node tools/resampling-coverage/coverage.mjs --reps 1000 --B 2000 --n 20 --seed 20261010 > reference/resampling-coverage.md`

| Distribution | Statistic | Percentile | BCa | BCa fallbacks | No interval |
|---|---|---|---|---|---|
| Normal(0, 1) | mean | 0.911 | 0.914 | 0 | 0 |
| Normal(0, 1) | median | 0.935 | 0.933 | 0 | 0 |
| Normal(0, 1) | stddev | 0.827 | 0.890 | 0 | 0 |
| Lognormal(0, 1) | mean | 0.844 | 0.860 | 0 | 0 |
| Lognormal(0, 1) | median | 0.933 | 0.935 | 0 | 0 |
| Lognormal(0, 1) | stddev | 0.470 | 0.576 | 0 | 0 |
| Exponential(1) | mean | 0.897 | 0.902 | 0 | 0 |
| Exponential(1) | median | 0.933 | 0.935 | 0 | 0 |
| Exponential(1) | stddev | 0.684 | 0.769 | 0 | 0 |

Bootstrap intervals for small n undercover, most for skewed distributions and for the
standard deviation; BCa usually recovers part of the gap. This is expected behaviour of
the methods (Efron & Tibshirani 1993, ch. 14), not an engine defect.

Coverage values within about 2 Monte Carlo standard errors of the theoretical coverage are
sampling noise; for the normal mean at n = 20 theory gives about 0.929.
