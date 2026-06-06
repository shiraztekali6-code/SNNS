import type { AssistantInterpretation } from "@/lib/statnav/types";

export function AssistantInterpretationCard({ interpretation }: { interpretation: AssistantInterpretation }) {
  return (
    <section className="statnav-card statnav-assistant-card">
      <p className="statnav-kicker">My read of your experiment</p>
      <h2>{interpretation.summary}</h2>
      <div className="statnav-detected-grid">
        <span><small>Measurement</small><strong>{interpretation.detected.measurement ?? "Not sure yet"}</strong></span>
        <span><small>Groups</small><strong>{interpretation.detected.group ?? "Not sure yet"}</strong></span>
        <span><small>Time/session</small><strong>{interpretation.detected.time ?? "Not sure yet"}</strong></span>
        <span><small>Same animal/sample/cage</small><strong>{interpretation.detected.subject ?? "Not sure yet"}</strong></span>
      </div>
      <div className="statnav-interpretation-line">
        <strong>Likely goal:</strong> {interpretation.likelyAnalysisGoal}
      </div>
      {interpretation.likelyModel ? (
        <pre className="statnav-formula">Likely model: {interpretation.likelyModel}</pre>
      ) : null}
      <ul className="statnav-clean-list">
        {interpretation.assumptions.map((assumption) => (
          <li key={assumption}>{assumption}</li>
        ))}
      </ul>
    </section>
  );
}
