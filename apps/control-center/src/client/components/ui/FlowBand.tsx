import { ArrowRight } from 'lucide-react';
import { Fragment, type ReactNode } from 'react';

import { toneClass, type Tone } from './tone.js';

export interface FlowStage {
  /** The connector drawn *before* this stage. The first stage has none. */
  connector?: 'dashed' | 'none' | 'solid';
  id: string;
  label: ReactNode;
  note?: string;
  /** Step conversion. Rendered only across a solid connector — see below. */
  rate?: string | null;
  tone?: Tone;
  value: string;
}

/**
 * A horizontal band of stages joined by connectors. Serves both the acquisition
 * funnel and the production stage map.
 *
 * A solid connector means both stages count the same population in the same
 * window, so a step conversion between them is meaningful. A dashed connector
 * means they come from different sources — PostHog counts unique people over 30
 * days, Supabase counts durable rows — and no ratio between them is a funnel
 * conversion. The component drops `rate` on a dashed connector rather than
 * trusting every caller to remember, because that is the rule
 * `docs/waitlist-acquisition.md` exists to protect.
 */
export function FlowBand(props: { stages: FlowStage[] }) {
  return (
    <div className="cc-flow">
      {props.stages.map((stage, index) => (
        <Fragment key={stage.id}>
          {index > 0 ? <Connector stage={stage} /> : null}
          <div className={`cc-flow-stage ${toneClass(stage.tone)}`}>
            <span className="cc-flow-label">{stage.label}</span>
            <strong className="cc-flow-value">{stage.value}</strong>
            {stage.note ? (
              <span className="cc-flow-note">{stage.note}</span>
            ) : null}
          </div>
        </Fragment>
      ))}
    </div>
  );
}

function Connector(props: { stage: FlowStage }) {
  const kind = props.stage.connector ?? 'solid';
  if (kind === 'none') {
    return null;
  }
  const rate = kind === 'solid' ? props.stage.rate : null;
  return (
    <span className="cc-flow-link" data-connector={kind}>
      <ArrowRight aria-hidden="true" />
      {rate ? <span className="cc-flow-rate">{rate}</span> : null}
    </span>
  );
}
