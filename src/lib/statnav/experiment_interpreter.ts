import type {
  AssistantInterpretation,
  ExperimentDesign,
  QuestionnaireAnswers,
  ResearchGoal,
  TableProfile
} from "./types";

function firstMatching(columns: string[], patterns: RegExp[]): string | undefined {
  return columns.find((column) => patterns.some((pattern) => pattern.test(column)));
}

function preferredMeasurement(profile: TableProfile, description: string): string | undefined {
  const text = description.toLowerCase();
  const mentioned = profile.numericOutcomeColumns.find((column) => text.includes(column.toLowerCase()));
  return (
    mentioned ??
    firstMatching(profile.numericOutcomeColumns, [/movement/i, /activity/i, /score/i, /mean/i, /value/i, /outcome/i]) ??
    profile.numericOutcomeColumns[0]
  );
}

function preferredGroup(profile: TableProfile, description: string): string | undefined {
  const text = description.toLowerCase();
  const mentioned = profile.possibleGroupColumns.find((column) => text.includes(column.toLowerCase()));
  return (
    mentioned ??
    firstMatching(profile.possibleGroupColumns, [/^group$/i, /treatment/i, /condition/i, /genotype/i, /drug/i]) ??
    profile.possibleGroupColumns[0]
  );
}

function preferredTime(profile: TableProfile, description: string): string | undefined {
  const text = description.toLowerCase();
  const mentioned = profile.possibleTimeColumns.find((column) => text.includes(column.toLowerCase()));
  return (
    mentioned ??
    firstMatching(profile.possibleTimeColumns, [/^session_number$/i, /session/i, /timepoint/i, /time_point/i]) ??
    firstMatching(profile.possibleTimeColumns, [/day/i, /visit/i, /week/i, /phase/i, /before/i, /after/i]) ??
    profile.possibleTimeColumns[0]
  );
}

function preferredSubject(profile: TableProfile, description: string): string | undefined {
  const text = description.toLowerCase();
  const mentioned = profile.possibleSubjectIdColumns.find((column) => text.includes(column.toLowerCase()));
  return (
    mentioned ??
    firstMatching(profile.possibleSubjectIdColumns, [/cage/i, /mouse/i, /mice/i, /animal/i, /subject/i, /sample/i, /patient/i]) ??
    profile.possibleSubjectIdColumns[0]
  );
}

function inferGoal(description: string, hasTime: boolean): ResearchGoal {
  const text = description.toLowerCase();
  const mentionsBeforeAfter = /before|after|pre|post|baseline/.test(text);
  const mentionsOverTime = /over time|every|session|day|week|hour|longitudinal|changed? over|time/.test(text);
  const mentionsDifferentChange = /changed? differently|different.*over time|treatment.*over time|interaction|depends/.test(text);
  const mentionsAssociation = /correlat|predict|relationship|association|slope/.test(text);

  if (mentionsDifferentChange) return "interaction";
  if (mentionsOverTime || hasTime) return "change_over_time";
  if (mentionsBeforeAfter) return "paired_change";
  if (mentionsAssociation) return "association";
  return "compare_groups";
}

function makeStatisticalQuestion(design: ExperimentDesign): string {
  const measurement = design.measurementColumn ?? "the measurement";
  const group = design.groupColumn ?? "the groups";
  const time = design.timeColumn ?? "time";

  if (design.researchGoal === "interaction") {
    return `Does ${measurement} change over ${time} differently between ${group}?`;
  }
  if (design.researchGoal === "change_over_time") {
    return `Does ${measurement} change over ${time}, and do the groups differ?`;
  }
  if (design.researchGoal === "paired_change") {
    return `Did ${measurement} change between the two measurements from the same animals/samples?`;
  }
  if (design.researchGoal === "association") {
    return `Is ${measurement} related to another measured variable?`;
  }
  return `Is ${measurement} different between ${group}?`;
}

