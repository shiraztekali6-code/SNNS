"use client";

import { useMemo, useState } from "react";
import type {
  AnalysisResult,
  ConversionResult,
  DesiredOutput,
  QuestionnaireAnswers,
  ResearchGoal,
  StatRecommendation,
  TableProfile
} from "@/lib/statnav/types";

type Step = "home" | "upload" | "questionnaire" | "recommendation" | "results";

type ApiError = {
  error?: string;
};

const DESIRED_OUTPUTS: Array<{ value: DesiredOutput; label: string }> = [
  { value: "p_value", label: "p-value" },
  { value: "graph", label: "Graph" },
  { value: "model_summary", label: "Model summary" },
  { value: "formatted_table", label: "Formatted table" },
  { value: "methods_sentence", label: "Methods sentence" },
  { value: "results_sentence", label: "Results sentence" }
];

const RESEARCH_GOALS: Array<{ value: ResearchGoal; label: string; hint: string }> = [
  { value: "compare_groups", label: "Compare groups", hint: "Example: treatment A vs B vs C" },
  { value: "paired_change", label: "Before/after change", hint: "Same unit measured twice" },
  { value: "change_over_time", label: "Change over time", hint: "Repeated sessions/days/visits" },
  { value: "interaction", label: "Interaction", hint: "Does treatment behave differently across sex/day/etc.?" },
  { value: "association", label: "Association/regression", hint: "Numeric predictor and numeric outcome" },
  { value: "predict_binary", label: "Binary outcome", hint: "Outcome is yes/no or 0/1" },
  { value: "describe", label: "Describe only", hint: "Summaries and graph before testing" }
];

function apiJson<T>(url: string, init?: RequestInit): Promise<T> {
  return fetch(url, init).then(async (response) => {
    const payload = (await response.json()) as T & ApiError;
    if (!response.ok) {
      throw new Error(payload.error || `Request failed: ${response.status}`);
    }
    return payload;
  });
}

function defaultAnswers(profile: TableProfile): QuestionnaireAnswers {
  const preferredOutcome =
    profile.numericOutcomeColumns.find((column) => /movement|outcome|value|mean|score|activity/i.test(column)) ??
    profile.numericOutcomeColumns[0];
  const preferredGroup =
    profile.possibleGroupColumns.find((column) => /^group$/i.test(column)) ??
    profile.possibleGroupColumns.find((column) => /treatment|condition|genotype/i.test(column)) ??
    profile.possibleGroupColumns[0];
  const preferredSubject =
    profile.possibleSubjectIdColumns.find((column) => /cage|mouse|subject|sample/i.test(column)) ??
    profile.possibleSubjectIdColumns[0];
  const preferredTime =
    profile.possibleTimeColumns.find((column) => /^session_number$/i.test(column)) ??
    profile.possibleTimeColumns.find((column) => /session/i.test(column)) ??
    profile.possibleTimeColumns.find((column) => /^time$|timepoint|time_point/i.test(column)) ??
    profile.possibleTimeColumns.find((column) => /day|visit|week/i.test(column)) ??
    profile.possibleTimeColumns[0];

  return {
    outcomeColumn: preferredOutcome,
    groupColumn: preferredGroup,
    subjectIdColumn: preferredSubject,
    timeColumn: preferredTime,
    repeatedMeasures: profile.repeatedMeasuresLikely ? "yes" : "unsure",
    pairedDesign: profile.repeatedMeasuresLikely ? "paired" : "independent",
    replicateType: preferredSubject ? "biological" : "unknown",
    researchGoal: profile.repeatedMeasuresLikely && preferredTime ? "change_over_time" : "compare_groups",
    desiredOutputs: ["p_value", "graph", "model_summary", "formatted_table", "methods_sentence", "results_sentence"],
    assumeNormalEnough: "unsure",
    preferNonParametric: false
  };
}

