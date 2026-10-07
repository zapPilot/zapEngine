import * as OpenCC from 'opencc-js';

// Display conversion for Taiwan Traditional surfaces: Threads copy and the
// Zap Pilot-facing `/episodes` API responses (see AGENTS.md).
const convertSimplifiedToTaiwan: (text: string) => string = OpenCC.Converter({
  from: 'cn',
  to: 'twp',
});

// Convert character forms without rewriting source vocabulary. Using twp -> cn
// corrupts 程序员 into 进程员; tw -> cn corrupts 什么 into 什幺.
const convertTraditionalToSimplified: (text: string) => string =
  OpenCC.Converter({
    from: 't',
    to: 'cn',
  });

export function convertTextToZhTW(text: string): string {
  return convertSimplifiedToTaiwan(text);
}

export function convertTextToZhCN(text: string): string {
  return convertTraditionalToSimplified(text);
}
