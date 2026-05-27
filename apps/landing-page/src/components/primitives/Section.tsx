import type { ReactNode } from 'react';

type SectionProps = {
  id?: string;
  kicker?: string;
  title?: string;
  subtitle?: string;
  className?: string;
  innerClassName?: string;
  ariaLabelledBy?: string;
  headingAction?: ReactNode;
  children: ReactNode;
};

function classNames(...values: (string | undefined)[]) {
  return values.filter(Boolean).join(' ');
}

export function Section({
  id,
  kicker,
  title,
  subtitle,
  className,
  innerClassName,
  ariaLabelledBy,
  headingAction,
  children,
}: SectionProps) {
  return (
    <section
      id={id}
      className={classNames('shell-section', className)}
      aria-labelledby={ariaLabelledBy}
    >
      <div className={classNames('section-inner', innerClassName)}>
        {kicker && <div className="section-kicker">{kicker}</div>}
        {(title || subtitle || headingAction) && (
          <div className="section-heading-row">
            <div>
              {title && <h2 id={ariaLabelledBy}>{title}</h2>}
              {subtitle && <p>{subtitle}</p>}
            </div>
            {headingAction}
          </div>
        )}
        {children}
      </div>
    </section>
  );
}
