#!/usr/bin/env Rscript

# Generic R analysis helper for the Statistics Navigator MVP.
# The Python backend writes a clean CSV and calls this script for analyses that
# are better handled by R: ANOVA and linear mixed-effects models.

args <- commandArgs(trailingOnly = TRUE)
if (length(args) < 9) {
  stop("Usage: Rscript statnav_r_analysis.R analysis_type input_csv out_dir outcome group factor2 predictor subject time", call. = FALSE)
}

analysis_type <- args[[1]]
input_csv <- args[[2]]
out_dir <- args[[3]]
outcome <- args[[4]]
group <- args[[5]]
factor2 <- args[[6]]
predictor <- args[[7]]
subject <- args[[8]]
time_col <- args[[9]]

dir.create(out_dir, recursive = TRUE, showWarnings = FALSE)

warnings_file <- file.path(out_dir, "r_warnings.txt")
writeLines(character(0), warnings_file)

append_warning <- function(message) {
  cat(message, "\n", file = warnings_file, append = TRUE)
}

safe_name <- function(value) {
  out <- gsub("[^A-Za-z0-9_]+", "_", value)
  out <- gsub("^_+|_+$", "", out)
  if (nchar(out) == 0) out <- "output"
  out
}

bt <- function(value) {
  paste0("`", gsub("`", "", value, fixed = TRUE), "`")
}

write_table <- function(name, table) {
  df <- as.data.frame(table, stringsAsFactors = FALSE)
  if (!is.null(rownames(df)) && any(rownames(df) != seq_len(nrow(df)))) {
    df <- cbind(term = rownames(df), df)
    rownames(df) <- NULL
  }
  write.csv(df, file.path(out_dir, paste0("table_", safe_name(name), ".csv")), row.names = FALSE, na = "")
}

df <- read.csv(input_csv, check.names = FALSE, stringsAsFactors = FALSE)

if (!outcome %in% names(df)) {
  stop("Outcome column not found: ", outcome, call. = FALSE)
}

df[[outcome]] <- suppressWarnings(as.numeric(df[[outcome]]))
df <- df[!is.na(df[[outcome]]), , drop = FALSE]

if (nrow(df) < 3) {
  stop("Not enough complete observations for R analysis.", call. = FALSE)
}

if (nzchar(group) && group %in% names(df)) {
  df[[group]] <- as.factor(df[[group]])
}

if (nzchar(factor2) && factor2 %in% names(df)) {
  df[[factor2]] <- as.factor(df[[factor2]])
}

if (nzchar(subject) && subject %in% names(df)) {
  df[[subject]] <- as.factor(df[[subject]])
}

if (nzchar(time_col) && time_col %in% names(df)) {
  numeric_time <- suppressWarnings(as.numeric(df[[time_col]]))
  if (mean(!is.na(numeric_time)) >= 0.8) {
    df[[time_col]] <- numeric_time
  } else {
    df[[time_col]] <- as.factor(df[[time_col]])
    append_warning(paste("Time/session column", time_col, "was treated as categorical because it was not mostly numeric."))
  }
}

if (analysis_type == "one_way_anova") {
  if (!nzchar(group) || !group %in% names(df)) {
    stop("One-way ANOVA requires a group column.", call. = FALSE)
  }
  formula <- as.formula(paste(bt(outcome), "~", bt(group)))
  fit <- aov(formula, data = df)
  anova_df <- as.data.frame(summary(fit)[[1]])
  write_table("anova", anova_df)
  write_table("model_coefficients", coef(summary.lm(fit)))
  if (length(levels(df[[group]])) > 2) {
    tukey <- tryCatch(TukeyHSD(fit), error = function(e) e)
    if (!inherits(tukey, "error") && group %in% names(tukey)) {
      write_table("tukey_posthoc", tukey[[group]])
    } else if (inherits(tukey, "error")) {
      append_warning(conditionMessage(tukey))
    }
  }
} else if (analysis_type == "two_way_anova") {
  if (!nzchar(group) || !group %in% names(df) || !nzchar(factor2) || !factor2 %in% names(df)) {
    stop("Two-way ANOVA requires two factor columns.", call. = FALSE)
  }
  formula <- as.formula(paste(bt(outcome), "~", bt(group), "*", bt(factor2)))
  fit <- aov(formula, data = df)
  write_table("anova", as.data.frame(summary(fit)[[1]]))
  write_table("model_coefficients", coef(summary.lm(fit)))
} else if (analysis_type == "linear_mixed_effects_model") {
  required_packages <- c("lme4", "lmerTest", "emmeans")
  missing_packages <- required_packages[!vapply(required_packages, requireNamespace, logical(1), quietly = TRUE)]
  if (length(missing_packages) > 0) {
    stop("Missing required R packages: ", paste(missing_packages, collapse = ", "), call. = FALSE)
  }
  suppressPackageStartupMessages({
    library(lme4)
    library(lmerTest)
    library(emmeans)
  })
  emmeans::emm_options(lmer.df = "satterthwaite")

  if (!nzchar(group) || !group %in% names(df) || !nzchar(subject) || !subject %in% names(df) || !nzchar(time_col) || !time_col %in% names(df)) {
    stop("Mixed-effects model requires group, subject, and time columns.", call. = FALSE)
  }

  formula <- as.formula(paste(bt(outcome), "~", bt(group), "*", bt(time_col), "+ (1 |", bt(subject), ")"))
  fit <- tryCatch(
    withCallingHandlers(
      lmerTest::lmer(formula, data = df, REML = FALSE),
      warning = function(w) {
        append_warning(conditionMessage(w))
        invokeRestart("muffleWarning")
      }
    ),
    error = function(e) e
  )
  if (inherits(fit, "error")) {
    stop(conditionMessage(fit), call. = FALSE)
  }

  write_table("anova_fixed_effects", as.data.frame(anova(fit)))
  write_table("model_coefficients", coef(summary(fit)))
  variance_df <- as.data.frame(VarCorr(fit))
  write_table("random_effect_variance", variance_df)

  if (is.numeric(df[[time_col]])) {
    trend_result <- tryCatch(emmeans::emtrends(fit, specs = as.formula(paste("~", bt(group))), var = time_col), error = function(e) e)
    if (!inherits(trend_result, "error")) {
      write_table("slopes_per_group", as.data.frame(summary(trend_result)))
      comparisons <- tryCatch(pairs(trend_result), error = function(e) e)
      if (!inherits(comparisons, "error")) {
        write_table("pairwise_slope_comparisons", as.data.frame(summary(comparisons)))
      } else {
        append_warning(conditionMessage(comparisons))
      }
    } else {
      append_warning(conditionMessage(trend_result))
    }
  }
} else {
  stop("Unsupported R analysis type: ", analysis_type, call. = FALSE)
}
