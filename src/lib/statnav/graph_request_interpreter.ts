import { buildDefaultGraphSpec, findColumn } from "./graph_spec_builder";
import type { ExperimentDesign, GraphSpec, TableProfile } from "./types";

function has(text: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(text));
}

function unique(values: Array<string | undefined>) {
  return Array.from(new Set(values.filter(Boolean))) as string[];
}

export function interpretGraphRequest(
  profile: TableProfile,
  design: ExperimentDesign | null,
  graphRequestText: string
): GraphSpec {
  const text = graphRequestText.toLowerCase();
  const spec = buildDefaultGraphSpec(profile, design);
  const sexColumn = findColumn(profile, [/^sex$/i, /gender/i]);
  const dayNightColumn = findColumn(profile, [/day_night/i, /day.*night/i]);
  const phaseColumn = findColumn(profile, [/^phase$/i, /treated|untreated|treatment_phase/i]);

  spec.graphRequestText = graphRequestText;

  if (has(text, [/line/, /over time/, /longitudinal/, /session/, /every .*hour/, /time/])) {
    spec.graphType = has(text, [/sem|mean|average/]) ? "line_mean_sem" : "longitudinal_line";
    spec.xAxis = design?.timeColumn ?? spec.xAxis;
    spec.colorBy = design?.groupColumn ?? spec.colorBy;
  }

  if (has(text, [/mean.*sem|sem|standard error/])) {
    spec.showErrorBars = true;
    spec.errorBarType = "SEM";
    if (spec.graphType === "longitudinal_line") spec.graphType = "line_mean_sem";
  }

  if (has(text, [/confidence interval|\bci\b/])) {
    spec.showErrorBars = true;
    spec.errorBarType = "CI";
  }

  if (has(text, [/box ?plot|box-and-whisker/])) {
    spec.graphType = "boxplot_points";
    spec.xAxis = design?.groupColumn ?? spec.xAxis;
    spec.showIndividualPoints = true;
    spec.showErrorBars = false;
    spec.errorBarType = "none";
  }

  if (has(text, [/violin/])) {
    spec.graphType = "violin_points";
    spec.xAxis = design?.groupColumn ?? spec.xAxis;
    spec.showIndividualPoints = true;
    spec.showErrorBars = false;
    spec.errorBarType = "none";
  }

  if (has(text, [/bar graph|bar plot|bar chart/])) {
    spec.graphType = "bar_points";
    spec.xAxis = design?.groupColumn ?? spec.xAxis;
    spec.showIndividualPoints = has(text, [/points|individual|raw/]);
    spec.showErrorBars = true;
    if (spec.errorBarType === "none") spec.errorBarType = "SEM";
  }

  if (has(text, [/scatter|regression/])) {
    spec.graphType = "scatter_regression";
    spec.showTrendline = has(text, [/regression|trendline|fit|line/]);
    spec.showIndividualPoints = true;
    spec.showErrorBars = false;
    spec.errorBarType = "none";
  }

  if (has(text, [/before.*after|pre.*post|paired/])) {
    spec.graphType = "paired_before_after";
    spec.xAxis = phaseColumn ?? design?.timeColumn ?? spec.xAxis;
    spec.showIndividualPoints = true;
    spec.showErrorBars = false;
    spec.errorBarType = "none";
  }

  if (has(text, [/contingency|proportion|percent|categorical/])) {
    spec.graphType = "categorical_bar";
    spec.xAxis = design?.groupColumn ?? spec.xAxis;
    spec.yAxis = undefined;
    spec.showErrorBars = false;
    spec.errorBarType = "none";
  }

  if (sexColumn && has(text, [/male|female|sex|separate.*sex|panel.*sex|facet.*sex/])) {
    spec.facetBy = unique([...spec.facetBy, sexColumn]);
  }

  if (dayNightColumn && has(text, [/day.?night|day and night|separate.*day|separate.*night|panel.*day|facet.*day/])) {
    spec.splitBy = unique([...spec.splitBy, dayNightColumn]);
  }

  if (phaseColumn && has(text, [/treated.*untreated|untreated.*treated|before.*after|phase/])) {
    if (spec.graphType === "bar_points" || spec.graphType === "boxplot_points") {
      spec.colorBy = phaseColumn;
      spec.xAxis = design?.groupColumn ?? spec.xAxis;
    } else if (!spec.splitBy.includes(phaseColumn)) {
      spec.splitBy = unique([...spec.splitBy, phaseColumn]);
    }
  }

  if (design?.groupColumn && has(text, [/one graph per group|separate.*group|panel.*group|facet.*group/])) {
    spec.facetBy = unique([...spec.facetBy, design.groupColumn]);
    if (spec.colorBy === design.groupColumn) spec.colorBy = undefined;
  }

  if (design?.groupColumn && has(text, [/one line per|separate lines|lines for|color.*group|by group|mix|r837|ru521/])) {
    spec.colorBy = design.groupColumn;
  }

  if (has(text, [/individual|raw points|show points|data points|each cage|each mouse|each animal/])) {
    spec.showIndividualPoints = true;
  }

  if (has(text, [/only mean|no points|without points/])) {
    spec.showIndividualPoints = false;
  }

  if (!spec.xAxis && design?.timeColumn) spec.xAxis = design.timeColumn;
  if (!spec.yAxis && design?.measurementColumn) spec.yAxis = design.measurementColumn;

  spec.notes = unique([
    ...spec.notes,
    spec.graphType === "line_mean_sem" || spec.graphType === "longitudinal_line"
      ? `Summarize ${spec.yAxis ?? "the measurement"} by ${spec.colorBy ?? "group"}/${spec.xAxis ?? "time"}.`
      : undefined,
    spec.facetBy.length ? `Use separate panels for ${spec.facetBy.join(", ")}.` : undefined,
    spec.splitBy.length ? `Create separate subsets or panels for ${spec.splitBy.join(", ")}.` : undefined,
    design?.subjectIdColumn ? `Repeated ${design.subjectIdColumn}-level data should not be visually over-counted as independent animals.` : undefined
  ]);

  spec.confidence = spec.graphType !== "unsure" && spec.yAxis ? "high" : spec.graphType !== "unsure" ? "medium" : "low";
  return spec;
}
