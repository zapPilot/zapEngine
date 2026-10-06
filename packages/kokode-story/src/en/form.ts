import type { CopyShape, InterestId } from '../types.js';
import type * as Japanese from '../ja/form.js';
// Contact form copy. src/waitlist.ts imports this file directly (not the
// barrel) so the page script never bundles the rest of the story.

/**
 * Options of "試したい業務". The value sent to genba-lead is the label itself
 * (the column holds ≤120 characters); the id is for links and `?interest=`.
 */
export const INTEREST: readonly {
  readonly id: InterestId;
  readonly label: string;
}[] = [
  { id: 'referral', label: 'Referral letters / summaries' },
  { id: 'search', label: 'Search / summarize internal documents' },
  { id: 'materials', label: 'Explanatory materials / anatomy diagrams' },
  { id: 'voice', label: 'Documents from audio' },
  { id: 'other', label: 'Other / still deciding' },
  { id: 'partner', label: 'Discuss a sales partnership' },
] as const;

export type { InterestId } from '../types.js';

export const FORM: CopyShape<typeof Japanese.FORM> = {
  interestLabel: 'Workflow to try',
  interestPlaceholder: 'Choose one',
  organization: 'Facility / company (optional)',
  name: 'Name (optional)',
  email: 'Email address',
  emailPlaceholder: 'you@example.jp',
  submit: 'Request a consultation',
  submitting: 'Sending…',
  noscript:
    'JavaScript is required to submit this form. Enable it and try again.',
  note: 'We use your information for consultations and guidance about KOKODE pilots and installation. Do not submit confidential information such as patient or clinical data.',
  privacy: 'Privacy policy (Japanese)',
  contactLead: 'Consultations / support:',
  messages: {
    success: 'Sent. Our team will contact you.',
    notConfigured:
      'Thank you. The form destination is being prepared for launch.',
    retry:
      'Could not send. Your information is saved and will be retried automatically when the connection recovers.',
    invalidEmail:
      'Please check your information. The email address may be invalid.',
    invalidInterest: 'Choose a workflow to try.',
  },
} as const;
