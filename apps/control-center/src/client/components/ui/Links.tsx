import { ArrowRight, ExternalLink } from 'lucide-react';

/** The "查看全部 →" affordance in a card header. */
export function ViewAllLink(props: { label: string; onClick: () => void }) {
  return (
    <button className="cc-link" onClick={props.onClick} type="button">
      {props.label}
      <ArrowRight aria-hidden="true" />
    </button>
  );
}

/** Opens the provider's own console. Renders nothing without a URL rather than
 * a dead control, since most signals genuinely have nowhere to link to. */
export function ProviderLink(props: {
  label: string;
  title: string;
  url: string | null | undefined;
}) {
  if (!props.url) {
    return null;
  }
  return (
    <a
      aria-label={`${props.label}: ${props.title}`}
      className="cc-link"
      href={props.url}
      rel="noreferrer"
      target="_blank"
    >
      {props.label}
      <ExternalLink aria-hidden="true" />
    </a>
  );
}
