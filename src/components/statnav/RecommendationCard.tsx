import type { StatRecommendation, TableProfile } from "@/lib/statnav/types";

function prismMessage(recommendation: StatRecommendation) {
  if (recommendation.id === "linear-mixed-effects-model") {
    return "Prism is not ideal for this as a primary analysis. R is recommended for the mixed model and follow-up contrasts.";
  }
  if (recommendation.id === "two-way-anova" || recommendation.id === "one-way-anova" || recommendation.id.includes("t-test")) {
    return "Prism can usually do this if the table is arranged correctly, but still check assumptions and independence.";
  }
  if (recommendation.id === "prepare-technical-replicates") {
    return "Prism can graph the prepared data, but first combine technical replicates outside the final test table.";
  }
  return "Prism may help with graphs, but R/Python is safer for a reproducible analysis workflow.";
}

function graphSuggestion(recommendation: StatRecommendation) {
  if (recommendation.id === "linear-mixed-effects-model") {
    return "Line graph: time/session on X, measurement on Y, one line per group, mean +/- SEM or CI.";
  }
  if (recommendation.id === "paired-t-test") return "Before/after paired line plot with each animal/sample connected.";
  if (recommendation.id === "linear-regression") return "Scatter plot with regression line.";
  if (recommendation.family === "categorical") return "Stacked or grouped proportion bar plot.";
  return "Box/violin plot or bar plot with individual points visible.";
}

export function RecommendationCard({
  currentTableShape,
  onConvert,
  onRun,
  recommendation
}: {
  currentTableShape: TableProfile["tableShape"];
  recommendation: StatRecommendation;
  onConvert: () => void;
  onRun: () => void;
}) {
  const tableOk = recommendation.requiredTableFormat === currentTableShape || recommendation.requiredTableFormat === "ambiguous";

  return (
    <section className="statnav-card statnav-recommendation-main">
      <p className="statnav-kicker">Recommendation</p>
      <h2>{recommendation.recommendedAnalysis}</h2>
      <p className="statnav-confidence">Confidence: {recommendation.confidence}</p>
      {recommendation.suggestedFormula ? <pre className="statnav-formula">{recommendation.suggestedFormula}</pre> : null}
      <p>{recommendation.plainLanguageExplanation}</p>

      <div className="statnav-recommendation-grid">
        <div>
          <h3>Why this fits</h3>
          <ul className="statnav-clean-list">
            {recommendation.whyItFits.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </div>
        <div>
          <h3>Why simpler tests may be wrong</h3>
          <ul className="statnav-clean-list">
            {recommendation.possibleAlternatives.slice(0, 3).map((item) => <li key={item}>{item}</li>)}
          </ul>
        </div>
        <div>
          <h3>Table format</h3>
          <p>Needed: <strong>{recommendation.requiredTableFormat}</strong>. Current table: <strong>{currentTableShape}</strong>.</p>
          <p>{tableOk ? "Your table looks close enough for this MVP runner." : "Your table is close, but this model needs a different shape."}</p>
        </div>
        <div>
          <h3>Prism or R?</h3>
          <p>{prismMessage(recommendation)}</p>
        </div>
        <div>
          <h3>Suggested graph</h3>
          <p>{graphSuggestion(recommendation)}</p>
        </div>
        <div>
          <h3>Red flags</h3>
          <ul className="statnav-clean-list">
            {recommendation.warnings.slice(0, 4).map((warning) => <li key={warning}>{warning}</li>)}
          </ul>
        </div>
      </div>

      <div className="statnav-methods-results">
        <div>
          <h3>Methods text starter</h3>
          <p>{recommendation.suggestedFormula ? `Data were analyzed using ${recommendation.recommendedAnalysis} with formula ${recommendation.suggestedFormula}.` : `Data were analyzed using ${recommendation.recommendedAnalysis}.`}</p>
        </div>
        <div>
          <h3>Results text template</h3>
          <p>Report the main effect/contrast, test statistic, p-value, confidence interval where available, and a plain-language direction of the effect.</p>
        </div>
      </div>

      <div className="statnav-actions">
        <button className="statnav-button primary" disabled={!recommendation.supportedByRunner} onClick={onRun} type="button">
          Run this analysis
        </button>
        <button className="statnav-button secondary" onClick={onConvert} type="button">
          Prepare/convert table
        </button>
      </div>
      {!recommendation.supportedByRunner ? (
        <p className="statnav-inline-warning">This recommendation is guidance-only for now. The MVP runner will not execute it until the table is prepared.</p>
      ) : null}
    </section>
  );
}
