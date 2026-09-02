import type { ReactNode } from 'react';

import type { DeltaTone, StatementSegment } from '../../shared/statements.js';
import type { OperationalStatus } from '../../shared/types.js';
import { DeltaChip } from './DeltaChip.js';
import { Sparkline } from './Sparkline.js';
import { renderSentence, toneColor } from './statement-sentence.js';

/**
 * One row of Home's "Read this first" panel — L0 Statement always visible,
 * L1 Evidence an inline `<details>` expander. The sentence, sparkline and
 * figures are the whole verdict; `evidence` is the existing panel that
 * proves it, never a raw table at L0.
 */
export function Statement(props: {
  status: OperationalStatus;
  sentence: StatementSegment[];
  kicker: string;
  series: readonly number[];
  value: string;
  delta: string;
  deltaTone: DeltaTone;
  evidence?: ReactNode;
  open?: boolean;
}) {
  return (
    <details className={`statement-row ${props.status}`} open={props.open}>
      <summary className="statement-summary">
        <span className="statement-dot" />
        <span className="statement-body">
          <p className="statement-sentence">{renderSentence(props.sentence)}</p>
          <span className="statement-kicker">{props.kicker}</span>
        </span>
        <Sparkline series={props.series} tone={toneColor(props.deltaTone)} />
        <span className="statement-figures">
          <strong>{props.value}</strong>
          <DeltaChip value={props.delta} tone={props.deltaTone} />
        </span>
        <span className="statement-toggle">Evidence</span>
      </summary>
      {props.evidence ? (
        <div className="statement-evidence">{props.evidence}</div>
      ) : null}
    </details>
  );
}
