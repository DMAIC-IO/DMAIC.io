# Reference intervals for js/engines/resampling-intervals.js (R package boot).
# boot.ci gets L = empinf(type = "jack") explicitly; without it boot.ci estimates
# influence values by regression and the BCa acceleration would differ.
# Run: devenv shell -- Rscript app/dev/tests/fixtures/resampling/generate-intervals.R
# Or (no devenv, from the worktree root): docker run --rm --user 1000:1000 -e R_LIBS_USER=/tmp/rlib -e HOME=/tmp -v "$PWD/app/dev:/work" -w /work rocker/r-ver:4.4.1 sh -c 'mkdir -p /tmp/rlib && Rscript -e "install.packages(c(\"coin\",\"jsonlite\"), lib=\"/tmp/rlib\")" && Rscript tests/fixtures/resampling/generate-intervals.R'
suppressMessages(library(boot))
script_dir <- local({
  arg <- grep("^--file=", commandArgs(trailingOnly = FALSE), value = TRUE)
  dirname(normalizePath(sub("^--file=", "", arg[1])))
})
write_fixture <- function(obj, name) {
  writeLines(jsonlite::toJSON(obj, auto_unbox = TRUE, digits = I(17), pretty = TRUE),
             file.path(script_dir, name))
}
SEED <- 20261009
set.seed(SEED)

ppk <- function(x, lsl = NA, usl = NA) {
  m <- mean(x); s <- sd(x)
  ppu <- if (is.na(usl)) NA else (usl - m) / (3 * s)
  ppl <- if (is.na(lsl)) NA else (m - lsl) / (3 * s)
  min(c(ppu, ppl), na.rm = TRUE)
}
stat_fn <- function(id, params) switch(id,
  mean = function(v) mean(v),
  median = function(v) median(v),
  trimmedMean = function(v) mean(v, trim = params$trim),
  ppk = function(v) ppk(v, params$lsl, params$usl),
  stop("unknown statistic ", id))

odd15 <- c(9.98, 10.02, 10.05, 9.95, 10.01, 9.99, 10.03, 10.07, 9.96, 10.00,
           10.04, 9.97, 10.02, 10.06, 9.94)
before <- c(42.1, 38.5, 45.0, 51.2, 39.8, 47.3, 44.6, 40.2, 49.9, 43.7, 46.1, 41.5)
after <- c(36.4, 35.9, 39.2, 44.8, 37.1, 40.5, 41.0, 36.7, 42.3, 40.9, 39.8, 38.2)
skew20 <- round(qexp(ppoints(20), rate = 0.5), 6)
no_params <- setNames(list(), character(0))

one_case <- function(id, data, statistic, params, B, conf) {
  f <- stat_fn(statistic, params)
  b <- boot(data, function(d, i) f(d[i]), R = B)
  L <- empinf(b, type = "jack")
  ci <- boot.ci(b, conf = conf, type = c("perc", "bca"), L = L)
  list(id = id, kind = "one", statistic = list(id = statistic, params = params),
       B = B, confidence = conf, data = data, t0 = unname(b$t0), t = as.vector(b$t),
       L = as.vector(L), percentile = unname(ci$percent[1, 4:5]), bca = unname(ci$bca[1, 4:5]))
}
two_case <- function(id, x, y, statistic, params, B, conf) {
  f <- stat_fn(statistic, params)
  d <- data.frame(v = c(x, y), g = rep(1:2, c(length(x), length(y))))
  b <- boot(d, function(dd, i) { s <- dd[i, ]; f(s$v[s$g == 1]) - f(s$v[s$g == 2]) },
            R = B, strata = d$g)
  L <- empinf(b, type = "jack")
  ci <- boot.ci(b, conf = conf, type = c("perc", "bca"), L = L)
  list(id = id, kind = "two", statistic = list(id = statistic, params = params),
       B = B, confidence = conf, x = x, y = y, t0 = unname(b$t0), t = as.vector(b$t),
       L = as.vector(L), percentile = unname(ci$percent[1, 4:5]), bca = unname(ci$bca[1, 4:5]))
}

cases <- list(
  one_case("one-mean-1999", odd15, "mean", no_params, 1999, 0.95),
  one_case("one-median-2000", before, "median", no_params, 2000, 0.90),
  one_case("one-trimmed-1999", skew20, "trimmedMean", list(trim = 0.1), 1999, 0.95),
  one_case("one-ppk-2000", odd15, "ppk", list(lsl = 9.85, usl = 10.15), 2000, 0.95),
  two_case("two-mean-1999", before, after, "mean", no_params, 1999, 0.95),
  two_case("two-median-2000", before, after, "median", no_params, 2000, 0.99)
)
write_fixture(list(seed = SEED, cases = cases), "intervals.json")
cat("intervals.json:", length(cases), "cases\n")
