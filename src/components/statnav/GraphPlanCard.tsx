import { describeGraphType } from "@/lib/statnav/graph_spec_builder";
import type { GraphSpec } from "@/lib/statnav/types";

function valueOrDash(value?: string) {
  return value || "Not set yet";
}

function listOrDash(values: string[]) {
  return values.length ? values.join(", ") : "None";
}

export function GraphPlanCard({ spec }: { spec: GraphSpec }) {
  return (
    <section className="statnav-card statnav-graph-plan-card">
      <p className="statnav-kicker">Graph Plan</p>
      <h2>I think you want: {describeGraphType(spec.graphType)}</h2>
      <div className="statnav-graph-plan-grid">
        <span><small>Graph type</small><strong>{describeGraphType(spec.graphType)}</strong></span>
        <span><small>X-axis</small><strong>{valueOrDash(spec.xAxis)}</strong></span>
        <span><small>Y-axis</small><strong>{valueOrDash(spec.yAxis)}</strong></span>
        <span><small>Color/grouping</small><strong>{valueOrDash(spec.colorBy)}</strong></span>
        <span><small>Error bars</small><strong>{spec.showErrorBars ? spec.errorBarType : "None"}</strong></span>
        <span><small>Individual points</small><strong>{spec.showIndividualPoints ? "Show" : "Do not show"}</strong></span>
        <span><small>Faceting/panels</small><strong>{listOrDash(spec.facetBy)}</strong></span>
        <span><small>Separate subsets</small><strong>{listOrDash(spec.splitBy)}</strong></span>
        <span><small>Trendline</small><strong>{spec.showTrendline ? "Yes" : "No"}</strong></span>
      </div>
      {spec.notes.length ? (
        <div className="statnav-graph-notes">
          <h3>Notes</h3>
          <ul className="statnav-clean-list">
            {spec.notes.map((note) => <li key={note}>{note}</li>)}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
