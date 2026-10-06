import * as jaMedia from './ja/media.js';
import * as jaBeats from './ja/beats.js';
import * as jaDemos from './ja/demos.js';
import * as jaNotes from './ja/disclaimers.js';
import * as jaFigures from './ja/figures.js';
import * as jaForm from './ja/form.js';
import * as jaSite from './ja/site.js';
import * as enMedia from './en/media.js';
import * as enBeats from './en/beats.js';
import * as enDemos from './en/demos.js';
import * as enNotes from './en/disclaimers.js';
import * as enFigures from './en/figures.js';
import * as enForm from './en/form.js';
import * as enSite from './en/site.js';
import * as zhMedia from './zh-Hant/media.js';
import * as zhBeats from './zh-Hant/beats.js';
import * as zhDemos from './zh-Hant/demos.js';
import * as zhNotes from './zh-Hant/disclaimers.js';
import * as zhFigures from './zh-Hant/figures.js';
import * as zhForm from './zh-Hant/form.js';
import * as zhSite from './zh-Hant/site.js';
import type { Locale } from './locales.js';
import type { CopyShape } from './types.js';
const ja = {
  ...jaMedia,
  ...jaBeats,
  ...jaDemos,
  ...jaNotes,
  ...jaFigures,
  ...jaForm,
  ...jaSite,
};
export type Story = Omit<
  CopyShape<typeof ja>,
  'BEATS' | 'DEMOS' | 'DEMO_FIGURES' | 'INTEREST'
> &
  Pick<typeof ja, 'BEATS' | 'DEMOS' | 'DEMO_FIGURES'> & {
    readonly INTEREST: readonly {
      readonly id: import('./types.js').InterestId;
      readonly label: string;
    }[];
  } & { readonly locale: Locale; readonly footnote: typeof jaNotes.footnote };
const stories: Record<Locale, Story> = {
  ja: { ...ja, locale: 'ja' },
  en: {
    ...enMedia,
    ...enBeats,
    ...enDemos,
    ...enNotes,
    ...enFigures,
    ...enForm,
    ...enSite,
    locale: 'en',
  },
  'zh-Hant': {
    ...zhMedia,
    ...zhBeats,
    ...zhDemos,
    ...zhNotes,
    ...zhFigures,
    ...zhForm,
    ...zhSite,
    locale: 'zh-Hant',
  },
};
export function storyFor(locale: Locale): Story {
  return stories[locale];
}
