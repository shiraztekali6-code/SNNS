export type DetectedColumnKind =
  | "numeric_continuous"
  | "categorical"
  | "binary"
  | "date_time"
  | "id_like"
  | "subject_id_like"
  | "time_session_like"
  | "group_treatment_like"
  | "count_like"
  | "unknown";

export type TableShape = "long" | "wide" | "ambiguous";

export type ColumnProfile = {
  name: string;
  primaryType: DetectedColumnKind;
  detectedTypes: DetectedColumnKind[];
  missingValues: number;
  missingPercent: number;
  uniqueValues: number;
  examples: string[];
  numericSummary?: {
    min: number | null;
    max: number | null;
    mean: number | null;
    median: number | null;
  };
  categoricalSummary?: {
    levels: string[];
    levelCount: number;
    topCounts: Array<{ value: string; count: number }>;
  };
};

export type IdDuplicateSummary = {
  column: string;
  duplicatedValueCount: number;
  maxRowsPerValue: number;
  examples: string[];
};

export type TableProfile = {
  datasetId: string;
  fileName: string;
  rows: number;
  columns: number;
  columnNames: string[];
  preview: Array<Record<string, string | number | null>>;
  missingCells: number;
  rowsWithMissingValues: number;
  duplicatedRows: number;
  columnProfiles: ColumnProfile[];
  groupLevelCounts: Array<{ column: string; levels: number; examples: string[] }>;
  duplicatedIds: IdDuplicateSummary[];
  possibleSubjectIdColumns: string[];
  possibleTimeColumns: string[];
  possibleGroupColumns: string[];
  numericOutcomeColumns: string[];
  countLikeColumns: string[];
  binaryColumns: string[];
  dateTimeColumns: string[];
  appearsWide: boolean;
  appearsLong: boolean;
  tableShape: TableShape;
  wideScore: number;
  longScore: number;
  repeatedMeasuresLikely: boolean;
  suggestions: string[];
  warnings: string[];
};

export type ReplicateType = "biological" | "technical" | "unknown";

export type ResearchGoal =
  | "compare_groups"
  | "paired_change"
  | "change_over_time"
  | "interaction"
  | "association"
  | "predict_binary"
  | "describe";

export type DesiredOutput =
  | "p_value"
  | "graph"
  | "model_summary"
  | "formatted_table"
  | "methods_sentence"
  | "results_sentence";

export type QuestionnaireAnswers = {
  outcomeColumn?: string;
  groupColumn?: string;
  secondaryFactorColumn?: string;
  predictorColumn?: string;
  subjectIdColumn?: string;
  timeColumn?: string;
  repeatedMeasures?: "yes" | "no" | "unsure";
  pairedDesign?: "paired" | "independent" | "unsure";
  beforeAfterColumn?: string;
  replicateType?: ReplicateType;
  researchGoal?: ResearchGoal;
  desiredOutputs?: DesiredOutput[];
  preferNonParametric?: boolean;
  assumeNormalEnough?: "yes" | "no" | "unsure";
  notes?: string;
};

export type ExperimentDesign = {
  measurementColumn?: string;
  groupColumn?: string;
  timeColumn?: string;
  subjectIdColumn?: string;
  repeatedMeasures?: "yes" | "no" | "unsure";
  replicateType?: ReplicateType;
  researchGoal?: ResearchGoal;
  userQuestion?: string;
  statisticalQuestion?: string;
  likelyModel?: string;
  requiredTableFormat?: TableShape;
  warnings: string[];
  confidence: "high" | "medium" | "low";
  source: "profile" | "chat" | "follow_up" | "advanced";
};

export type AssistantInterpretation = {
  summary: string;
  statisticalQuestion: string;
  likelyAnalysisGoal: string;
  likelyModel?: string;
  detected: {
    measurement?: string;
    group?: string;
    time?: string;
    subject?: string;
  };
  assumptions: string[];
  warnings: string[];
  confidence: "high" | "medium" | "low";
};

export type FollowUpQuestion = {
  id: string;
  question: string;
  whyItMatters: string;
  options: Array<{
    label: string;
    value: string;
    effect: Partial<ExperimentDesign>;
  }>;
};

export type GraphType =
  | "longitudinal_line"
  | "line_mean_sem"
  | "trendline"
  | "boxplot_points"
  | "violin_points"
  | "bar_points"
  | "paired_before_after"
  | "scatter_regression"
  | "categorical_bar"
  | "unsure";

export type ErrorBarType = "SEM" | "CI" | "SD" | "none" | "unsure";

export type GraphSpec = {
  graphRequested: boolean;
  graphRequestText: string;
  graphType: GraphType;
  xAxis?: string;
  yAxis?: string;
  colorBy?: string;
  facetBy: string[];
  splitBy: string[];
  showIndividualPoints: boolean;
  showErrorBars: boolean;
  errorBarType: ErrorBarType;
  showTrendline: boolean;
  notes: string[];
  confidence: "high" | "medium" | "low";
};

export type GraphClarificationQuestion = {
  id: string;
  question: string;
  whyItMatters: string;
  options: Array<{
    label: string;
    value: string;
    effect: Partial<GraphSpec>;
  }>;
};

export type RecommendationEngineInput = {
  profile: TableProfile;
  answers: QuestionnaireAnswers;
};

export type StatRecommendation = {
  id: string;
  recommendedAnalysis: string;
  shortName: string;
  family:
    | "mean_comparison"
    | "anova"
    | "regression"
    | "mixed_model"
    | "categorical"
    | "correlation"
    | "unknown";
  confidence: "high" | "medium" | "low";
  suggestedFormula?: string;
  whyItFits: string[];
  factorMeanings: Array<{ term: string; meaning: string }>;
  assumptions: string[];
  requiredTableFormat: TableShape;
  warnings: string[];
  possibleAlternatives: string[];
  outputPlan: string[];
  plainLanguageExplanation: string;
  ruleTrace: string[];
  supportedByRunner: boolean;
};

export type ConversionResult = {
  conversionId: string;
  direction: "wide_to_long" | "long_to_wide";
  preview: Array<Record<string, string | number | null>>;
  rows: number;
  columns: number;
  columnNames: string[];
  csvDownload: string;
  xlsxDownload: string;
  notes: string[];
};

export type AnalysisTable = {
  title: string;
  columns: string[];
  rows: Array<Record<string, string | number | null>>;
};

export type AnalysisResult = {
  jobId: string;
  analysisName: string;
  formula?: string;
  nUsed: number;
  warnings: string[];
  interpretation: string;
  methodsText: string;
  resultsText: string;
  tables: AnalysisTable[];
  graphDownload?: string;
  resultCsvDownload?: string;
  resultXlsxDownload?: string;
};
