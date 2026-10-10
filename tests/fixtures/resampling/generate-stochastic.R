# Reference values for the fixture tier "stochastic" (tests/engines/resampling-stochastic.test.js).
# One reference run with B_REF resamples per case, plus RUNS runs at the test's
# B_RUN whose standard deviations (mcSd) set the Monte-Carlo tolerance.
# Run: devenv shell -- Rscript app/dev/tests/fixtures/resampling/generate-stochastic.R
# Or (no devenv, from the worktree root): docker run --rm --user 1000:1000 -e R_LIBS_USER=/tmp/rlib -e HOME=/tmp -v "$PWD/app/dev:/work" -w /work rocker/r-ver:4.4.1 sh -c 'mkdir -p /tmp/rlib && Rscript -e "install.packages(c(\"boot\",\"jsonlite\"), lib=\"/tmp/rlib\")" && Rscript tests/fixtures/resampling/generate-stochastic.R'
suppressMessages(library(boot))
script_dir <- local({
  arg <- grep("^--file=", commandArgs(trailingOnly = FALSE), value = TRUE)
  dirname(normalizePath(sub("^--file=", "", arg[1])))
})
write_fixture <- function(obj, name) {
  writeLines(jsonlite::toJSON(obj, auto_unbox = TRUE, digits = I(17), pretty = TRUE),
             file.path(script_dir, name))
}
SEED <- 20261010
set.seed(SEED)
B_REF <- 200000
B_RUN <- 10000
RUNS <- 50
no_params <- setNames(list(), character(0))

worksheets_dir <- file.path(script_dir, "..", "..", "..", "examples", "worksheets")
read_column <- function(file, column_id) {
  ws <- jsonlite::fromJSON(file.path(worksheets_dir, file), simplifyVector = FALSE)
  for (sheet in ws$sheets) for (col in sheet$state$columns) {
    if (identical(col$id, column_id)) {
      v <- suppressWarnings(as.numeric(unlist(col$values)))
      return(v[is.finite(v)])
    }
  }
  stop("column not found: ", column_id)
}
bolzen <- read_column("outlier-bolzen-grubbs.json", "c-durchmesser")
pizza_a <- read_column("hypothesis-pizza-fahrer.json", "c-fahrer-a")
pizza_b <- read_column("hypothesis-pizza-fahrer.json", "c-fahrer-b")

boot_one <- function(x, f, R) boot(x, function(d, i) f(d[i]), R = R)
boot_two <- function(x, y, f, R) {
  d <- data.frame(v = c(x, y), g = rep(1:2, c(length(x), length(y))))
  boot(d, function(dd, i) { s <- dd[i, ]; f(s$v[s$g == 1]) - f(s$v[s$g == 2]) },
       R = R, strata = d$g)
}
summarize_run <- function(b, conf) {
  L <- empinf(b, type = "jack")
  ci <- boot.ci(b, conf = conf, type = c("perc", "bca"), L = L)
  c(se = sd(b$t[, 1]),
    perc_lo = ci$percent[1, 4], perc_hi = ci$percent[1, 5],
    bca_lo = ci$bca[1, 4], bca_hi = ci$bca[1, 5])
}

ci_case <- function(id, kind, statistic, f, conf, x, y = NULL) {
  run <- function(R) if (kind == "one") boot_one(x, f, R) else boot_two(x, y, f, R)
  ref_boot <- run(B_REF)
  ref <- summarize_run(ref_boot, conf)
  runs <- t(replicate(RUNS, summarize_run(run(B_RUN), conf)))
  sds <- apply(runs, 2, sd)
  # signif() removes floating-point noise from differences of equal values.
  distinct <- sort(unique(signif(ref_boot$t[, 1], 10)))
  resolution <- if (length(distinct) > 1) min(diff(distinct)) else 0
  case <- list(
    id = id, tier = "stochastic", kind = kind,
    statistic = list(id = statistic, params = no_params), confidence = conf,
    Bref = B_REF, Brun = B_RUN, runs = RUNS,
    reference = list(estimate = unname(ref_boot$t0), se = unname(ref["se"]),
                     percentile = unname(ref[c("perc_lo", "perc_hi")]),
                     bca = unname(ref[c("bca_lo", "bca_hi")])),
    mcSd = list(se = unname(sds["se"]),
                percentile = unname(sds[c("perc_lo", "perc_hi")]),
                bca = unname(sds[c("bca_lo", "bca_hi")])),
    resolution = resolution)
  if (kind == "one") case$data <- x else { case$x <- x; case$y <- y }
  case
}

# Same tie rule as the engine (js/engines/resampling-engine.js `ge`).
ge <- function(a, b) a >= b - 1e-10 * pmax(1, abs(b))
perm_case <- function(id, x, y, f) {
  pooled <- c(x, y)
  n1 <- length(x)
  t0 <- f(x) - f(y)
  t_star <- replicate(B_REF, {
    idx <- sample.int(length(pooled), n1)
    f(pooled[idx]) - f(pooled[-idx])
  })
  hits <- sum(ge(abs(t_star), abs(t0)))
  list(id = id, tier = "stochastic", kind = "permutationTwo",
       statistic = list(id = "mean", params = no_params),
       contrast = "difference", direction = "two-sided",
       x = x, y = y, Bref = B_REF,
       reference = list(observed = t0, pValue = (1 + hits) / (B_REF + 1)))
}

cases <- list(
  ci_case("bolzen-mean-one", "one", "mean", mean, 0.95, bolzen),
  ci_case("pizza-median-two", "two", "median", median, 0.95, pizza_a, pizza_b),
  perm_case("pizza-mean-perm", pizza_a, pizza_b, mean)
)
write_fixture(list(seed = SEED, cases = cases), "stochastic.json")
cat("stochastic.json:", length(cases), "cases\n")
