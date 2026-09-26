# Capability — piston rings

`dataset-pistonrings.json` holds the inside diameters of forged piston rings from
Montgomery, *Introduction to Statistical Quality Control*, Table 6.3. The same
data ship with the R package `qcc` as `pistonrings`. The file keeps the first
25 subgroups of 5 (the `trial = TRUE` rows), with LSL 73.95 mm and USL 74.05 mm.

`expected-pistonrings.json` was recomputed with numpy/scipy:

| Block | σ estimator | Used for |
|---|---|---|
| `withinPooled` | pooled SD / c4(d + 1), d = Σ(nᵢ − 1) | Cp/Cpk with subgroups (Minitab default) |
| `withinMovingRange` | MR̄ / 1.128, all 125 values in order | Cp/Cpk for individuals (Minitab default for n = 1) |
| `withinRbar` | R̄ / d2(5) = R̄ / 2.326 | Cp/Cpk of the X̄-R control chart |
| `overall` | sample SD, n − 1 | Pp/Ppk |

The pooled values match the published `qcc::process.capability` output for this
dataset (StdDev 0.009887547, Cp 1.686, Cpk 1.646), which is kept under
`published_qcc` as an independent check.
