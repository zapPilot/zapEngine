import type { CopyShape } from '../types.js';
import type * as Japanese from '../ja/demos.js';

// Demo screens show what using KOKODE looks like. Every patient detail is
// fictional; each demo names the disclaimers it must always be shown with.

import {
  DEMO_FIGURES,
  type ChatDemo,
  type PatientDemo,
  type ImageDemo,
} from '../ja/demos.js';
export { DEMO_FIGURES };
export type { DemoId, ChatDemo, PatientDemo, ImageDemo } from '../ja/demos.js';

export const DEMOS: {
  readonly chat: ChatDemo;
  readonly patient: PatientDemo;
  readonly image: ImageDemo;
} = {
  chat: {
    caption: 'KOKODE chat on a staff PC',
    address: 'kokode.local',
    prompt: 'Summarize three hand hygiene moments from our facility manual',
    reply: [
      '1. Before and after touching a patient',
      '2. Before a clean or aseptic procedure',
      '3. When body fluid exposure may have occurred',
    ],
    disclaimers: ['screenImage'],
  },
  patient: {
    caption:
      'Drafting a referral summary from fictional patient progress notes',
    prompt: 'Summarize this patient’s progress for a referral letter',
    record: {
      title: 'Progress notes',
      lines: [
        '72-year-old woman',
        'Admitted with a right femoral neck fracture',
        'Day 14 after hip hemiarthroplasty',
        'History: hypertension and type 2 diabetes',
      ],
    },
    reply: {
      title: 'Referral progress summary (draft)',
      lines: [
        'Hip hemiarthroplasty performed for a right femoral neck fracture.',
        'Recovery is progressing well; gait training with a walker continues.',
        'Oral medication continues for hypertension and type 2 diabetes.',
      ],
    },
    disclaimers: ['fictionalPatient', 'screenImage', 'draftOnly'],
  },
  image: {
    caption:
      'Drafting a line drawing and arranging it into a presentation slide',
    prompt: 'Create a gluteal anatomy diagram for a presentation',
    sketch: 'Gluteal anatomy (line drawing draft)',
    slide: {
      title: 'Gluteal anatomy',
      note: 'Draft created with AI inside the facility',
    },
    steps: ['Create a line drawing', 'Arrange a slide'],
    disclaimers: ['screenImage', 'draftOnly'],
  },
};

/** Labels of the chat window chrome, shared by the site and the film. */
export const CHAT_UI: CopyShape<typeof Japanese.CHAT_UI> = {
  send: 'Send',
  placeholder: 'Enter a task for AI',
  assistant: 'KOKODE',
  cloud: 'Cloud AI',
} as const;
