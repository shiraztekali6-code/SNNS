import { recommendStatisticalAnalysis } from "./recommendation-engine";
import { answersFromExperimentDesign } from "./experiment_interpreter";
import type { ExperimentDesign, QuestionnaireAnswers, StatRecommendation, TableProfile } from "./types";

function technicalReplicateRecommendation(profile: TableProfile, design: ExperimentDesign): StatRecommendation {
  const measurement = design.measurementColumn ?? "measurement";
  const group = design.groupColumn ?? "group";
  const time = design.timeColumn ?? "time/session";
  const subject = design.subjectIdColumn ?? "sample ID";
  return {
    id: "prepare-technical-replicates",
    recommendedAnalysis: "First combine technical replicates, then analyze biological-level data",
    shortName: "Combine technical replicates first",
    family: "unknown",
    confidence: "high",
    suggestedFormula: `${measurement} ~ ${group} * ${time} + (1 | ${subject}) after technical replicates are combined`,
    whyItFits: [
      "You indicated that the repeated entries are technical splits, not independent biological replicates.",
      "Technical splits should not be counted as separate evidence for a treatment effect.",
      "After averaging or otherwise combining technical measurements, the biological-level table can be analyzed."
    ],
    factorMeanings: [
      { term: measurement, meaning: "the measurement after technical replicate handling." },
      { term: group, meaning: "the treatment or comparison groups." },
      { term: time, meaning: "when the measurement was taken." },
      { term: subject, meaning: "the biological unit that should remain independent after combining technical splits." }
    ],
    assumptions: [
      "Technical replicates measure the same biological unit and should be combined or modeled below the biological level.",
      "The final analysis should use the biological unit as the unit of evidence.",
      "Document how technical replicates were summarized."
    ],
    requiredTableFormat: "long",
    warnings: [
      ...profile.warnings,
      "If these are technical replicates, do not treat them as independent biological replicates.",
      "This app provides statistical guidance, not a replacement for a statistician."
    ],
    possibleAlternatives: [
      "Average technical replicates within each biological unit/timepoint, then run the mixed model.",
      "Use a nested model only if the technical replicate structure is explicitly represented and scientifically justified.",
      "Ask a statistician if technical and biological replication are mixed in the same table."
    ],
    outputPlan: [
      "Create a prepared biological-level table.",
      "Then run the recommended longitudinal model on the prepared table.",
      "Show a graph using biological units, not technical split rows."
    ],
    plainLanguageExplanation:
      "I would not run the treatment test yet. If the rows are technical splits, the first statistical job is to combine them so the analysis does not pretend you have more independent animals or samples than you really do.",
    ruleTrace: [
      "User marked replicate type as technical.",
      `Measurement column: ${measurement}`,
      `Group column: ${group}`,
      `Time column: ${time}`,
      `Unit column: ${subject}`
    ],
    supportedByRunner: false
  };
}

export function decideFromExperimentDesign(profile: TableProfile, design: ExperimentDesign): StatRecommendation {
  if (design.replicateType === "technical") {
    return technicalReplicateRecommendation(profile, design);
  }
  return recommendStatisticalAnalysis({ profile, answers: answersFromExperimentDesign(design) });
}

export function decideFromAnswers(profile: TableProfile, answers: QuestionnaireAnswers): StatRecommendation {
  return recommendStatisticalAnalysis({ profile, answers });
}
