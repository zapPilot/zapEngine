import { useState } from 'react';

/**
 * An identifier an operator has to paste somewhere else — an episode UUID, a
 * visual hash. Shortening it to eight characters made the card tidier and made
 * the id useless: every SQL query and every retry command needs the whole
 * value, so it is shown in full and copies on click.
 */
export function CopyableId(props: {
  className?: string;
  label: string;
  value: string;
}) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      aria-label={`Copy ${props.label}`}
      className={['copyable-id', props.className].filter(Boolean).join(' ')}
      onClick={() => {
        void navigator.clipboard?.writeText(props.value).catch(() => undefined);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1200);
      }}
      title={`Copy ${props.label}`}
      type="button"
    >
      {copied ? 'Copied' : props.value}
    </button>
  );
}
