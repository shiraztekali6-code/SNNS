"use client";

import { useState } from "react";
import { AdvancedQuestionnaire } from "./AdvancedQuestionnaire";
import { AssistantInterpretationCard } from "./AssistantInterpretationCard";
import { ChatExperimentIntake } from "./ChatExperimentIntake";
import { DataProfileSummary } from "./DataProfileSummary";
import { FollowUpQuestionCard } from "./FollowUpQuestionCard";
import { GraphClarificationCard } from "./GraphClarificationCard";
import { GraphPlanCard } from "./GraphPlanCard";
import { GraphRequestInput } from "./GraphRequestInput";
import { RecommendationCard } from "./RecommendationCard";
import { RCodeCard } from "./RCodeCard";
import { answersFromExperimentDesign, interpretExperimentDescription } from "@/lib/statnav/experiment_interpreter";
import { applyFollowUpAnswer, getNextFollowUpQuestion } from "@/lib/statnav/followup_question_engine";
import { applyGraphClarificationAnswer, getNextGraphClarificationQuestion } from "@/lib/statnav/graph_question_engine";
import { interpretGraphRequest } from "@/lib/statnav/graph_request_interpreter";
import { buildDefaultGraphSpec } from "@/lib/statnav/graph_spec_builder";
import { decideFromExperimentDesign } from "@/lib/statnav/statistical_decision_engine";
import type {
  AnalysisResult,
  AssistantInterpretation,
  ConversionResult,
  DesiredOutput,
  ExperimentDesign,
  FollowUpQuestion,
  GraphClarificationQuestion,
  GraphSpec,
  StatRecommendation,
  TableProfile
} from "@/lib/statnav/types";

type Step = "start" | "intake" | "recommendation" | "results";

type ApiError = { error?: string };

const OUTPUT_OPTIONS: Array<{ value: DesiredOutput; label: string }> = [
  { value: "p_value", label: "p-value" },
  { value: "graph", label: "Graph" },
  { value: "model_summary", label: "Model summary" },
  { value: "formatted_table", label: "Formatted table" },
  { value: "methods_sentence", label: "Methods sentence" },
  { value: "results_sentence", label: "Results sentence" }
];

function apiJson<T>(url: string, init?: RequestInit): Promise<T> {
  return fetch(url, init).then(async (response) => {
    const payload = (await response.json()) as T & ApiError;
    if (!response.ok) throw new Error(payload.error || `Request failed: ${response.status}`);
    return payload;
  });
}

function safeCell(value: string | number | null): string {
  if (value === null) return "";
  return String(value);
}

function StepPill({ active, children }: { active: boolean; children: React.ReactNode }) {
  return <span className={active ? "statnav-step-pill is-active" : "statnav-step-pill"}>{children}</span>;
}

