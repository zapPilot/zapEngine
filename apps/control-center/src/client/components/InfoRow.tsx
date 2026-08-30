/**
 * One labelled fact with optional supporting lines. Every decision panel in the
 * dashboard is a stack of these, so the label/value rhythm stays identical
 * whichever view a reader lands on.
 */
export function InfoRow(props: {
  label: string;
  notes?: (string | null | undefined)[];
  value: string;
}) {
  const notes = (props.notes ?? []).filter(
    (note): note is string => typeof note === 'string' && note.length > 0,
  );
  return (
    <div className="info-row">
      <span className="info-label">{props.label}</span>
      <strong className="info-value">{props.value}</strong>
      {notes.map((note) => (
        <small className="info-note" key={note}>
          {note}
        </small>
      ))}
    </div>
  );
}
