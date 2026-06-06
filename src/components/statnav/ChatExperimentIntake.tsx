import { useState } from "react";

const EXAMPLES = [
  "I have 3 treatment groups and measured movement every 12 hours.",
  "I measured the same mice before and after treatment.",
  "I want to know if treated animals changed differently over time."
];

export function ChatExperimentIntake({
  disabled,
  onSubmit
}: {
  disabled?: boolean;
  onSubmit: (description: string) => void;
}) {
  const [description, setDescription] = useState("");

  return (
    <section className="statnav-card statnav-chat-card">
      <p className="statnav-kicker">Describe your experiment</p>
      <h2>Tell me the story in normal lab language</h2>
      <p>
        What did you measure, what groups do you have, and what do you want to compare? No statistics vocabulary needed.
      </p>
      <textarea
        className="statnav-chat-input"
        disabled={disabled}
        onChange={(event) => setDescription(event.target.value)}
        placeholder="Example: I measured mouse movement every 12 hours in MIX, R837, and RU521 groups. Each group has two cages. I want to know if the treatment changed movement over time."
        value={description}
      />
      <div className="statnav-example-chips" aria-label="Example descriptions">
        {EXAMPLES.map((example) => (
          <button key={example} type="button" onClick={() => setDescription(example)}>
            {example}
          </button>
        ))}
      </div>
      <div className="statnav-actions end">
        <button
          className="statnav-button primary"
          disabled={disabled || description.trim().length < 12}
          onClick={() => onSubmit(description.trim())}
          type="button"
        >
          Help me choose the analysis
        </button>
      </div>
    </section>
  );
}
