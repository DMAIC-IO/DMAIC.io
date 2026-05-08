# Gold Standards

Reference datasets for statistical validation.
Each module with computational logic has a corresponding folder here.

## Structure

```
gold-standards/
├── t-test/
│   ├── dataset-01.json    # Input data
│   └── expected-01.json   # Expected output (from Minitab / R / NIST)
├── anova/
└── ...
```

## Sources

- **NIST Statistical Reference Datasets**: https://www.itl.nist.gov/div898/strd/
- **Minitab**: Reference calculations run in Minitab 21
- **R**: Cross-checked using standard R packages (stats, car)

## Adding a New Gold Standard

1. Create a folder named after the statistical test
2. Add `dataset-NN.json` with the input data
3. Add `expected-NN.json` with the expected results (all significant values)
4. Document the source and any assumptions in a `README.md` inside the folder
5. Write a test in `tests/modules/<module>.test.js` that loads the dataset and verifies the output
