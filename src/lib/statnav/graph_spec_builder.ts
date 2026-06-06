import type { ExperimentDesign, GraphSpec, GraphType, TableProfile } from "./types";

function firstAvailable(candidates: Array<string | undefined>, profile: TableProfile): string | undefined {
  return candidates.find((candidate) => candidate && profile.columnNames.includes(candidate));
}

export function findColumn(profile: TableProfile, patterns: RegExp[]): string | undefined {
  return profile.columnNames.find((column) => patterns.some((pattern) => pattern.test(column)));
}

export function defaultGraphType(design: ExperimentDesign | null): GraphType {
  if (design?.timeColumn && design?.groupColumn) return "line_mean_sem";
  if (design?.researchGoal === "paired_change") return "paired_before_after";
  if (design?.researchGoal === "association") return "scatter_regression";
  if (design?.groupColumn) return "boxplot_points";
  return "unsure";
}

export function buildDefaultGraphSpec(profile: TableProfile, design: ExperimentDesign | null): GraphSpec {
  const sexColumn = findColumn(profile, [/^sex$/i, /gender/i]);
  const dayNightColumn = findColumn(profile, [/day_night/i, /day.*night/i]);
  const phaseColumn = findColumn(profile, [/^phase$/i, /treated|treatment_phase/i]);
  const graphType = defaultGraphType(design);
  const xAxis = graphType === "line_mean_sem" || graphType === "longitudinal_line"
    ? design?.timeColumn
    : graphType === "scatter_regression"
      ? firstAvailable([design?.timeColumn, profile.numericOutcomeColumns.find((column) => column !== design?.measurementColumn)], profile)
      : firstAvailable([design?.groupColumn, phaseColumn], profile);

  return {
    graphRequested: true,
    graphRequestText: "",
    graphType,
    xAxis,
    yAxis: design?.measurementColumn ?? profile.numericOutcomeColumns[0],
    colorBy: design?.groupColumn,
    facetBy: [],
    splitBy: [],
    showIndividualPoints: graphType.includes("points") || graphType === "paired_before_after" || graphType === "scatter_regression",
    showErrorBars: graphType === "line_mean_sem" || graphType === "bar_points",
    errorBarType: graphType === "line_mean_sem" || graphType === "bar_points" ? "SEM" : "none",
    showTrendline: graphType === "scatter_regression" || graphType === "trendline",
    notes: [
      design?.subjectIdColumn && design?.timeColumn
        ? `Repeated ${design.subjectIdColumn}-level measurements should be summarized by ${design.groupColumn ?? "group"}/${design.timeColumn} for the displayed means.`
        : "Graph settings are based on the detected table columns and current experiment design.",
      sexColumn ? `Column available for optional panels: ${sexColumn}.` : "",
      dayNightColumn ? `Column available for optional day/night split: ${dayNightColumn}.` : ""
    ].filter(Boolean),
    confidence: design?.measurementColumn ? "medium" : "low"
  };
}

export function describeGraphType(type: GraphSpec["graphType"]): string {
  const labels: Record<GraphSpec["graphType"], string> = {
    longitudinal_line: "longitudinal line graph",
    line_mean_sem: "mean +/- SEM line graph",
    trendline: "trendline graph",
    boxplot_points: "boxplot with individual points",
    violin_points: "violin plot with individual points",
    bar_points: "bar plot with individual points",
    paired_before_after: "paired before/after plot",
    scatter_regression: "scatter plot with regression line",
    categorical_bar: "categorical/proportion bar plot",
    unsure: "not sure yet"
  };
  return labels[type];
}