function makeLikelyModel(design: ExperimentDesign): string | undefined {
  if (design.measurementColumn && design.groupColumn && design.timeColumn && design.subjectIdColumn) {
    return `${design.measurementColumn} ~ ${design.groupColumn} * ${design.timeColumn} + (1 | ${design.subjectIdColumn})`;
  }
  if (design.measurementColumn && design.groupColumn) {
    return `${design.measurementColumn} ~ ${design.groupColumn}`;
  }
  return undefined;
}

export function interpretExperimentDescription(
  profile: TableProfile,
  description: string
): { design: ExperimentDesign; interpretation: AssistantInterpretation } {
  const measurementColumn = preferredMeasurement(profile, description);
  const groupColumn = preferredGroup(profile, description);
  const timeColumn = preferredTime(profile, description);
  const subjectIdColumn = preferredSubject(profile, description);
  const researchGoal = inferGoal(description, Boolean(timeColumn));
  const repeatedMeasures = subjectIdColumn && timeColumn ? "yes" : profile.repeatedMeasuresLikely ? "unsure" : "no";
  const design: ExperimentDesign = {
    measurementColumn,
    groupColumn,
    timeColumn,
    subjectIdColumn,
    repeatedMeasures,
    replicateType: subjectIdColumn ? "unknown" : "unknown",
    researchGoal,
    userQuestion: description,
    requiredTableFormat: subjectIdColumn && timeColumn ? "long" : profile.tableShape,
    warnings: [...profile.warnings],
    confidence: measurementColumn && groupColumn ? "medium" : "low",
    source: "chat"
  };

  const statisticalQuestion = makeStatisticalQuestion(design);
  const likelyModel = makeLikelyModel(design);
  design.statisticalQuestion = statisticalQuestion;
  design.likelyModel = likelyModel;

  const assumptions = [
    subjectIdColumn && timeColumn
      ? `I am treating ${subjectIdColumn} as the same animal/sample/cage measured again across ${timeColumn}.`
      : "I do not yet know whether the same animal/sample was measured again.",
    groupColumn ? `I am treating ${groupColumn} as the group label.` : "I still need to identify the group column.",
    measurementColumn ? `I am treating ${measurementColumn} as the main measurement.` : "I still need to identify the measurement column."
  ];

  const warnings = [...profile.warnings];
  if (subjectIdColumn) {
    warnings.push(
      "I need one detail before recommending a test: are those repeated units independent biological replicates or technical splits?"
    );
  }

  return {
    design,
    interpretation: {
      summary: `I think your question is: ${statisticalQuestion}`,
      statisticalQuestion,
      likelyAnalysisGoal:
        researchGoal === "interaction"
          ? "Compare how groups change over time"
          : researchGoal === "change_over_time"
            ? "Measure change over time"
            : researchGoal === "paired_change"
              ? "Compare before/after change"
              : researchGoal === "association"
                ? "Test a relationship between measurements"
                : "Compare groups",
      likelyModel,
      detected: {
        measurement: measurementColumn,
        group: groupColumn,
        time: timeColumn,
        subject: subjectIdColumn
      },
      assumptions,
      warnings: Array.from(new Set(warnings)),
      confidence: design.confidence
    }
  };
}

export function answersFromExperimentDesign(design: ExperimentDesign): QuestionnaireAnswers {
  const hasRepeatedUnit = Boolean(design.subjectIdColumn && design.timeColumn);
  return {
    outcomeColumn: design.measurementColumn,
    groupColumn: design.groupColumn,
    subjectIdColumn: design.subjectIdColumn,
    timeColumn: design.timeColumn,
    repeatedMeasures: design.repeatedMeasures ?? (hasRepeatedUnit ? "yes" : "unsure"),
    pairedDesign: hasRepeatedUnit ? "paired" : "independent",
    replicateType: design.replicateType ?? "unknown",
    researchGoal: design.researchGoal,
    desiredOutputs: ["p_value", "graph", "model_summary", "formatted_table", "methods_sentence", "results_sentence"],
    assumeNormalEnough: "unsure",
    preferNonParametric: false,
    notes: design.userQuestion
  };
}
