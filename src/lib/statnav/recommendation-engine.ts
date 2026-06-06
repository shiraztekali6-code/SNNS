import type {
  ColumnProfile,
  QuestionnaireAnswers,
  RecommendationEngineInput,
  StatRecommendation,
  TableProfile
} from "./types";

const COMMON_OUTPUT_PLAN = [
  "Clean the analysis table using only the mapped outcome/design columns.",
  "Report the model/test statistic, p-values, confidence intervals where available, and a plain-language interpretation.",
  "Generate a graph that matches the design rather than only the test name."
];

function getColumn(profile: TableProfile, name?: string): ColumnProfile | undefined {
  if (!name) return undefined;
  return profile.columnProfiles.find((column) => column.name === name);
}

function levelCount(profile: TableProfile, name?: string): number {
  const column = getColumn(profile, name);
  return column?.categoricalSummary?.levelCount ?? column?.uniqueValues ?? 0;
}

function hasType(column: ColumnProfile | undefined, type: string): boolean {
  return Boolean(column?.detectedTypes.includes(type as never));
}

function isContinuous(profile: TableProfile, name?: string): boolean {
  const column = getColumn(profile, name);
  return hasType(column, "numeric_continuous") || hasType(column, "count_like");
}

function isBinary(profile: TableProfile, name?: string): boolean {
  return hasType(getColumn(profile, name), "binary");
}

function isCategorical(profile: TableProfile, name?: string): boolean {
  const column = getColumn(profile, name);
  return hasType(column, "categorical") || hasType(column, "binary") || hasType(column, "group_treatment_like");
}

function compact<T>(items: Array<T | false | null | undefined>): T[] {
  return items.filter(Boolean) as T[];
}

function baseWarnings(profile: TableProfile, answers: QuestionnaireAnswers): string[] {
  const warnings = [...profile.warnings];

  if (profile.missingCells > 0) {
    warnings.push(
      `The uploaded table contains ${profile.missingCells.toLocaleString()} missing cells; the analysis runner will omit rows missing required mapped columns.`
    );
  }

  if (answers.replicateType === "technical") {
    warnings.push(
      "You marked the replicates as technical. Technical replicates should usually be summarized or modeled within the biological unit, not treated as independent samples."
    );
  } else if (answers.replicateType === "unknown") {
    warnings.push(
      "This recommendation depends on whether the replicates are biological or technical; please clarify before treating rows as independent."
    );
  }

  if (answers.repeatedMeasures === "unsure" || answers.pairedDesign === "unsure") {
    warnings.push(
      "The design is ambiguous. The app can suggest a path, but paired/repeated structure should be confirmed before final reporting."
    );
  }

  if (profile.rows < 12) {
    warnings.push("n is very small; interpret p-values as exploratory and inspect the raw points.");
  }

  warnings.push("This app provides statistical guidance, not a replacement for a statistician.");

  return Array.from(new Set(warnings));
}

function explain({
  recommendation,
  outcome,
  group,
  time,
  subject
}: {
  recommendation: string;
  outcome?: string;
  group?: string;
  time?: string;
  subject?: string;
}): string {
  const parts = [
    `The rule engine recommends ${recommendation} because the mapped outcome${outcome ? ` (${outcome})` : ""} and design answers point to that family of analysis.`
  ];

  if (group) {
    parts.push(`The group/treatment column (${group}) is used to compare conditions.`);
  }

  if (time) {
    parts.push(`The time/session column (${time}) is used to describe change over time.`);
  }

  if (subject) {
    parts.push(
      `The subject/sample ID column (${subject}) tells the model which rows are related, so repeated observations are not treated as independent.`
    );
  }

  parts.push(
    "The explanation layer is intentionally grounded in the rule-engine result; it should clarify the recommendation, not secretly replace it."
  );

  return parts.join(" ");
}