function cx(...classes: Array<string | false | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

function isSelected<T extends string>(items: T[] | undefined, item: T): boolean {
  return Boolean(items?.includes(item));
}

function updateDesiredOutput(
  answers: QuestionnaireAnswers,
  value: DesiredOutput,
  checked: boolean
): QuestionnaireAnswers {
  const current = answers.desiredOutputs ?? [];
  const next = checked ? Array.from(new Set([...current, value])) : current.filter((item) => item !== value);
  return { ...answers, desiredOutputs: next };
}

function shortList(values: string[], empty = "None detected"): string {
  if (!values.length) return empty;
  return values.slice(0, 6).join(", ") + (values.length > 6 ? ` +${values.length - 6} more` : "");
}

function columnOptions(profile: TableProfile | null, preferred: string[] = []): string[] {
  if (!profile) return [];
  return Array.from(new Set([...preferred, ...profile.columnNames])).filter(Boolean);
}

function columnType(profile: TableProfile, name?: string): string {
  const column = profile.columnProfiles.find((item) => item.name === name);
  return column ? column.detectedTypes.join(", ") : "";
}

function safeCell(value: string | number | null): string {
  if (value === null) return "";
  return String(value);
}

function StepPill({ active, children }: { active: boolean; children: React.ReactNode }) {
  return <span className={cx("statnav-step-pill", active && "is-active")}>{children}</span>;
}

function SelectField({
  label,
  value,
  options,
  onChange,
  hint
}: {
  label: string;
  value?: string;
  options: string[];
  onChange: (value: string) => void;
  hint?: string;
}) {
  return (
    <label className="statnav-field">
      <span>{label}</span>
      <select value={value ?? ""} onChange={(event) => onChange(event.target.value)}>
        <option value="">Not selected</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
      {hint ? <small>{hint}</small> : null}
    </label>
  );
}

function RadioCards<T extends string>({
  label,
  value,
  options,
  onChange
}: {
  label: string;
  value?: T;
  options: Array<{ value: T; label: string; hint: string }>;
  onChange: (value: T) => void;
}) {
  return (
    <div className="statnav-field statnav-full">
      <span>{label}</span>
      <div className="statnav-radio-grid">
        {options.map((option) => (
          <button
            className={cx("statnav-choice", value === option.value && "is-selected")}
            key={option.value}
            onClick={() => onChange(option.value)}
            type="button"
          >
            <strong>{option.label}</strong>
            <small>{option.hint}</small>
          </button>
        ))}
      </div>
    </div>
  );
}

function ProfileSummary({ profile }: { profile: TableProfile }) {
  return (
    <section className="statnav-grid two">
      <div className="statnav-card statnav-card-strong">
        <p className="statnav-kicker">Table profiler</p>
        <h2>{profile.fileName}</h2>
        <div className="statnav-metrics">
          <span>
            <strong>{profile.rows.toLocaleString()}</strong>
            rows
          </span>
          <span>
            <strong>{profile.columns.toLocaleString()}</strong>
            columns
          </span>
          <span>
            <strong>{profile.tableShape}</strong>
            shape
          </span>
          <span>
            <strong>{profile.missingCells.toLocaleString()}</strong>
            missing cells
          </span>
        </div>
      </div>
      <div className="statnav-card">
        <p className="statnav-kicker">Detected structure</p>
        <ul className="statnav-clean-list">
          <li>
            <strong>Outcome candidates:</strong> {shortList(profile.numericOutcomeColumns)}
          </li>
          <li>
            <strong>Group/factor candidates:</strong> {shortList(profile.possibleGroupColumns)}
          </li>
          <li>
            <strong>Repeated-unit candidates:</strong> {shortList(profile.possibleSubjectIdColumns)}
          </li>
          <li>
            <strong>Time/session candidates:</strong> {shortList(profile.possibleTimeColumns)}
          </li>
        </ul>
      </div>
    </section>
  );
}

function PreviewTable({ profile }: { profile: TableProfile }) {
  return (
    <div className="statnav-table-wrap">
      <table className="statnav-table">
        <thead>
          <tr>
            {profile.columnNames.slice(0, 10).map((column) => (
              <th key={column}>{column}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {profile.preview.map((row, index) => (
            <tr key={index}>
              {profile.columnNames.slice(0, 10).map((column) => (
                <td key={column}>{safeCell(row[column])}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {profile.columnNames.length > 10 ? (
        <p className="statnav-table-note">Showing first 10 of {profile.columnNames.length} columns.</p>
      ) : null}
    </div>
  );
}

function ColumnProfiler({ profile }: { profile: TableProfile }) {
  return (
    <div className="statnav-column-grid">
      {profile.columnProfiles.map((column) => (
        <article className="statnav-column-card" key={column.name}>
          <h3>{column.name}</h3>
          <p>{column.detectedTypes.join(" + ")}</p>
          <div className="statnav-column-meta">
            <span>{column.uniqueValues} unique</span>
            <span>{column.missingValues} missing</span>
          </div>
          {column.examples.length ? <small>Examples: {column.examples.slice(0, 4).join(", ")}</small> : null}
        </article>
      ))}
    </div>
  );
}

function WarningList({ warnings }: { warnings: string[] }) {
  if (!warnings.length) return null;
  return (
    <div className="statnav-warning-box">
      <strong>Warnings and guardrails</strong>
      <ul>
        {warnings.map((warning) => (
          <li key={warning}>{warning}</li>
        ))}
      </ul>
    </div>
  );
}

function ResultTables({ tables }: { tables: AnalysisResult["tables"] }) {
  return (
    <div className="statnav-results-stack">
      {tables.map((table) => (
        <section className="statnav-card" key={table.title}>
          <h3>{table.title}</h3>
          <div className="statnav-table-wrap compact">
            <table className="statnav-table">
              <thead>
                <tr>
                  {table.columns.map((column) => (
                    <th key={column}>{column}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.rows.slice(0, 12).map((row, rowIndex) => (
                  <tr key={rowIndex}>
                    {table.columns.map((column) => (
                      <td key={column}>{safeCell(row[column])}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {table.rows.length > 12 ? <p className="statnav-table-note">Showing first 12 rows.</p> : null}
        </section>
      ))}
    </div>
  );
}

export function StatNavigatorApp() {
  const [step, setStep] = useState<Step>("home");
  const [profile, setProfile] = useState<TableProfile | null>(null);
  const [answers, setAnswers] = useState<QuestionnaireAnswers>({});
  const [recommendation, setRecommendation] = useState<StatRecommendation | null>(null);
  const [conversion, setConversion] = useState<ConversionResult | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [status, setStatus] = useState<string>("");
  const [error, setError] = useState<string>("");

  const allColumns = useMemo(() => columnOptions(profile), [profile]);
  const outcomeOptions = useMemo(
    () => columnOptions(profile, profile?.numericOutcomeColumns ?? []),
    [profile]
  );
  const groupOptions = useMemo(
    () => columnOptions(profile, profile?.possibleGroupColumns ?? []),
    [profile]
  );
  const subjectOptions = useMemo(
    () => columnOptions(profile, profile?.possibleSubjectIdColumns ?? []),
    [profile]
  );
  const timeOptions = useMemo(
    () => columnOptions(profile, profile?.possibleTimeColumns ?? []),
    [profile]
  );

  async function handleProfileLoaded(nextProfile: TableProfile) {
    setProfile(nextProfile);
    setAnswers(defaultAnswers(nextProfile));
    setRecommendation(null);
    setAnalysis(null);
    setConversion(null);
    setStep("upload");
  }

  async function uploadFile(file: File) {
    setError("");
    setStatus("Uploading and profiling the table...");
    const formData = new FormData();
    formData.append("file", file);
    try {
      const payload = await apiJson<{ profile: TableProfile }>("/api/statnav/upload", {
        method: "POST",
        body: formData
      });
      await handleProfileLoaded(payload.profile);
      setStatus("Profile complete.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setStatus("");
    }
  }

  async function loadExample() {
    setError("");
    setStatus("Loading the mouse activity example...");
    try {
      const payload = await apiJson<{ profile: TableProfile }>("/api/statnav/example");
      await handleProfileLoaded(payload.profile);
      setStatus("Example loaded.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load example.");
    } finally {
      setStatus("");
    }
  }

  async function createRecommendation() {
    if (!profile) return;
    setError("");
    setStatus("Running the rule-based recommendation engine...");
    try {
      const payload = await apiJson<{ recommendation: StatRecommendation }>("/api/statnav/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile, answers })
      });
      setRecommendation(payload.recommendation);
      setAnalysis(null);
      setConversion(null);
      setStep("recommendation");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create recommendation.");
    } finally {
      setStatus("");
    }
  }

  async function convertTable() {
    if (!profile) return;
    setError("");
    setStatus("Preparing a converted table...");
    try {
      const direction = profile.appearsWide && !profile.appearsLong ? "wide_to_long" : "long_to_wide";
      const payload = await apiJson<{ result: ConversionResult }>("/api/statnav/convert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ datasetId: profile.datasetId, profile, answers, direction })
      });
      setConversion(payload.result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not convert table.");
    } finally {
      setStatus("");
    }
  }

  async function runAnalysis() {
    if (!profile) return;
    setError("");
    setStatus("Running the confirmed analysis and generating outputs...");
    try {
      const payload = await apiJson<{ result: AnalysisResult }>("/api/statnav/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ datasetId: profile.datasetId, profile, answers })
      });
      setAnalysis(payload.result);
      setStep("results");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not run analysis.");
    } finally {
      setStatus("");
    }
  }

  return (
    <div className="statnav-app" dir="ltr">
      <div className="statnav-background" aria-hidden="true" />
      <header className="statnav-hero">
        <nav className="statnav-topbar" aria-label="Statistics Navigator workflow">
          <a href="/" className="statnav-brand">
            <span>Statistics Navigator</span>
          </a>
          <div className="statnav-stepper">
            <StepPill active={step === "home" || step === "upload"}>Upload</StepPill>
            <StepPill active={step === "questionnaire"}>Interview</StepPill>
            <StepPill active={step === "recommendation"}>Recommendation</StepPill>
            <StepPill active={step === "results"}>Results</StepPill>
          </div>
        </nav>

        <div className="statnav-hero-grid">
          <section className="statnav-hero-copy">
            <p className="statnav-kicker">AI-assisted interview + rule-based statistics engine</p>
            <h1>Statistics Navigator for Non-Statisticians</h1>
            <p className="statnav-hebrew" dir="rtl">
              סטטיסטיקה להדיוטות
            </p>
            <p className="statnav-lede">
              Upload a data table, answer simple experiment-design questions, and get a transparent
              recommendation for the analysis, table shape, assumptions, graph, and plain-language reporting.
            </p>
            <div className="statnav-actions">
              <label className="statnav-button primary">
                Upload CSV/XLSX
                <input
                  accept=".csv,.xlsx"
                  hidden
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void uploadFile(file);
                  }}
                  type="file"
                />
              </label>
              <button className="statnav-button secondary" onClick={() => void loadExample()} type="button">
                Use mouse activity example
              </button>
              <button className="statnav-button ghost" onClick={() => setStep(profile ? "questionnaire" : "upload")} type="button">
                Start guided analysis
              </button>
            </div>
          </section>

          <aside className="statnav-principle-card">
            <span className="statnav-orbit" />
            <h2>Not a blind test picker</h2>
            <p>
              The MVP separates the friendly explanation layer from the rule-based decision engine. If the
              design is ambiguous, the app asks for clarification instead of inventing certainty.
            </p>
            <ul>
              <li>Data profiler suggests possibilities.</li>
              <li>Questionnaire confirms the design.</li>
              <li>Rules choose the analysis.</li>
              <li>Python/R execute only after confirmation.</li>
            </ul>
          </aside>
        </div>
      </header>

      <main className="statnav-main">
        {status ? <div className="statnav-status">{status}</div> : null}
        {error ? <div className="statnav-error">{error}</div> : null}

        {step === "home" ? (
          <section className="statnav-grid three">
            {[
              ["1", "Upload and profile", "Rows, columns, missing values, detected types, repeated IDs, and wide/long hints."],
              ["2", "Answer the interview", "Plain-language questions about outcome, group, pairing, time, and replication."],
              ["3", "Run and report", "Statistical table, graph, interpretation, Methods text, Results text, and downloads."]
            ].map(([number, title, copy]) => (
              <article className="statnav-card" key={number}>
                <span className="statnav-number">{number}</span>
                <h3>{title}</h3>
                <p>{copy}</p>
              </article>
            ))}
          </section>
        ) : null}

        {step === "upload" ? (
          <section className="statnav-section">
            {!profile ? (
              <div className="statnav-card statnav-upload-card">
                <h2>Upload Data</h2>
                <p>Choose a CSV or XLSX table. The profiler will suggest column roles, not final decisions.</p>
                <label className="statnav-dropzone">
                  <input
                    accept=".csv,.xlsx"
                    hidden
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) void uploadFile(file);
                    }}
                    type="file"
                  />
                  <strong>Drop zone, spiritually speaking</strong>
                  <span>Click to upload CSV/XLSX</span>
                </label>
                <button className="statnav-button secondary" onClick={() => void loadExample()} type="button">
                  Load built-in mouse activity example
                </button>
              </div>
            ) : (
              <>
                <ProfileSummary profile={profile} />
                <div className="statnav-card">
                  <div className="statnav-card-head">
                    <div>
                      <p className="statnav-kicker">Preview</p>
                      <h2>First rows</h2>
                    </div>
                    <button className="statnav-button primary" onClick={() => setStep("questionnaire")} type="button">
                      Continue to guided questions
                    </button>
                  </div>
                  <PreviewTable profile={profile} />
                </div>
                <div className="statnav-card">
                  <p className="statnav-kicker">Column type detection</p>
                  <ColumnProfiler profile={profile} />
                </div>
                <WarningList warnings={profile.warnings} />
              </>
            )}
          </section>
        ) : null}

        {step === "questionnaire" && profile ? (
          <section className="statnav-section">
            <div className="statnav-card statnav-card-head">
              <div>
                <p className="statnav-kicker">Guided experiment interview</p>
                <h2>Tell the app what the experiment means</h2>
                <p>
                  The profiler guessed column roles. Your answers are what make the recommendation defensible.
                </p>
              </div>
              <button className="statnav-button secondary" onClick={() => setStep("upload")} type="button">
                Back to profile
              </button>
            </div>

            <div className="statnav-question-grid">
              <SelectField
                hint={answers.outcomeColumn ? columnType(profile, answers.outcomeColumn) : "Choose the main measurement."}
                label="What is the main measurement/outcome?"
                onChange={(value) => setAnswers((current) => ({ ...current, outcomeColumn: value }))}
                options={outcomeOptions}
                value={answers.outcomeColumn}
              />
              <SelectField
                hint={answers.groupColumn ? columnType(profile, answers.groupColumn) : "Choose the comparison group/treatment."}
                label="Which column contains the group/treatment?"
                onChange={(value) => setAnswers((current) => ({ ...current, groupColumn: value }))}
                options={groupOptions}
                value={answers.groupColumn}
              />
              <SelectField
                hint="Use this for two-way ANOVA or interaction questions."
                label="Is there a second factor?"
                onChange={(value) => setAnswers((current) => ({ ...current, secondaryFactorColumn: value || undefined }))}
                options={groupOptions.filter((column) => column !== answers.groupColumn)}
                value={answers.secondaryFactorColumn}
              />
              <SelectField
                hint="Use this for linear regression/correlation questions."
                label="Numeric predictor, if relevant"
                onChange={(value) => setAnswers((current) => ({ ...current, predictorColumn: value || undefined }))}
                options={allColumns.filter((column) => column !== answers.outcomeColumn)}
                value={answers.predictorColumn}
              />
              <SelectField
                hint={answers.subjectIdColumn ? columnType(profile, answers.subjectIdColumn) : "Subject, mouse, cage, patient, sample, etc."}
                label="Which column identifies repeated subject/sample/cage?"
                onChange={(value) => setAnswers((current) => ({ ...current, subjectIdColumn: value || undefined }))}
                options={subjectOptions}
                value={answers.subjectIdColumn}
              />
              <SelectField
                hint={answers.timeColumn ? columnType(profile, answers.timeColumn) : "Day, session, phase, before/after, visit."}
                label="Is there a time/session column?"
                onChange={(value) => setAnswers((current) => ({ ...current, timeColumn: value || undefined }))}
                options={timeOptions}
                value={answers.timeColumn}
              />

              <RadioCards
                label="Are the same subjects/samples/cages measured more than once?"
                onChange={(value) => setAnswers((current) => ({ ...current, repeatedMeasures: value }))}
                options={[
                  { value: "yes", label: "Yes", hint: "Repeated measurements exist" },
                  { value: "no", label: "No", hint: "Rows are independent" },
                  { value: "unsure", label: "Unsure", hint: "Show a warning" }
                ]}
                value={answers.repeatedMeasures}
              />
              <RadioCards
                label="Are groups independent or paired?"
                onChange={(value) => setAnswers((current) => ({ ...current, pairedDesign: value }))}
                options={[
                  { value: "independent", label: "Independent", hint: "Different units in each group" },
                  { value: "paired", label: "Paired", hint: "Same/matched units across conditions" },
                  { value: "unsure", label: "Unsure", hint: "Ask for caution" }
                ]}
                value={answers.pairedDesign}
              />
              <RadioCards
                label="Are replicates biological or technical?"
                onChange={(value) => setAnswers((current) => ({ ...current, replicateType: value }))}
                options={[
                  { value: "biological", label: "Biological", hint: "Independent animals/samples/people" },
                  { value: "technical", label: "Technical", hint: "Repeated measurement of same biological unit" },
                  { value: "unknown", label: "Unknown", hint: "Keep a warning visible" }
                ]}
                value={answers.replicateType}
              />
              <RadioCards
                label="What do you want to learn?"
                onChange={(value) => setAnswers((current) => ({ ...current, researchGoal: value }))}
                options={RESEARCH_GOALS}
                value={answers.researchGoal}
              />
              <RadioCards
                label="Do you want a non-parametric alternative?"
                onChange={(value) =>
                  setAnswers((current) => ({
                    ...current,
                    preferNonParametric: value === "yes",
                    assumeNormalEnough: value === "yes" ? "no" : value
                  }))
                }
                options={[
                  { value: "unsure", label: "Not sure", hint: "Recommend standard path with assumptions" },
                  { value: "yes", label: "Yes", hint: "Prefer Mann-Whitney/Wilcoxon/Kruskal where relevant" },
                  { value: "no", label: "No", hint: "Use parametric tests where appropriate" }
                ]}
                value={answers.preferNonParametric ? "yes" : answers.assumeNormalEnough ?? "unsure"}
              />

              <div className="statnav-field statnav-full">
                <span>What output do you want?</span>
                <div className="statnav-checkbox-grid">
                  {DESIRED_OUTPUTS.map((output) => (
                    <label key={output.value}>
                      <input
                        checked={isSelected(answers.desiredOutputs, output.value)}
                        onChange={(event) =>
                          setAnswers((current) => updateDesiredOutput(current, output.value, event.target.checked))
                        }
                        type="checkbox"
                      />
                      {output.label}
                    </label>
                  ))}
                </div>
              </div>

              <label className="statnav-field statnav-full">
                <span>Notes or ambiguity to remember</span>
                <textarea
                  onChange={(event) => setAnswers((current) => ({ ...current, notes: event.target.value }))}
                  placeholder="Example: These are cage-level biological replicates; day/night should be considered later."
                  value={answers.notes ?? ""}
                />
              </label>
            </div>

            <div className="statnav-actions end">
              <button className="statnav-button primary" onClick={() => void createRecommendation()} type="button">
                Get recommendation
              </button>
            </div>
          </section>
        ) : null}

        {step === "recommendation" && profile && recommendation ? (
          <section className="statnav-section">
            <div className="statnav-recommendation">
              <div className="statnav-card statnav-recommendation-main">
                <p className="statnav-kicker">Rule-based recommendation</p>
                <h2>{recommendation.recommendedAnalysis}</h2>
                <p className="statnav-confidence">Confidence: {recommendation.confidence}</p>
                {recommendation.suggestedFormula ? (
                  <pre className="statnav-formula">{recommendation.suggestedFormula}</pre>
                ) : null}
                <p>{recommendation.plainLanguageExplanation}</p>
                <div className="statnav-actions">
                  <button
                    className="statnav-button primary"
                    disabled={!recommendation.supportedByRunner}
                    onClick={() => void runAnalysis()}
                    type="button"
                  >
                    Run analysis
                  </button>
                  <button className="statnav-button secondary" onClick={() => void convertTable()} type="button">
                    Convert table
                  </button>
                  <button className="statnav-button ghost" onClick={() => setStep("questionnaire")} type="button">
                    Adjust answers
                  </button>
                </div>
                {!recommendation.supportedByRunner ? (
                  <p className="statnav-inline-warning">
                    This recommendation is included in the MVP guidance, but execution is not implemented yet.
                  </p>
                ) : null}
              </div>

              <aside className="statnav-card">
                <p className="statnav-kicker">Table format</p>
                <h3>Required: {recommendation.requiredTableFormat}</h3>
                <p>Current profiler call: {profile.tableShape}</p>
                <p>
                  {recommendation.requiredTableFormat === "long"
                    ? "Long format means one row per observation, subject/sample ID, time/session if repeated, and one outcome column."
                    : "Wide format can be useful for paired summaries, but most modeling paths prefer long/tidy data."}
                </p>
              </aside>
            </div>

            <section className="statnav-grid two">
              <div className="statnav-card">
                <h3>Why this fits</h3>
                <ul className="statnav-clean-list">
                  {recommendation.whyItFits.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
              <div className="statnav-card">
                <h3>What each factor means</h3>
                <ul className="statnav-clean-list">
                  {recommendation.factorMeanings.map((item) => (
                    <li key={`${item.term}-${item.meaning}`}>
                      <strong>{item.term}:</strong> {item.meaning}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="statnav-card">
                <h3>Assumptions</h3>
                <ul className="statnav-clean-list">
                  {recommendation.assumptions.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
              <div className="statnav-card">
                <h3>Possible alternatives</h3>
                <ul className="statnav-clean-list">
                  {recommendation.possibleAlternatives.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            </section>

            <section className="statnav-card">
              <p className="statnav-kicker">Rule trace</p>
              <ul className="statnav-trace">
                {recommendation.ruleTrace.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
              <p className="statnav-inline-warning">
                MVP AI layer note: the explanation is rule-grounded and cannot silently override the decision engine.
                A future LLM explanation route should display disagreements explicitly.
              </p>
            </section>

            <WarningList warnings={recommendation.warnings} />

            {conversion ? (
              <section className="statnav-card">
                <div className="statnav-card-head">
                  <div>
                    <p className="statnav-kicker">Converted table</p>
                    <h3>
                      {conversion.direction === "wide_to_long" ? "Wide to long" : "Long to wide"} conversion
                    </h3>
                    <p>
                      {conversion.rows.toLocaleString()} rows, {conversion.columns.toLocaleString()} columns.
                    </p>
                  </div>
                  <div className="statnav-actions">
                    <a className="statnav-button secondary" href={conversion.csvDownload}>
                      Download CSV
                    </a>
                    <a className="statnav-button secondary" href={conversion.xlsxDownload}>
                      Download XLSX
                    </a>
                  </div>
                </div>
                <ul className="statnav-clean-list">
                  {conversion.notes.map((note) => (
                    <li key={note}>{note}</li>
                  ))}
                </ul>
                <div className="statnav-table-wrap compact">
                  <table className="statnav-table">
                    <thead>
                      <tr>
                        {conversion.columnNames.slice(0, 8).map((column) => (
                          <th key={column}>{column}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {conversion.preview.map((row, index) => (
                        <tr key={index}>
                          {conversion.columnNames.slice(0, 8).map((column) => (
                            <td key={column}>{safeCell(row[column])}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            ) : null}
          </section>
        ) : null}

        {step === "results" && analysis ? (
          <section className="statnav-section">
            <div className="statnav-card statnav-card-head">
              <div>
                <p className="statnav-kicker">Completed analysis</p>
                <h2>{analysis.analysisName}</h2>
                <p>n used: {analysis.nUsed.toLocaleString()}</p>
                {analysis.formula ? <pre className="statnav-formula">{analysis.formula}</pre> : null}
              </div>
              <div className="statnav-actions">
                {analysis.resultCsvDownload ? (
                  <a className="statnav-button secondary" href={analysis.resultCsvDownload}>
                    Results CSV
                  </a>
                ) : null}
                {analysis.resultXlsxDownload ? (
                  <a className="statnav-button secondary" href={analysis.resultXlsxDownload}>
                    Results XLSX
                  </a>
                ) : null}
                <button className="statnav-button ghost" onClick={() => setStep("recommendation")} type="button">
                  Back to recommendation
                </button>
              </div>
            </div>

            <WarningList warnings={analysis.warnings} />

            <section className="statnav-grid two">
              <div className="statnav-card">
                <h3>Plain-language interpretation</h3>
                <p>{analysis.interpretation}</p>
              </div>
              <div className="statnav-card">
                <h3>Draft Methods</h3>
                <p>{analysis.methodsText}</p>
              </div>
              <div className="statnav-card statnav-full">
                <h3>Draft Results</h3>
                <p>{analysis.resultsText}</p>
              </div>
            </section>

            {analysis.graphDownload ? (
              <section className="statnav-card">
                <div className="statnav-card-head">
                  <div>
                    <p className="statnav-kicker">Graph</p>
                    <h3>Suggested visualization</h3>
                  </div>
                  <a className="statnav-button secondary" href={analysis.graphDownload}>
                    Download graph
                  </a>
                </div>
                <img alt={`${analysis.analysisName} graph`} className="statnav-graph" src={analysis.graphDownload} />
              </section>
            ) : null}

            <ResultTables tables={analysis.tables} />
          </section>
        ) : null}
      </main>
    </div>
  );
}
