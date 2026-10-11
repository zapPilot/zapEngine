import type { CSSProperties, FC } from 'react';

import { Rise } from '../../../primitives/Kinetic';
import { fitFontSize, pieces } from '../../../primitives/text';
import { theme } from '../../kokode-clinic/theme';
import { usePromo } from '../context';
import { headline } from './look';

/**
 * A story headline, one line per entry, rising piece by piece; each line
 * starts as the previous one finishes. Sized so the widest line fits `width`.
 */
export const Headline: FC<{
  readonly lines: readonly string[];
  readonly at: number;
  readonly width: number;
  readonly max: number;
  readonly color?: string;
  readonly exit?: number;
  readonly align?: 'left' | 'center';
  readonly style?: CSSProperties;
}> = ({
  lines,
  at,
  width,
  max,
  color = theme.ink,
  exit,
  align = 'left',
  style,
}) => {
  const { fontFamily, lang } = usePromo();
  const look = headline(
    fontFamily,
    lang,
    fitFontSize(lines, width, max),
    color,
  );
  const stagger = lang === 'en' ? 2 : 1;
  let next = at;
  return (
    <div
      style={{
        position: 'absolute',
        display: 'flex',
        flexDirection: 'column',
        alignItems: align === 'center' ? 'center' : 'flex-start',
        ...style,
      }}
    >
      {lines.map((line) => {
        const start = next;
        next += pieces(line).length * stagger;
        return (
          <Rise
            key={line}
            text={line}
            at={start}
            stagger={stagger}
            exit={exit}
            look={look}
          />
        );
      })}
    </div>
  );
};
