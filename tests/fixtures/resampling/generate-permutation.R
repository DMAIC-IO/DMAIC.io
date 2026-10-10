# Exact permutation p-values by full enumeration, cross-checked with coin and anova.
# Run: devenv shell -- Rscript app/dev/tests/fixtures/resampling/generate-permutation.R
# Or (no devenv, from the worktree root): docker run --rm --user 1000:1000 -e R_LIBS_USER=/tmp/rlib -e HOME=/tmp -v "$PWD/app/dev:/work" -w /work rocker/r-ver:4.4.1 sh -c 'mkdir -p /tmp/rlib && Rscript -e "install.packages(c(\"coin\",\"jsonlite\"), lib=\"/tmp/rlib\")" && Rscript tests/fixtures/resampling/generate-permutation.R'
suppressMessages(library(coin))
script_dir <- local({
  arg <- grep("^--file=", commandArgs(trailingOnly = FALSE), value = TRUE)
  dirname(normalizePath(sub("^--file=", "", arg[1])))
})
write_fixture <- function(obj, name) {
  writeLines(jsonlite::toJSON(obj, auto_unbox = TRUE, digits = I(17), pretty = TRUE),
             file.path(script_dir, name))
}
# Same tolerance rule as the engine's ge().
ge <- function(a, b) a >= b - 1e-10 * pmax(1, abs(b))
hits_for <- function(Ts, T0, direction) switch(direction,
  "two-sided" = ge(abs(Ts), abs(T0)), greater = ge(Ts, T0), less = ge(-Ts, -T0))
stat_fn <- function(id) switch(id, mean = mean, median = median, stop("unknown ", id))

perm_two <- function(id, x, y, statistic, direction, contrast = "difference") {
  f <- stat_fn(statistic); pooled <- c(x, y); n1 <- length(x)
  Tfun <- function(a, b) if (contrast == "ratio") log(f(a)) - log(f(b)) else f(a) - f(b)
  T0 <- Tfun(x, y)
  cmb <- combn(length(pooled), n1)
  Ts <- apply(cmb, 2, function(ix) Tfun(pooled[ix], pooled[-ix]))
  h <- hits_for(Ts, T0, direction)
  list(id = id, statistic = statistic, contrast = contrast, direction = direction,
       x = x, y = y, observed = T0, total = ncol(cmb), count = sum(h), pValue = mean(h))
}
perm_paired <- function(id, x, y, statistic, direction) {
  f <- stat_fn(statistic); d <- x - y
  signs <- as.matrix(expand.grid(rep(list(c(1, -1)), length(d))))
  Ts <- apply(signs, 1, function(s) f(s * d))
  T0 <- f(d)
  h <- hits_for(Ts, T0, direction)
  list(id = id, statistic = statistic, direction = direction, x = x, y = y,
       observed = T0, total = nrow(signs), count = sum(h), pValue = mean(h))
}
perm_k <- function(id, groups, statistic) {
  f <- stat_fn(statistic); pooled <- unlist(groups); sizes <- lengths(groups)
  theta <- f(pooled)
  Tfun <- function(gs) sum(lengths(gs) * (sapply(gs, f) - theta)^2)
  T0 <- Tfun(groups)
  idx <- seq_along(pooled); Ts <- numeric(0)
  c1 <- combn(idx, sizes[1])
  for (a in seq_len(ncol(c1))) {
    rest <- setdiff(idx, c1[, a])
    c2 <- combn(rest, sizes[2])
    for (b in seq_len(ncol(c2))) {
      g3 <- setdiff(rest, c2[, b])
      Ts <- c(Ts, Tfun(list(pooled[c1[, a]], pooled[c2[, b]], pooled[g3])))
    }
  }
  h <- ge(Ts, T0)
  out <- list(id = id, statistic = statistic, groups = groups,
              observed = T0, total = length(Ts), count = sum(h), pValue = mean(h))
  if (statistic == "mean") {
    g <- factor(rep(seq_along(groups), sizes))
    ssb <- anova(lm(pooled ~ g))[1, "Sum Sq"]
    stopifnot(abs(ssb - T0) < 1e-9)
    out$ssb <- ssb
  }
  out
}

x2 <- c(22.1, 25.3, 19.8, 24.0, 21.5)
y2 <- c(26.2, 27.9, 23.4, 28.8, 25.1, 26.7)
before <- c(42.1, 38.5, 45.0, 51.2, 39.8, 47.3, 44.6, 40.2)
after <- c(36.4, 35.9, 39.2, 44.8, 37.1, 40.5, 41.0, 36.7)
groups3 <- list(c(22.1, 25.3, 19.8), c(26.2, 27.9, 23.4), c(24.0, 21.5, 28.8, 25.1))

two <- list(
  perm_two("two-mean-two-sided", x2, y2, "mean", "two-sided"),
  perm_two("two-mean-greater", x2, y2, "mean", "greater"),
  perm_two("two-mean-less", x2, y2, "mean", "less"),
  perm_two("two-median-two-sided", x2, y2, "median", "two-sided"),
  perm_two("two-mean-ratio", x2, y2, "mean", "two-sided", "ratio")
)
# Cross-check the enumeration against coin's exact two-sample test.
d2 <- data.frame(v = c(x2, y2), g = factor(rep(1:2, c(length(x2), length(y2)))))
p_coin <- as.numeric(pvalue(oneway_test(v ~ g, data = d2,
                                        distribution = exact(algorithm = "split-up"))))
stopifnot(abs(p_coin - two[[1]]$pValue) < 1e-6)

paired <- list(
  perm_paired("paired-mean-two-sided", before, after, "mean", "two-sided"),
  perm_paired("paired-median-greater", before, after, "median", "greater"),
  perm_paired("paired-mean-less", before, after, "mean", "less")
)
k <- list(
  perm_k("k-mean", groups3, "mean"),
  perm_k("k-median", groups3, "median")
)
p_raw <- c(0.01, 0.04, 0.03, 0.005, 0.2)
write_fixture(list(two = two, paired = paired, k = k,
                   holm = list(p = p_raw, adjusted = p.adjust(p_raw, method = "holm"))),
              "permutation.json")
cat("permutation.json written\n")