function makeRecommendation(input: {
  id: string;
  recommendedAnalysis: string;
  shortName: string;
  family: StatRecommendation["family"];
  confidence?: StatRecommendation["confidence"];
  formula?: string;
  whyItFits: string[];
  factorMeanings?: StatRecommendation["factorMeanings"];
  assumptions: string[];
  requiredTableFormat?: StatRecommendation["requiredTableFormat"];
  warnings: string[];
  alternatives: string[];
  outputPlan?: string[];
  ruleTrace: string[];
  supportedByRunner?: boolean;
  profile: TableProfile;
  answers: QuestionnaireAnswers;
}): StatRecommendation {
  return {
    id: input.id,
    recommendedAnalysis: input.recommendedAnalysis,
    shortName: input.shortName,
    family: input.family,
    confidence: input.confidence ?? "medium",
    suggestedFormula: input.formula,
    whyItFits: input.whyItFits,
    factorMeanings: input.factorMeanings ?? [],
    assumptions: input.assumptions,
    requiredTableFormat: input.requiredTableFormat ?? "long",
    warnings: input.warnings,
    possibleAlternatives: input.alternatives,
    outputPlan: input.outputPlan ?? COMMON_OUTPUT_PLAN,
    plainLanguageExplanation: explain({
      recommendation: input.recommendedAnalysis,
      outcome: input.answers.outcomeColumn,
      group: input.answers.groupColumn,
      time: input.answers.timeColumn,
      subject: input.answers.subjectIdColumn
    }),
    ruleTrace: input.ruleTrace,
    supportedByRunner: input.supportedByRunner ?? true
  };
}

