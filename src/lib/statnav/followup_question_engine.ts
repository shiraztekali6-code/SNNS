import type { ExperimentDesign, FollowUpQuestion, TableProfile } from "./types";

export function getNextFollowUpQuestion(profile: TableProfile, design: ExperimentDesign | null): FollowUpQuestion | null {
  if (!design) return null;

  if (!design.measurementColumn) {
    return {
      id: "measurement-column",
      question: "Which column is the main thing you measured?",
      whyItMatters: "The test depends first on what kind of measurement we are analyzing.",
      options: [
        ...profile.numericOutcomeColumns.slice(0, 3).map((column) => ({
          label: column,
          value: column,
          effect: { measurementColumn: column, source: "follow_up" as const }
        })),
        { label: "I'm not sure", value: "unknown", effect: { warnings: [...design.warnings, "Measurement column is still unclear."] } }
      ]
    };
  }

  if (design.subjectIdColumn && design.timeColumn && design.replicateType === "unknown") {
    return {
      id: "replicate-type",
      question: `Are the ${design.subjectIdColumn} values independent biological replicates, or technical splits of the same group?`,
      whyItMatters:
        "This matters because it changes whether your data points are independent. If these are technical replicates, we should average or combine them first.",
      options: [
        {
          label: "Independent replicates",
          value: "biological",
          effect: { replicateType: "biological", repeatedMeasures: "yes", source: "follow_up" }
        },
        {
          label: "Technical splits",
          value: "technical",
          effect: {
            replicateType: "technical",
            repeatedMeasures: "yes",
            source: "follow_up",
            warnings: [
              ...design.warnings,
              "If these are technical replicates, combine them before treating rows as independent biological evidence."
            ]
          }
        },
        {
          label: "I'm not sure",
          value: "unknown",
          effect: {
            replicateType: "unknown",
            source: "follow_up",
            warnings: [...design.warnings, "Replicate type is unclear; keep this as a red flag."]
          }
        }
      ]
    };
  }

  if (design.subjectIdColumn && design.timeColumn && design.repeatedMeasures === "unsure") {
    return {
      id: "same-unit-again",
      question: `Does ${design.subjectIdColumn} mean the same animal/sample/cage was measured again across ${design.timeColumn}?`,
      whyItMatters:
        "This tells us whether repeated rows are related. Related rows need a paired or mixed-model approach.",
      options: [
        { label: "Yes, same unit again", value: "yes", effect: { repeatedMeasures: "yes", source: "follow_up" } },
        { label: "No, different units", value: "no", effect: { repeatedMeasures: "no", source: "follow_up" } },
        { label: "I'm not sure", value: "unsure", effect: { repeatedMeasures: "unsure", source: "follow_up" } }
      ]
    };
  }

  if (design.groupColumn && design.timeColumn && design.researchGoal === "compare_groups") {
    return {
      id: "endpoint-or-time",
      question: "Do you want to compare groups at one endpoint, or compare how they change over time?",
      whyItMatters:
        "A single endpoint can use a simpler group comparison. Change over time usually needs a model that includes time.",
      options: [
        { label: "Change over time", value: "change_over_time", effect: { researchGoal: "interaction", source: "follow_up" } },
        { label: "One endpoint only", value: "compare_groups", effect: { researchGoal: "compare_groups", timeColumn: undefined, source: "follow_up" } },
        { label: "I'm not sure", value: "unsure", effect: { researchGoal: "change_over_time", source: "follow_up" } }
      ]
    };
  }

  return null;
}

export function applyFollowUpAnswer(design: ExperimentDesign, question: FollowUpQuestion, value: string): ExperimentDesign {
  const selected = question.options.find((option) => option.value === value);
  if (!selected) return design;
  return {
    ...design,
    ...selected.effect,
    warnings: selected.effect.warnings ?? design.warnings,
    confidence: value === "unknown" ? "low" : design.confidence === "low" ? "medium" : design.confidence,
    statisticalQuestion: selected.effect.researchGoal
      ? undefined
      : design.statisticalQuestion
  };
}