function PreviewTable({ profile }: { profile: TableProfile }) {
  return (
    <details className="statnav-card statnav-preview-details">
      <summary>Show table preview and detected columns</summary>
      <div className="statnav-table-wrap">
        <table className="statnav-table">
          <thead>
            <tr>
              {profile.columnNames.slice(0, 10).map((column) => <th key={column}>{column}</th>)}
            </tr>
          </thead>
          <tbody>
            {profile.preview.map((row, index) => (
              <tr key={index}>
                {profile.columnNames.slice(0, 10).map((column) => <td key={column}>{safeCell(row[column])}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="statnav-column-grid">
        {profile.columnProfiles.map((column) => (
          <article className="statnav-column-card" key={column.name}>
            <h3>{column.name}</h3>
            <p>{column.detectedTypes.join(" + ")}</p>
            <div className="statnav-column-meta">
              <span>{column.uniqueValues} unique</span>
              <span>{column.missingValues} missing</span>
            </div>
          </article>
        ))}
      </div>
    </details>
  );
}

function ConversionPanel({ conversion }: { conversion: ConversionResult | null }) {
  if (!conversion) return null;
  return (
    <section className="statnav-card">
      <div className="statnav-card-head">
        <div>
          <p className="statnav-kicker">Prepared table</p>
          <h3>{conversion.direction === "wide_to_long" ? "Wide to long" : "Long to wide"} conversion</h3>
          <p>{conversion.rows.toLocaleString()} rows, {conversion.columns.toLocaleString()} columns.</p>
        </div>
        <div className="statnav-actions">
          <a className="statnav-button secondary" href={conversion.csvDownload}>Download CSV</a>
          <a className="statnav-button secondary" href={conversion.xlsxDownload}>Download XLSX</a>
        </div>
      </div>
      <ul className="statnav-clean-list">
        {conversion.notes.map((note) => <li key={note}>{note}</li>)}
      </ul>
    </section>
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
                <tr>{table.columns.map((column) => <th key={column}>{column}</th>)}</tr>
              </thead>
              <tbody>
                {table.rows.slice(0, 12).map((row, rowIndex) => (
                  <tr key={rowIndex}>
                    {table.columns.map((column) => <td key={column}>{safeCell(row[column])}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  );
}

function OutputSelectionCard({
  selectedOutputs,
  onToggle
}: {
  selectedOutputs: DesiredOutput[];
  onToggle: (value: DesiredOutput, checked: boolean) => void;
}) {
  return (
    <section className="statnav-card statnav-output-card">
      <p className="statnav-kicker">Outputs</p>
      <h2>What output do you want?</h2>
      <div className="statnav-checkbox-grid">
        {OUTPUT_OPTIONS.map((option) => (
          <label key={option.value}>
            <input
              checked={selectedOutputs.includes(option.value)}
              onChange={(event) => onToggle(option.value, event.target.checked)}
              type="checkbox"
            />
            {option.label}
          </label>
        ))}
      </div>
    </section>
  );
}

export function StatNavigatorApp() {
  const [step, setStep] = useState<Step>("start");
  const [profile, setProfile] = useState<TableProfile | null>(null);
  const [design, setDesign] = useState<ExperimentDesign | null>(null);
  const [interpretation, setInterpretation] = useState<AssistantInterpretation | null>(null);
  const [followUpQuestion, setFollowUpQuestion] = useState<FollowUpQuestion | null>(null);
  const [recommendation, setRecommendation] = useState<StatRecommendation | null>(null);
  const [conversion, setConversion] = useState<ConversionResult | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [selectedOutputs, setSelectedOutputs] = useState<DesiredOutput[]>([
    "p_value",
    "graph",
    "model_summary",
    "formatted_table",
    "methods_sentence",
    "results_sentence"
  ]);
  const [graphSpec, setGraphSpec] = useState<GraphSpec | null>(null);
  const [graphClarificationQuestion, setGraphClarificationQuestion] = useState<GraphClarificationQuestion | null>(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  async function handleProfileLoaded(nextProfile: TableProfile) {
    setProfile(nextProfile);
    setDesign(null);
    setInterpretation(null);
    setFollowUpQuestion(null);
    setRecommendation(null);
    setAnalysis(null);
    setConversion(null);
    setGraphSpec(null);
    setGraphClarificationQuestion(null);
    setStep("intake");
  }

  async function uploadFile(file: File) {
    setError("");
    setStatus("Uploading and reading your table...");
    const formData = new FormData();
    formData.append("file", file);
    try {
      const payload = await apiJson<{ profile: TableProfile }>("/api/statnav/upload", { method: "POST", body: formData });
      await handleProfileLoaded(payload.profile);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setStatus("");
    }
  }

  async function loadExample() {
    setError("");
    setStatus("Loading the mouse movement example...");
    try {
      const payload = await apiJson<{ profile: TableProfile }>("/api/statnav/example");
      await handleProfileLoaded(payload.profile);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load example.");
    } finally {
      setStatus("");
    }
  }

  function recommendWithDesign(nextDesign: ExperimentDesign) {
    if (!profile) return;
    const nextRecommendation = decideFromExperimentDesign(profile, nextDesign);
    setRecommendation(nextRecommendation);
    setConversion(null);
    setAnalysis(null);
    if (selectedOutputs.includes("graph") && !graphSpec) {
      setGraphSpec(buildDefaultGraphSpec(profile, nextDesign));
    }
    setStep("recommendation");
  }

  function handleExperimentDescription(description: string) {
    if (!profile) return;
    const result = interpretExperimentDescription(profile, description);
    setDesign(result.design);
    setInterpretation(result.interpretation);
    const nextQuestion = getNextFollowUpQuestion(profile, result.design);
    setFollowUpQuestion(nextQuestion);
    setRecommendation(null);
    if (selectedOutputs.includes("graph") && graphSpec) {
      const nextGraphQuestion = getNextGraphClarificationQuestion(profile, result.design, graphSpec);
      setGraphClarificationQuestion(nextGraphQuestion);
    }
    if (!nextQuestion) recommendWithDesign(result.design);
  }

  function answerFollowUp(value: string) {
    if (!profile || !design || !followUpQuestion) return;
    const nextDesign = applyFollowUpAnswer(design, followUpQuestion, value);
    setDesign(nextDesign);
    setFollowUpQuestion(null);
    if (graphSpec) {
      setGraphClarificationQuestion(getNextGraphClarificationQuestion(profile, nextDesign, graphSpec));
    }
    recommendWithDesign(nextDesign);
  }

  function toggleOutput(output: DesiredOutput, checked: boolean) {
    setSelectedOutputs((current) => {
      const next = checked ? Array.from(new Set([...current, output])) : current.filter((item) => item !== output);
      if (output === "graph" && !checked) {
        setGraphSpec(null);
        setGraphClarificationQuestion(null);
      }
      return next;
    });
  }

  function handleGraphRequest(text: string) {
    if (!profile) return;
    const nextSpec = interpretGraphRequest(profile, design, text);
    setGraphSpec(nextSpec);
    setGraphClarificationQuestion(getNextGraphClarificationQuestion(profile, design, nextSpec));
  }

  function generateDefaultGraphSpec() {
    if (!profile) return;
    const nextSpec = buildDefaultGraphSpec(profile, design);
    setGraphSpec(nextSpec);
    setGraphClarificationQuestion(getNextGraphClarificationQuestion(profile, design, nextSpec));
  }

  function answerGraphClarification(value: string) {
    if (!graphSpec || !graphClarificationQuestion) return;
    const nextSpec = applyGraphClarificationAnswer(graphSpec, graphClarificationQuestion, value);
    setGraphSpec(nextSpec);
    setGraphClarificationQuestion(null);
  }

  async function convertTable() {
    if (!profile || !design) return;
    setError("");
    setStatus("Preparing a table shaped for the recommended analysis...");
    try {
      const direction = profile.appearsWide && !profile.appearsLong ? "wide_to_long" : "long_to_wide";
      const payload = await apiJson<{ result: ConversionResult }>("/api/statnav/convert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ datasetId: profile.datasetId, profile, answers: answersFromExperimentDesign(design, selectedOutputs), direction })
      });
      setConversion(payload.result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not convert table.");
    } finally {
      setStatus("");
    }
  }

  async function runAnalysis() {
    if (!profile || !design) return;
    setError("");
    setStatus("Running the analysis and writing the report pieces...");
    try {
      const payload = await apiJson<{ result: AnalysisResult }>("/api/statnav/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ datasetId: profile.datasetId, profile, answers: answersFromExperimentDesign(design, selectedOutputs) })
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
      <header className="statnav-hero statnav-hero-compact">
        <nav className="statnav-topbar" aria-label="Statistics Navigator workflow">
          <a href="/" className="statnav-brand"><span>Statistics Navigator</span></a>
          <div className="statnav-stepper">
            <StepPill active={step === "start" || step === "intake"}>Upload</StepPill>
            <StepPill active={step === "intake" && Boolean(profile)}>Describe</StepPill>
            <StepPill active={step === "recommendation"}>Recommendation</StepPill>
            <StepPill active={step === "results"}>Results</StepPill>
          </div>
        </nav>
        <section className="statnav-hero-copy statnav-hero-copy-wide">
          <p className="statnav-kicker">Chat-guided statistics for lab people</p>
          <h1>Statistics Navigator for Non-Statisticians</h1>
          <p className="statnav-hebrew" dir="rtl">סטטיסטיקה להדיוטות</p>
          <p className="statnav-lede">
            Upload your table, describe the experiment in your own words, and I’ll ask only the details needed to avoid a wrong test.
          </p>
          <div className="statnav-actions">
            <label className="statnav-button primary">
              Upload CSV/XLSX
              <input accept=".csv,.xlsx" hidden onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void uploadFile(file);
              }} type="file" />
            </label>
            <button className="statnav-button secondary" onClick={() => void loadExample()} type="button">Use mouse activity example</button>
          </div>
          <p className="statnav-upload-hint">
            Excel upload currently supports modern <strong>.xlsx</strong> files. If your file ends in <strong>.xls</strong>, save it as .xlsx or CSV first.
          </p>
        </section>
      </header>

      <main className="statnav-main">
        {status ? <div className="statnav-status">{status}</div> : null}
        {error ? <div className="statnav-error">{error}</div> : null}

        {step === "start" ? (
          <section className="statnav-grid three">
            <article className="statnav-card"><span className="statnav-number">1</span><h3>Upload a table</h3><p>CSV or modern XLSX. I’ll summarize the rows, columns, likely measurements, groups, and IDs.</p></article>
            <article className="statnav-card"><span className="statnav-number">2</span><h3>Describe the experiment</h3><p>Use ordinary language. No need to know words like paired, interaction, or non-parametric.</p></article>
            <article className="statnav-card"><span className="statnav-number">3</span><h3>Answer one detail</h3><p>If something matters for independence, I’ll ask one targeted question before recommending a model.</p></article>
          </section>
        ) : null}

        {step === "intake" && profile ? (
          <section className="statnav-section statnav-chat-flow">
            <DataProfileSummary profile={profile} />
            <ChatExperimentIntake disabled={Boolean(status)} onSubmit={handleExperimentDescription} />
            {interpretation ? <AssistantInterpretationCard interpretation={interpretation} /> : null}
            {followUpQuestion ? <FollowUpQuestionCard question={followUpQuestion} onAnswer={answerFollowUp} /> : null}
            <OutputSelectionCard selectedOutputs={selectedOutputs} onToggle={toggleOutput} />
            {selectedOutputs.includes("graph") ? (
              <>
                <GraphRequestInput
                  disabled={Boolean(status)}
                  onGenerateDefault={generateDefaultGraphSpec}
                  onSubmit={handleGraphRequest}
                />
                {graphSpec ? <GraphPlanCard spec={graphSpec} /> : null}
                {graphClarificationQuestion ? (
                  <GraphClarificationCard question={graphClarificationQuestion} onAnswer={answerGraphClarification} />
                ) : null}
              </>
            ) : null}
            {design && !followUpQuestion ? (
              <div className="statnav-actions end">
                <button className="statnav-button primary" onClick={() => recommendWithDesign(design)} type="button">
                  Show recommendation
                </button>
              </div>
            ) : null}
            <AdvancedQuestionnaire
              design={design}
              onDesignChange={(nextDesign) => {
                setDesign(nextDesign);
                setRecommendation(null);
                setFollowUpQuestion(null);
              }}
              profile={profile}
            />
            {design ? (
              <div className="statnav-actions end">
                <button className="statnav-button secondary" onClick={() => recommendWithDesign(design)} type="button">
                  Use this design
                </button>
              </div>
            ) : null}
            <PreviewTable profile={profile} />
          </section>
        ) : null}

        {step === "recommendation" && profile && recommendation ? (
          <section className="statnav-section">
            {interpretation ? <AssistantInterpretationCard interpretation={interpretation} /> : null}
            {selectedOutputs.includes("graph") && graphSpec ? (
              <section className="statnav-card statnav-planned-graphs-card">
                <p className="statnav-kicker">Planned Graphs</p>
                <h2>What the graph will show</h2>
                <p>
                  This graph plan refines the visualization only. It does not override the statistical design or model recommendation.
                </p>
                <GraphPlanCard spec={graphSpec} />
              </section>
            ) : null}
            <RecommendationCard
              currentTableShape={profile.tableShape}
              onConvert={() => void convertTable()}
              onRun={() => void runAnalysis()}
              recommendation={recommendation}
            />
            <ConversionPanel conversion={conversion} />
            <div className="statnav-actions">
              <button className="statnav-button ghost" onClick={() => setStep("intake")} type="button">Adjust description or advanced design</button>
            </div>
            {design ? (
              <RCodeCard
                design={design}
                graphSpec={selectedOutputs.includes("graph") ? graphSpec : null}
                profile={profile}
                recommendation={recommendation}
                selectedOutputs={selectedOutputs}
              />
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
                {analysis.resultCsvDownload ? <a className="statnav-button secondary" href={analysis.resultCsvDownload}>Results CSV</a> : null}
                {analysis.resultXlsxDownload ? <a className="statnav-button secondary" href={analysis.resultXlsxDownload}>Results XLSX</a> : null}
                <button className="statnav-button ghost" onClick={() => setStep("recommendation")} type="button">Back to recommendation</button>
              </div>
            </div>
            <section className="statnav-grid two">
              <div className="statnav-card"><h3>Plain-language interpretation</h3><p>{analysis.interpretation}</p></div>
              <div className="statnav-card"><h3>Draft Methods</h3><p>{analysis.methodsText}</p></div>
              <div className="statnav-card statnav-full"><h3>Draft Results</h3><p>{analysis.resultsText}</p></div>
            </section>
            {selectedOutputs.includes("graph") && graphSpec ? (
              <section className="statnav-card statnav-planned-graphs-card">
                <p className="statnav-kicker">Planned Graphs</p>
                <h2>Graph plan used for this result</h2>
                <p>
                  The generated MVP graph may be simpler than this plan, but this is the graph structure the assistant understood from your request.
                </p>
                <GraphPlanCard spec={graphSpec} />
              </section>
            ) : null}
            {analysis.graphDownload ? (
              <section className="statnav-card">
                <div className="statnav-card-head">
                  <div><p className="statnav-kicker">Graph</p><h3>Suggested visualization</h3></div>
                  <a className="statnav-button secondary" href={analysis.graphDownload}>Download graph</a>
                </div>
                <img alt={`${analysis.analysisName} graph`} className="statnav-graph" src={analysis.graphDownload} />
              </section>
            ) : null}
            <ResultTables tables={analysis.tables} />
            {profile && design && recommendation ? (
              <RCodeCard
                design={design}
                graphSpec={selectedOutputs.includes("graph") ? graphSpec : null}
                profile={profile}
                recommendation={recommendation}
                selectedOutputs={selectedOutputs}
              />
            ) : null}
          </section>
        ) : null}
      </main>
    </div>
  );
}
