import { StatusBadge, StatusNote } from '@/components/StatusBadge';
import { MESSAGES } from '@/config/messages';

export function Runtime() {
  const { runtime } = MESSAGES;
  return (
    <section
      id="runtime"
      className="zp-section zp-section-alt"
      aria-labelledby="runtime-title"
    >
      <div className="zp-container">
        <p className="zp-kicker">{runtime.kicker}</p>
        <h2 id="runtime-title" className="zp-h2">
          {runtime.title}
        </h2>
        <p className="zp-lede">{runtime.lede}</p>
        <ol className="zp-steps">
          {runtime.steps.map((step, index) => (
            <li key={step.title} className="zp-step">
              <div className="zp-step-head">
                <span className="zp-step-num">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <StatusBadge
                  capability={step.capability}
                  qualifier={'qualifier' in step ? step.qualifier : undefined}
                />
              </div>
              <h3 className="zp-step-title">{step.title}</h3>
              <p className="zp-step-body">{step.text}</p>
              {'notes' in step ? (
                <ul className="zp-step-notes">
                  {step.notes.map((note) => (
                    <li key={note.text}>
                      <StatusNote note={note} />
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ol>
        <div className="zp-runtime-footnote">
          <p>{runtime.footnote.lead}</p>
          <ul>
            {runtime.footnote.items.map((item) => (
              <li key={item.text}>
                <StatusNote note={item} />
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
