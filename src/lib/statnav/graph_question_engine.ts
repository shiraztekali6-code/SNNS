import type { ExperimentDesign, GraphClarificationQuestion, GraphSpec, TableProfile } from "./types";
import { findColumn } from "./graph_spec_builder";

export function getNextGraphClarificationQuestion(
  profile: TableProfile,
  design: ExperimentDesign | null,
  spec: GraphSpec | null
): GraphClarificationQuestion | null {
  if (!spec || !spec.graphRequested) return null;

  const sexColumn = findColumn(profile, [/^sex$/i, /gender/i]);
  const dayNightColumn = findColumn(profile, [/day_night/i, /day.*night/i]);
  const request = spec.graphRequestText.toLowerCase();

  if (spec.graphType === "unsure") {
    return {
      id: "graph-type",
      question: "What kind of graph are you imagining?",
      whyItMatters: "The graph shape should match the question: time course, group comparison, paired change, or relationship between variables.",
      options: [
        { label: "Line over time", value: "line", effect: { graphType: "line_mean_sem", xAxis: design?.timeColumn, colorBy: design?.groupColumn, showErrorBars: true, errorBarType: "SEM" } },
        { label: "Boxplot with points", value: "box", effect: { graphType: "boxplot_points", xAxis: design?.groupColumn, showIndividualPoints: true, showErrorBars: false, errorBarType: "none" } },
        { label: "Scatter + regression", value: "scatter", effect: { graphType: "scatter_regression", showIndividualPoints: true, showTrendline: true, showErrorBars: false, errorBarType: "none" } },
        { label: "I'm not sure", value: "unsure", effect: { notes: [...spec.notes, "Graph type still needs human review."] } }
      ]
    };
  }

  if (sexColumn && /separate|panel|facet|male|female|sex/.test(request) && !spec.facetBy.includes(sexColumn)) {
    return {
      id: "facet-sex",
      question: "Do you want one combined graph or separate panels by sex?",
      whyItMatters: "Separate panels can make male/female patterns easier to compare without mixing them into one average.",
      options: [
        { label: "Separate panels by sex", value: "facet-sex", effect: { facetBy: [...spec.facetBy, sexColumn] } },
        { label: "One combined graph", value: "combined", effect: { facetBy: spec.facetBy.filter((column) => column !== sexColumn) } },
        { label: "I'm not sure", value: "unsure", effect: { notes: [...spec.notes, "Sex paneling is undecided."] } }
      ]
    };
  }

  if (dayNightColumn && /day|night/.test(request) && !spec.splitBy.includes(dayNightColumn)) {
    return {
      id: "split-day-night",
      question: "Should I split the graph by day/night?",
      whyItMatters: "Day and night activity can have different patterns, so mixing them may hide an effect.",
      options: [
        { label: "Yes, split by day/night", value: "split", effect: { splitBy: [...spec.splitBy, dayNightColumn] } },
        { label: "No, combine day/night", value: "combine", effect: { splitBy: spec.splitBy.filter((column) => column !== dayNightColumn) } },
        { label: "I'm not sure", value: "unsure", effect: { notes: [...spec.notes, "Day/night split is undecided."] } }
      ]
    };
  }

  if ((spec.graphType === "line_mean_sem" || spec.graphType === "bar_points") && !/points|individual|raw|only mean|no points/.test(request)) {
    return {
      id: "show-points",
      question: "Do you want individual points shown, or only the group mean with error bars?",
      whyItMatters: "Individual points make sample size and spread visible. Mean-only graphs are cleaner but can hide the raw data.",
      options: [
        { label: "Show individual points", value: "points", effect: { showIndividualPoints: true } },
        { label: "Only mean +/- error bars", value: "mean-only", effect: { showIndividualPoints: false } },
        { label: "I'm not sure", value: "unsure", effect: { notes: [...spec.notes, "Point display is undecided."] } }
      ]
    };
  }

  return null;
}

export function applyGraphClarificationAnswer(
  spec: GraphSpec,
  question: GraphClarificationQuestion,
  value: string
): GraphSpec {
  const selected = question.options.find((option) => option.value === value);
  if (!selected) return spec;
  return {
    ...spec,
    ...selected.effect,
    notes: selected.effect.notes ?? spec.notes,
    confidence: value === "unsure" ? "medium" : spec.confidence === "low" ? "medium" : spec.confidence
  };
}
