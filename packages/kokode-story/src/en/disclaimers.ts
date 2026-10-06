import { formatFootnote } from '../footnote.js';
import type { DisclaimerId } from '../types.js';

// The first four sentences carry over verbatim from the previous site. These
// strings are the only place the claim guardrails allow regulated wording.
export const DISCLAIMERS: { readonly [Id in DisclaimerId]: string } = {
  hardwareImage:
    '※Illustrative equipment; actual appearance and configuration may differ',
  normalOperation:
    'Configured not to send patient data to external LLMs during normal operation',
  clinicalJudgment:
    'Start with information search, summaries, document drafting and research support rather than diagnosis itself. Healthcare professionals perform the final review and judgment.',
  notReplacement:
    'KOKODE does not replace judgment by healthcare professionals.',
  preview:
    'This site is an advance introduction to KOKODE. Product specifications and offerings may change as development progresses.',
  screenImage: '※Illustrative screen',
  fictionalPatient: '※Fictional patient data',
  draftOnly:
    'AI output is a draft. Healthcare professionals must review the content and make the final judgment.',
};

/** Footnote text with exactly one leading reference mark. */
export function footnote(id: DisclaimerId): string {
  return formatFootnote(DISCLAIMERS[id]);
}
