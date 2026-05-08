# DoE Gold Standard Datasets

Reference values computed in R / Minitab for validation of D.Mike's DoE engine.

## Datasets

### dataset-2k-replicated.json
2^2 factorial design with 1 replicate (8 runs total).
- Factors: Temperature (200–300 °C), Pressure (10–20 bar)
- Response: Strength (N/mm²)
- Reference: Hand calculation, verified with R `lm()` and `aov()`

### expected-2k-replicated.json
Expected analysis output: effects, coefficients, R², ANOVA table.
