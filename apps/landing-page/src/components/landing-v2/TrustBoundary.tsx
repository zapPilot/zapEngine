import { StatusBadge } from '@/components/StatusBadge';
import { MESSAGES } from '@/config/messages';

/** The five wallet-boundary guarantees, shared by the home page and /pitch. */
export function GuaranteeList({ className }: { className: string }) {
  return (
    <ul className={className}>
      {MESSAGES.trust.guarantees.map((item) => (
        <li key={item.title}>
          <StatusBadge capability={item.capability} />
          <span>
            <strong>{item.title}</strong> <span>{item.text}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
