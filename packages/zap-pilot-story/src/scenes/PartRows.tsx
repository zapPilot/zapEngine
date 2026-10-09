import { SLOGAN_PARTS } from '../brand/index.js';
import { CAPABILITIES } from '../facts/capabilities.js';
import { StatusBadge } from './StatusBadge.js';
export function PartRows() {
  return (
    <ul className="zp-crows">
      {SLOGAN_PARTS.map((part) => (
        <li key={part.capability}>
          <span className="zp-crow-t">
            {part.word.replace('.', '')} · {CAPABILITIES[part.capability].label}
          </span>
          <StatusBadge capability={part.capability} />
        </li>
      ))}
    </ul>
  );
}
