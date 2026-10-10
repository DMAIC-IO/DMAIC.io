# Reference values for js/engines/resampling-statistics.js.
# Run: devenv shell -- Rscript app/dev/tests/fixtures/resampling/generate-statistics.R
# Or (no devenv, from the worktree root): docker run --rm --user 1000:1000 -e R_LIBS_USER=/tmp/rlib -e HOME=/tmp -v "$PWD/app/dev:/work" -w /work rocker/r-ver:4.4.1 sh -c 'mkdir -p /tmp/rlib && Rscript -e "install.packages(c(\"coin\",\"jsonlite\"), lib=\"/tmp/rlib\")" && Rscript tests/fixtures/resampling/generate-statistics.R'
script_dir <- local({
  arg <- grep("^--file=", commandArgs(trailingOnly = FALSE), value = TRUE)
  dirname(normalizePath(sub("^--file=", "", arg[1])))
})
write_fixture <- function(obj, name) {
  # digits = I(17): 17 significant digits round-trip every double exactly.
  writeLines(jsonlite::toJSON(obj, auto_unbox = TRUE, digits = I(17), pretty = TRUE),
             file.path(script_dir, name))
}

ppk <- function(x, lsl = NA, usl = NA) {
  m <- mean(x); s <- sd(x)
  ppu <- if (is.na(usl)) NA else (usl - m) / (3 * s)
  ppl <- if (is.na(lsl)) NA else (m - lsl) / (3 * s)
  min(c(ppu, ppl), na.rm = TRUE)
}

datasets <- list(
  odd15 = c(9.98, 10.02, 10.05, 9.95, 10.01, 9.99, 10.03, 10.07, 9.96, 10.00,
            10.04, 9.97, 10.02, 10.06, 9.94),
  even12 = c(42.1, 38.5, 45.0, 51.2, 39.8, 47.3, 44.6, 40.2, 49.9, 43.7, 46.1, 41.5),
  ties10 = c(3, 1, 4, 1, 5, 9, 2, 6, 5, 3),
  skew20 = round(qexp(ppoints(20), rate = 0.5), 6)
)

no_params <- setNames(list(), character(0))  # serializes as {}
cases <- list()
add <- function(nm, id, params, value) {
  cases[[length(cases) + 1]] <<- list(dataset = nm, id = id, params = params, value = value)
}
for (nm in names(datasets)) {
  x <- datasets[[nm]]
  add(nm, "mean", no_params, mean(x))
  add(nm, "median", no_params, median(x))
  add(nm, "stddev", no_params, sd(x))
  add(nm, "variance", no_params, var(x))
  add(nm, "cv", no_params, sd(x) / mean(x))
  for (tr in c(0, 0.1, 0.2, 0.25, 0.5)) add(nm, "trimmedMean", list(trim = tr), mean(x, trim = tr))
  for (p in c(0.05, 0.25, 0.5, 0.9, 0.95)) add(nm, "quantile", list(p = p), unname(quantile(x, p, type = 7)))
  lsl <- min(x) - sd(x); usl <- max(x) + sd(x)
  add(nm, "ppk", list(lsl = lsl, usl = usl), ppk(x, lsl, usl))
  add(nm, "ppk", list(lsl = lsl), ppk(x, lsl = lsl))
  add(nm, "ppk", list(usl = usl), ppk(x, usl = usl))
}
write_fixture(list(datasets = datasets, cases = cases), "statistics.json")
cat("statistics.json:", length(cases), "cases\n")
