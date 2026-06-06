import { useMemo, useState } from "react";
import type { ExperimentDesign, ReplicateType, ResearchGoal, TableProfile } from "@/lib/statnav/types";

function columnOptions(profile: TableProfile, preferred: string[] = []) {
  return Array.from(new Set([...preferred, ...profile.columnNames])).filter(Boolean);
}

function SelectField({
  label,
  onChange,
  options,
  value
}: {
  label: string;
  value?: string;
  options: string[];
  onChange: (value: string | undefined) => void;
}) {
  return (
    <label className="statnav-field">
      <span>{label}</span>
      <select value={value ?? ""} onChange={(event) => onChange(event.target.value || undefined)}>
        <option value="">Not selected</option>
        {options.map((option) => (
          <option key={option} value={option}>{option}</option>
        ))}
      </select>
    </label>
  );
}

export function AdvancedQuestionnaire({
  design,
  onDesignChange,
  profile
}: {
  profile: TableProfile;
  design: ExperimentDesign | null;
  onDesignChange: (design: ExperimentDesign) => void;
}) {
  const [open, setOpen] = useState(false);
  const current: ExperimentDesign = design ?? {
    warnings: [],
    confidence: "low",
    source: "advanced"
  };

  const measurementOptions = useMemo(() => columnOptions(profile, profile.numericOutcomeColumns), [profile]);
  const groupOptions = useMemo(() => columnOptions(profile, profile.possibleGroupColumns), [profile]);
  const timeOptions = useMemo(() => columnOptions(profile, profile.possibleTimeColumns), [profile]);
  const subjectOptions = useMemo(() => columnOptions(profile, profile.possibleSubjectIdColumns), [profile]);

  function update(patch: Partial<ExperimentDesign>) {
    onDesignChange({
      ...current,
      ...patch,
      source: "advanced",
      warnings: current.warnings ?? [],
      confidence: current.confidence === "low" ? "medium" : current.confidence
    });
  }

  return (
    <section className="statnav-card statnav-advanced-card">
      <button className="statnav-advanced-toggle" type="button" onClick={() => setOpen((value) => !value)}>
        {open ? "Hide advanced mode" : "Advanced mode: manually define the design"}
      </button>
      {open ? (
        <div className="statnav-question-grid">
          <SelectField
            label="Measurement column"
            onChange={(value) => update({ measurementColumn: value })}
            options={measurementOptions}
            value={current.measurementColumn}
          />
          <SelectField
            label="Groups column"
            onChange={(value) => update({ groupColumn: value })}
            options={groupOptions}
            value={current.groupColumn}
          />
          <SelectField
            label="Time/session column"
            onChange={(value) => update({ timeColumn: value })}
            options={timeOptions}
            value={current.timeColumn}
          />
          <SelectField
            label="Same animal/sample/cage column"
            onChange={(value) => update({ subjectIdColumn: value })}
            options={subjectOptions}
            value={current.subjectIdColumn}
          />
          <label className="statnav-field">
            <span>Are rows from the same unit measured again?</span>
            <select
              value={current.repeatedMeasures ?? "unsure"}
              onChange={(event) => update({ repeatedMeasures: event.target.value as ExperimentDesign["repeatedMeasures"] })}
            >
              <option value="yes">Yes</option>
              <option value="no">No</option>
              <option value="unsure">I&apos;m not sure</option>
            </select>
          </label>
          <label className="statnav-field">
            <span>Replicate type</span>
            <select
              value={current.replicateType ?? "unknown"}
              onChange={(event) => update({ replicateType: event.target.value as ReplicateType })}
            >
              <option value="biological">Independent biological replicates</option>
              <option value="technical">Technical splits</option>
              <option value="unknown">I&apos;m not sure</option>
            </select>
          </label>
          <label className="statnav-field statnav-full">
            <span>Main goal</span>
            <select
              value={current.researchGoal ?? "compare_groups"}
              onChange={(event) => update({ researchGoal: event.target.value as ResearchGoal })}
            >
              <option value="compare_groups">Compare groups</option>
              <option value="paired_change">Before/after change</option>
              <option value="change_over_time">Change over time</option>
              <option value="interaction">Do groups change differently over time?</option>
              <option value="association">Relationship between measurements</option>
              <option value="predict_binary">Binary yes/no outcome</option>
              <option value="describe">Describe only</option>
            </select>
          </label>
        </div>
      ) : null}
    </section>
  );
}
