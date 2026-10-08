import { StatusNote } from '@/components/StatusBadge';
import { MESSAGES } from '@/config/messages';

/** The strategy / machine / wallet triad, shared by the home page and /pitch. */
export function OwnershipCards() {
  const { ownership } = MESSAGES;
  return (
    <div className="zp-steps">
      {ownership.cards.map((card) => (
        <article key={card.title} className="zp-card">
          <h3 className="zp-step-title">{card.title}</h3>
          <p className="zp-own-promise">{card.promise}</p>
          <p className="zp-card-kicker">{ownership.todayLabel}</p>
          <ul className="zp-own-list">
            {card.today.map((item) => (
              <li key={item.text}>
                <StatusNote note={item} />
              </li>
            ))}
          </ul>
          <p className="zp-card-kicker">{ownership.nextLabel}</p>
          <p className="zp-own-next">
            <StatusNote note={card.next} />
          </p>
        </article>
      ))}
    </div>
  );
}
