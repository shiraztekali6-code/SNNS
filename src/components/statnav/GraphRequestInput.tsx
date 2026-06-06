import { useState } from "react";

const GRAPH_EXAMPLES = [
  { label: "Longitudinal line graph", text: "I want a line graph of the mean over time with one line per treatment group." },
  { label: "Mean +/- SEM", text: "I want a mean +/- SEM graph over time." },
  { label: "Boxplot + points", text: "I want a boxplot with individual data points." },
  { label: "Bar plot", text: "I want a bar graph comparing treated and untreated animals." },
  { label: "Scatter + regression", text: "I want a scatter plot with a regression line." },
  { label: "Paired before/after", text: "I want a before/after paired plot." },
  { label: "Separate panels by sex", text: "I want one graph for males and one for females." },
  { label: "Separate panels by day/night", text: "I want separate graphs for Day and Night." }
];

export function GraphRequestInput({
  disabled,
  onGenerateDefault,
  onSubmit
}: {
  disabled?: boolean;
  onGenerateDefault: () => void;
  onSubmit: (text: string) => void;
}) {
  const [text, setText] = useState("");

  return (
    <section className="statnav-card statnav-graph-request-card">
      <p className="statnav-kicker">Graph request</p>
      <h2>Describe the graph(s) you want</h2>
      <p>
        Tell me what the graph should show. You can ask for panels, separate subsets, points, SEM bars, or trendlines in plain language.
      </p>
      <textarea
        className="statnav-chat-input"
        disabled={disabled}
        onChange={(event) => setText(event.target.value)}
        placeholder="Example: I want a line graph of movement over time, with one line per treatment group and SEM error bars."
        value={text}
      />
      <div className="statnav-example-chips" aria-label="Graph request examples">
        {GRAPH_EXAMPLES.map((example) => (
          <button key={example.label} type="button" onClick={() => setText(example.text)}>
            {example.label}
          </button>
        ))}
      </div>
      <div className="statnav-actions">
        <button
          className="statnav-button primary"
          disabled={disabled || text.trim().length < 8}
          onClick={() => onSubmit(text.trim())}
          type="button"
        >
          Interpret graph request
        </button>
        <button className="statnav-button secondary" disabled={disabled} onClick={onGenerateDefault} type="button">
          Generate example graph specification
        </button>
      </div>
    </section>
  );
}
