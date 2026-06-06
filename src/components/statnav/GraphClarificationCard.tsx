import type { GraphClarificationQuestion } from "@/lib/statnav/types";

export function GraphClarificationCard({
  question,
  onAnswer
}: {
  question: GraphClarificationQuestion;
  onAnswer: (value: string) => void;
}) {
  return (
    <section className="statnav-card statnav-graph-clarification-card">
      <p className="statnav-kicker">One graph detail</p>
      <h2>{question.question}</h2>
      <p>{question.whyItMatters}</p>
      <div className="statnav-followup-options">
        {question.options.map((option) => (
          <button key={option.value} type="button" onClick={() => onAnswer(option.value)}>
            {option.label}
          </button>
        ))}
      </div>
    </section>
  );
}
