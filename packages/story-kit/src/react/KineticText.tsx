import type { CSSProperties } from 'react';
import { kineticPoses, kineticText, type KineticLine } from '../kinetic.js';
export interface KineticTextProps {
  lines: readonly KineticLine[];
  progress: number;
  exit?: boolean | number;
  reveal?: boolean;
}
export function KineticText({
  lines,
  progress,
  exit,
  reveal = false,
}: KineticTextProps) {
  const poses = kineticPoses(lines, progress, exit);
  return (
    <span className="sk-kinetic" data-reveal={reveal}>
      <span className="sk-sr">{kineticText(lines)}</span>
      <span aria-hidden="true">
        {lines.map((line, i) => (
          <span className="sk-line" key={i}>
            {poses[i]!.map((word) => (
              <span className="sk-mask" key={word.index}>
                <span
                  className="sk-word"
                  data-style={word.style}
                  style={
                    {
                      '--sk-word-index': word.index,
                      transform: `translateY(${word.translateY.toFixed(1)}%)`,
                      opacity: word.opacity,
                    } as CSSProperties
                  }
                >
                  {word.text}
                </span>
              </span>
            ))}
            {line.underline && (
              <svg
                className="sk-underline"
                data-underline={line.underline}
                viewBox="0 0 400 44"
              >
                <path
                  d={
                    line.underline === 'signature'
                      ? 'M6 30 C64 14 118 40 186 26 S296 10 394 22'
                      : 'M6 30H394'
                  }
                />
              </svg>
            )}
          </span>
        ))}
      </span>
    </span>
  );
}
