import type { FollowUpQuestion } from "@/lib/statnav/types";

export function FollowUpQuestionCard({
  question,
  onAnswer
}: {
  question: FollowUpQuestion;
  onAnswer: (value: string) => void;
}) {
  return (
    <section className="statnav-card statnav-followup-card">
      <p className="statnav-kicker">One detail before I recommend a test</p>
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