export function recommendStatisticalAnalysis({
  profile,
  answers
}: RecommendationEngineInput): StatRecommendation {
  const warnings = baseWarnings(profile, answers);
  const outcome = answers.outcomeColumn;
  const group = answers.groupColumn;
  const factor2 = answers.secondaryFactorColumn;
  const predictor = answers.predictorColumn;
  const subject = answers.subjectIdColumn;
  const time = answers.timeColumn;
  const groups = levelCount(profile, group);
  const factor2Levels = levelCount(profile, factor2);
  const repeated =
    answers.repeatedMeasures === "yes" ||
    Boolean(subject && (time || profile.repeatedMeasuresLikely));
  const paired = answers.pairedDesign === "paired";
  const goal = answers.researchGoal ?? "compare_groups";
  const continuousOutcome = isContinuous(profile, outcome);
  const binaryOutcome = isBinary(profile, outcome);
  const categoricalOutcome = isCategorical(profile, outcome);
  const preferNonParametric = answers.preferNonParametric || answers.assumeNormalEnough === "no";
  const ruleTrace = compact([
    outcome && `Outcome column: ${outcome}`,
    continuousOutcome && "Outcome detected as numeric/continuous or count-like.",
    binaryOutcome && "Outcome detected as binary.",
    categoricalOutcome && !continuousOutcome && "Outcome detected as categorical.",
    group && `Group/factor column: ${group} (${groups || "unknown"} levels).`,
    factor2 && `Secondary factor: ${factor2} (${factor2Levels || "unknown"} levels).`,
    time && `Time/session column: ${time}.`,
    subject && `Repeated-unit column: ${subject}.`,
    repeated && "Repeated-measures structure is present or likely.",
    paired && "User indicated paired observations.",
    preferNonParametric && "User requested non-parametric/robust alternative."
  ]);

  if (!outcome) {
    return makeRecommendation({
      id: "needs-outcome",
      recommendedAnalysis: "Need more information",
      shortName: "Clarify outcome",
      family: "unknown",
      confidence: "low",
      whyItFits: ["No outcome column has been selected yet."],
      assumptions: ["Choose the main measurement you want to analyze before choosing a test."],
      requiredTableFormat: profile.tableShape,
      warnings,
      alternatives: ["Select a numeric outcome for t-tests/ANOVA/regression, or a binary outcome for categorical models."],
      ruleTrace,
      supportedByRunner: false,
      profile,
      answers
    });
  }

  if (continuousOutcome && repeated && subject && time) {
    const formula = group
      ? `${outcome} ~ ${group} * ${time} + (1 | ${subject})`
      : `${outcome} ~ ${time} + (1 | ${subject})`;

    return makeRecommendation({
      id: "linear-mixed-effects-model",
      recommendedAnalysis: "Longitudinal Linear Mixed-Effects Model",
      shortName: "Linear mixed-effects model",
      family: "mixed_model",
      confidence: group ? "high" : "medium",
      formula,
      whyItFits: compact([
        `${outcome} is numeric/continuous.`,
        group && `${group} is a categorical group/treatment factor.`,
        `${time} represents time/session/phase.`,
        `${subject} identifies repeated measurements from the same biological unit.`,
        "A random intercept keeps repeated rows from being treated as independent."
      ]),
      factorMeanings: compact([
        group && {
          term: group,
          meaning: "tests overall differences between treatment/group levels."
        },
        {
          term: time,
          meaning: "tests whether the outcome changes over time/session."
        },
        group && {
          term: `${group} x ${time}`,
          meaning: "tests whether groups change differently over time."
        },
        {
          term: `(1 | ${subject})`,
          meaning: `accounts for repeated measurements from the same ${subject}.`
        }
      ] as Array<StatRecommendation["factorMeanings"][number] | false>),
      assumptions: [
        "Rows are in long format: one row per subject/sample per time/session.",
        "Residuals are roughly symmetric for inference; inspect diagnostics for serious violations.",
        "The repeated unit is correctly mapped and represents biological, not merely technical, replication.",
        "The random-intercept structure is a starting point; complex designs may need random slopes or nested effects."
      ],
      requiredTableFormat: "long",
      warnings: compact([
        ...warnings,
        profile.appearsWide && "The table appears wide; convert it to long format before running this model.",
        answers.replicateType !== "biological" &&
          "Mixed models still require the repeated unit to be a meaningful biological/sample unit."
      ]),
      alternatives: [
        "Repeated-measures ANOVA if the design is balanced and simple.",
        "Two-way ANOVA if observations are independent and there is no repeated subject/sample ID.",
        "Generalized mixed model if the outcome is binary/count-like with non-normal residuals."
      ],
      outputPlan: [
        "ANOVA table for fixed effects.",
        "Coefficient/model table.",
        "Estimated trends or time effects where available.",
        "Longitudinal mean +/- SEM graph by group.",
        "Methods and Results draft text."
      ],
      ruleTrace,
      profile,
      answers
    });
  }

  if (continuousOutcome && repeated && paired && groups === 2) {
    const nonParametricName = "Wilcoxon matched-pairs signed-rank test";
    const parametricName = "Paired t-test";
    const selected = preferNonParametric ? nonParametricName : parametricName;

    return makeRecommendation({
      id: preferNonParametric ? "wilcoxon-matched-pairs" : "paired-t-test",
      recommendedAnalysis: selected,
      shortName: selected,
      family: "mean_comparison",
      confidence: "medium",
      whyItFits: [
        `${outcome} is numeric/continuous.`,
        `${group} has two levels.`,
        "The same subject/sample appears in both conditions or timepoints."
      ],
      factorMeanings: [
        { term: outcome, meaning: "the measured response being compared." },
        { term: group ?? "condition", meaning: "the two paired conditions/timepoints." },
        { term: subject ?? "pair ID", meaning: "links each before/after or matched pair." }
      ],
      assumptions: preferNonParametric
        ? [
            "Pairs are correctly matched.",
            "Differences are symmetrically distributed for classic Wilcoxon inference.",
            "Pairs are independent from other pairs."
          ]
        : [
            "Pairs are correctly matched.",
            "Differences are roughly normally distributed.",
            "Pairs are independent from other pairs."
          ],
      warnings,
      alternatives: [
        preferNonParametric ? "Paired t-test if differences are approximately normal." : "Wilcoxon matched-pairs test if normality is doubtful.",
        "Linear mixed-effects model if there are more than two timepoints or additional factors."
      ],
      outputPlan: [
        "Paired difference summary.",
        "Test statistic and p-value.",
        "Paired before/after line plot.",
        "Plain-language before/after interpretation."
      ],
      ruleTrace,
      profile,
      answers
    });
  }

  if (continuousOutcome && goal === "interaction" && group && factor2) {
    return makeRecommendation({
      id: "two-way-anova",
      recommendedAnalysis: "Two-way ANOVA",
      shortName: "Two-way ANOVA",
      family: "anova",
      confidence: repeated ? "low" : "high",
      formula: `${outcome} ~ ${group} * ${factor2}`,
      whyItFits: [
        `${outcome} is numeric/continuous.`,
        `${group} and ${factor2} are categorical factors.`,
        "The research question asks whether the effect of one factor depends on the other."
      ],
      factorMeanings: [
        { term: group, meaning: "main effect for the primary group/treatment factor." },
        { term: factor2, meaning: "main effect for the second factor." },
        { term: `${group} x ${factor2}`, meaning: "interaction: whether factor effects differ across levels." }
      ],
      assumptions: [
        "Observations are independent unless a repeated/nested model is used instead.",
        "Residuals are roughly normally distributed within groups.",
        "Group variances are reasonably similar.",
        "The table is long/tidy with one row per observation."
      ],
      warnings: compact([
        ...warnings,
        repeated && "A two-way ANOVA is not appropriate if the same subject/sample is measured repeatedly; use a mixed model instead."
      ]),
      alternatives: [
        "Linear mixed-effects model if there are repeated or nested observations.",
        "Non-parametric or permutation methods for strong assumption violations.",
        "One-way ANOVA if only one factor is scientifically relevant."
      ],
      ruleTrace,
      profile,
      answers
    });
  }

  if (continuousOutcome && group && groups >= 3) {
    const selected = preferNonParametric ? "Kruskal-Wallis test" : "One-way ANOVA";

    return makeRecommendation({
      id: preferNonParametric ? "kruskal-wallis" : "one-way-anova",
      recommendedAnalysis: selected,
      shortName: selected,
      family: "anova",
      confidence: repeated ? "low" : "high",
      formula: `${outcome} ~ ${group}`,
      whyItFits: [
        `${outcome} is numeric/continuous.`,
        `${group} has ${groups} groups.`,
        "The design is currently mapped as an independent group comparison."
      ],
      factorMeanings: [
        { term: outcome, meaning: "the measured response." },
        { term: group, meaning: "the categorical group/treatment whose means/distributions are compared." }
      ],
      assumptions: preferNonParametric
        ? ["Observations are independent.", "Groups have similarly shaped distributions if interpreting medians."]
        : [
            "Observations are independent.",
            "Residuals are roughly normally distributed within groups.",
            "Group variances are reasonably similar."
          ],
      warnings: compact([
        ...warnings,
        repeated && "Repeated measurements were detected; one-way ANOVA may be invalid unless rows are truly independent."
      ]),
      alternatives: [
        preferNonParametric ? "One-way ANOVA if assumptions are acceptable." : "Kruskal-Wallis test if assumptions are badly violated.",
        "Linear mixed-effects model if the same subject/sample/cage contributes multiple rows.",
        "Two-way ANOVA if another factor must be included."
      ],
      outputPlan: [
        "ANOVA/test table.",
        "Group summary table.",
        "Box/violin plot with individual points.",
        "Methods and Results draft text."
      ],
      ruleTrace,
      supportedByRunner: !preferNonParametric,
      profile,
      answers
    });
  }

  if (continuousOutcome && group && groups === 2) {
    const selected = preferNonParametric ? "Mann-Whitney test" : "Unpaired t-test";

    return makeRecommendation({
      id: preferNonParametric ? "mann-whitney" : "unpaired-t-test",
      recommendedAnalysis: selected,
      shortName: selected,
      family: "mean_comparison",
      confidence: repeated ? "low" : "high",
      whyItFits: [
        `${outcome} is numeric/continuous.`,
        `${group} has two independent groups.`,
        "The current mapping does not require a paired or repeated-measures model."
      ],
      factorMeanings: [
        { term: outcome, meaning: "the measured response." },
        { term: group, meaning: "the two groups being compared." }
      ],
      assumptions: preferNonParametric
        ? ["Observations are independent.", "The test compares distributions; be careful if shapes differ strongly."]
        : [
            "Observations are independent.",
            "Outcome values are roughly normally distributed within each group, or sample size is large enough for robustness.",
            "Welch correction is preferred when variances differ."
          ],
      warnings: compact([
        ...warnings,
        repeated && "Repeated measurements were detected; an unpaired test would overstate independence."
      ]),
      alternatives: [
        preferNonParametric ? "Welch unpaired t-test if the outcome is approximately normal." : "Mann-Whitney test if normality is doubtful.",
        "Paired t-test if rows are matched or before/after.",
        "Linear mixed-effects model if repeated subject/sample IDs exist."
      ],
      outputPlan: [
        "Group means/medians.",
        "Test statistic, p-value, confidence interval/effect size where available.",
        "Box/violin or bar-with-points graph.",
        "Plain-language group comparison."
      ],
      ruleTrace,
      supportedByRunner: !preferNonParametric,
      profile,
      answers
    });
  }

  if (continuousOutcome && (goal === "association" || predictor)) {
    const predictorColumn = predictor || profile.numericOutcomeColumns.find((column) => column !== outcome);
    if (predictorColumn && isContinuous(profile, predictorColumn)) {
      return makeRecommendation({
        id: "linear-regression",
        recommendedAnalysis: "Linear regression",
        shortName: "Linear regression",
        family: "regression",
        confidence: "medium",
        formula: `${outcome} ~ ${predictorColumn}`,
        whyItFits: [
          `${outcome} is numeric/continuous.`,
          `${predictorColumn} is numeric/continuous.`,
          "The research question asks whether one variable is associated with or predicts another."
        ],
        factorMeanings: [
          { term: outcome, meaning: "the response variable." },
          { term: predictorColumn, meaning: "the predictor used to estimate a slope." }
        ],
        assumptions: [
          "The relationship is approximately linear.",
          "Residuals are roughly independent and homoscedastic.",
          "Extreme outliers can strongly affect the fitted line."
        ],
        warnings,
        alternatives: [
          "Simple correlation if both variables are symmetric and the goal is association rather than prediction.",
          "Spearman correlation if the relationship is monotonic but not linear.",
          "Mixed-effects regression if repeated measurements are present."
        ],
        outputPlan: [
          "Regression coefficients.",
          "Slope p-value and confidence interval.",
          "Scatter plot with fitted regression line.",
          "Plain-language slope interpretation."
        ],
        ruleTrace,
        profile,
        answers: { ...answers, predictorColumn }
      });
    }
  }

  if (binaryOutcome && group) {
    const selected = groups <= 2 ? "Fisher's exact test or chi-square test" : "Chi-square test";

    return makeRecommendation({
      id: groups <= 2 ? "fisher-or-chi-square" : "chi-square",
      recommendedAnalysis: selected,
      shortName: selected,
      family: "categorical",
      confidence: "medium",
      whyItFits: [
        `${outcome} is binary/categorical.`,
        `${group} is categorical.`,
        "The question compares counts or proportions across groups."
      ],
      factorMeanings: [
        { term: outcome, meaning: "the binary/categorical response." },
        { term: group, meaning: "the groups whose proportions are compared." }
      ],
      assumptions: [
        "Rows represent independent observations.",
        "Expected cell counts should be checked; Fisher's exact test is safer for sparse 2x2 tables."
      ],
      warnings,
      alternatives: [
        "Logistic regression if you need predictors/covariates.",
        "Mixed-effects logistic regression if repeated subjects/samples exist."
      ],
      outputPlan: [
        "Contingency table.",
        "Proportions by group.",
        "Chi-square/Fisher test where supported.",
        "Contingency bar plot."
      ],
      ruleTrace,
      supportedByRunner: true,
      profile,
      answers
    });
  }

  return makeRecommendation({
    id: "clarify-design",
    recommendedAnalysis: "Clarify design before choosing a test",
    shortName: "Clarify design",
    family: "unknown",
    confidence: "low",
    whyItFits: [
      "The current answers do not map cleanly to one of the MVP analysis paths.",
      "This is safer than pretending the app knows the design."
    ],
    assumptions: ["Confirm outcome type, grouping/pairing, repeated measurements, and biological vs technical replicates."],
    requiredTableFormat: profile.tableShape,
    warnings,
    alternatives: [
      "Choose a numeric outcome and group column for t-test/ANOVA.",
      "Choose a numeric predictor for regression/correlation.",
      "Choose subject ID and time column for repeated-measures/mixed model."
    ],
    outputPlan: ["Show table issues and ask for clarification."],
    ruleTrace,
    supportedByRunner: false,
    profile,
    answers
  });
}
