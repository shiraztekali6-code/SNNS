"use client";

import { useState } from "react";
import { generateRAnalysisCode } from "@/lib/statnav/r_code_generator";
import type { DesiredOutput, ExperimentDesign, GraphSpec, StatRecommendation, TableProfile } from "@/lib/statnav/types";

export function RCodeCard({
  design,
  graphSpec,
  profile,
  recommendation,
  selectedOutputs
}: {
  profile: TableProfile;
  design: ExperimentDesign;
  recommendation: StatRecommendation;
  selectedOutputs: DesiredOutput[];
  graphSpec: GraphSpec | null;
}) {
  const [code, setCode] = useState("");
  const [copyStatus, setCopyStatus] = useState("");

  function generateCode() {
    setCopyStatus("");
    setCode(generateRAnalysisCode({ profile, design, recommendation, selectedOutputs, graphSpec }));
  }

  async function copyCode() {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopyStatus("Copied R code.");
    } catch {
      setCopyStatus("Could not copy automatically. You can select the code and copy it manually.");
    }
  }

  function downloadCode() {
    if (!code) return;
    const blob = new Blob([code], { type: "text/x-r-source;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "statistics-navigator-analysis.R";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="statnav-card statnav-r-code-card">
      <div className="statnav-card-head">
        <div>
          <p className="statnav-kicker">R code</p>
          <h2>Generate an R script for this analysis</h2>
          <p>
            This creates editable R code for the recommended analysis and the outputs you requested. Review the code and column choices before using it for final reporting.
          </p>
        </div>
        <button className="statnav-button primary" onClick={generateCode} type="button">
          Generate R code
        </button>
      </div>

      {code ? (
        <>
          <div className="statnav-actions">
            <button className="statnav-button secondary" onClick={() => void copyCode()} type="button">
              Copy R code
            </button>
            <button className="statnav-button secondary" onClick={downloadCode} type="button">
              Download .R file
            </button>
          </div>
          {copyStatus ? <p className="statnav-table-note">{copyStatus}</p> : null}
          <textarea
            aria-label="Generated R code"
            className="statnav-r-code-output"
            onChange={(event) => setCode(event.target.value)}
            spellCheck={false}
            value={code}
          />
        </>
      ) : (
        <p className="statnav-inline-warning">
          The script uses your uploaded table columns, the rule-based recommendation, and the graph plan. It does not silently change the statistical decision.
        </p>
      )}
    </section>
  );
}
