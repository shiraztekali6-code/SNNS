import type { TableProfile } from "@/lib/statnav/types";

function shortList(values: string[], empty = "nothing obvious yet") {
  if (!values.length) return empty;
  return values.slice(0, 4).join(", ") + (values.length > 4 ? ` +${values.length - 4} more` : "");
}

function prioritize(values: string[], patterns: RegExp[]) {
  return [...values].sort((a, b) => {
    const aScore = patterns.findIndex((pattern) => pattern.test(a));
    const bScore = patterns.findIndex((pattern) => pattern.test(b));
    const normalizedA = aScore === -1 ? 999 : aScore;
    const normalizedB = bScore === -1 ? 999 : bScore;
    return normalizedA - normalizedB;
  });
}

export function DataProfileSummary({ profile }: { profile: TableProfile }) {
  const measurement = shortList(prioritize(profile.numericOutcomeColumns, [/movement/i, /activity/i, /mean/i]));
  const group = shortList(prioritize(profile.possibleGroupColumns, [/^group$/i, /treatment/i, /condition/i]));
  const time = shortList(prioritize(profile.possibleTimeColumns, [/^session_number$/i, /session/i, /time/i, /day/i]));
  const subject = shortList(prioritize(profile.possibleSubjectIdColumns, [/cage/i, /mouse/i, /subject/i, /sample/i]));

  return (
    <section className="statnav-card statnav-profile-summary">
      <p className="statnav-kicker">What I found in your table</p>
      <h2>{profile.fileName}</h2>
      <p className="statnav-friendly-summary">I found:</p>
      <ul className="statnav-found-list">
        <li><strong>{profile.rows.toLocaleString()}</strong> rows</li>
        <li><strong>{profile.columns.toLocaleString()}</strong> columns</li>
        <li>possible measurement column: <strong>{measurement}</strong></li>
        <li>possible groups column: <strong>{group}</strong></li>
        <li>possible time/session column: <strong>{time}</strong></li>
        <li>possible animal/sample/cage column: <strong>{subject}</strong></li>
      </ul>
      <div className="statnav-profile-footnotes">
        <span>Your table looks {profile.tableShape}.</span>
        <span>{profile.missingCells ? `${profile.missingCells} missing cells found.` : "No missing cells found."}</span>
        {profile.repeatedMeasuresLikely ? <span>Some rows look like the same unit measured again.</span> : null}
      </div>
    </section>
  );
}
