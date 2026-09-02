import type { ReactNode } from 'react';

import type {
  StatementFact,
  StatementSegment,
} from '../../shared/statements.js';
import type { OperationalStatus } from '../../shared/types.js';
import { renderSentence } from './statement-sentence.js';

/**
 * The page-top banner on Growth, Product, Reliability, Pipeline and
 * Economics: one bigger sentence (two or three rules' segments
 * concatenated) plus the facts that back it. `action` is the one page-
 * specific control (Reliability's read-only Fly link) that sits beside it.
 */
export function StatementHeader(props: {
  status: OperationalStatus;
  sentence: StatementSegment[];
  facts: StatementFact[];
  action?: ReactNode;
}) {
  return (
    <section className={`statement-header ${props.status}`}>
      <div className="statement-header-top">
        <p className="statement-header-sentence">
          {renderSentence(props.sentence)}
        </p>
        {props.action}
      </div>
      {props.facts.length > 0 ? (
        <div className="statement-header-facts">
          {props.facts.map((fact, index) => (
            <div className="statement-header-fact" key={index}>
              <span>{fact.kicker}</span>
              <strong>{fact.value}</strong>
              <small>{fact.note}</small>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
