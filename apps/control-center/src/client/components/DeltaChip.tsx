/**
 * Tone is decided by the rule that produced `value`, never by the sign of
 * the number itself: cost up is a warning, followers up is a success, AUM is
 * neutral either way.
 */
export function DeltaChip(props: {
  value: string;
  tone: 'good' | 'bad' | 'neutral';
}) {
  return <span className={`delta-chip ${props.tone}`}>{props.value}</span>;
}
