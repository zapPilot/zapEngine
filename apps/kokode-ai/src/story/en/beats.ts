import type { Beat, BeatId } from '../types';

// Translated copy is a draft until a native speaker has reviewed it. Claims are
// fenced by src/story/story.test.ts: when a guardrail fails, change the copy.
export const BEATS: { readonly [Id in BeatId]: Beat } = {
  hero: {
    eyebrow: 'AI, here.',
    title: ['Patient data stays', 'inside.'],
    body: [
      'AI you can ask through chat, within your facility network.',
      'KOKODE handles the equipment and setup.',
    ],
    action: { label: 'Discuss a pilot' },
  },
  painPatient: {
    eyebrow: 'The challenge: patient data',
    title: ['The work you want AI to do', 'contains patient data.'],
    body: [
      'Referral letters, discharge summaries and progress reports. The more demanding documents need patient information.',
      'Japan’s Personal Information Protection Committee also urges caution when entering personal information into generative AI services.',
    ],
    source: {
      label:
        'Japan’s Personal Information Protection Committee: Caution regarding the use of generative AI services (June 2, 2023)',
      href: 'https://www.ppc.go.jp/news/careful_information/230602_AI_utilize_alert/',
    },
  },
  painContent: {
    eyebrow: 'The challenge: medical images',
    title: ['Some images medicine needs', 'cannot be generated.'],
    body: [
      'Anatomical and surgical illustrations matter in medicine. Consumer AI services may restrict their generation under their usage rules.',
    ],
  },
  desiredWorld: {
    eyebrow: 'What we want',
    title: ['As natural as ChatGPT.', 'Under your facility’s control.'],
    body: [
      'Ask and get a response. Draft documents and explanatory diagrams, with that ease while keeping patient data inside.',
    ],
  },
  solution: {
    eyebrow: 'KOKODE',
    title: ['AI that runs inside,', 'for your facility.'],
    body: [
      'KOKODE runs AI on equipment installed in your facility. Work involving patient data is designed to stay inside.',
    ],
    notes: ['normalOperation'],
  },
  beforeAfter: {
    eyebrow: 'Where data goes',
    title: ['Patient data goes', 'to AI inside.'],
    figure: 'beforeAfter',
    notes: ['normalOperation'],
  },
  experience: {
    eyebrow: 'How to use it',
    title: ['Open your browser.', 'Work as usual.'],
    body: [
      'On a PC or tablet connected to the staff network, open kokode.local in your browser. Ask through chat, as with ChatGPT. You do not need to sit at the server.',
    ],
    figure: 'experience',
  },
  boundary: {
    eyebrow: 'Connection boundary',
    title: ['AI you can use', 'only inside.'],
    body: [
      'Only signed-in devices on the staff network can use KOKODE. It cannot be reached from outside. We configure it separately from patient Wi-Fi.',
    ],
    figure: 'boundary',
  },
  demoPatient: {
    eyebrow: 'Example: referral letters',
    title: ['Draft a progress summary', 'inside.'],
    body: [
      'Create a draft summary for a referral letter from clinical progress notes. The clinician reviews and finishes it.',
    ],
    figure: 'demoPatient',
    notes: ['clinicalJudgment'],
    action: { label: 'Try this workflow', interest: 'referral' },
  },
  demoImage: {
    eyebrow: 'Example: explanatory diagrams',
    title: ['Draft presentation diagrams', 'inside.'],
    body: [
      'Ask for a gluteal anatomy diagram, then turn the line drawing draft into a presentation slide.',
    ],
    figure: 'demoImage',
    action: { label: 'Try this workflow', interest: 'materials' },
  },
  turnkey: {
    eyebrow: 'One coordinated setup',
    title: ['KOKODE sets it up.', 'Your team uses it.'],
    body: [
      'Equipment, AI models, agents tailored to your workflows and a staff chat interface. KOKODE installs and configures the whole set.',
    ],
    figure: 'turnkey',
  },
  startSmall: {
    eyebrow: 'Getting started',
    title: ['One device.', 'One workflow.'],
    body: [
      'You do not need a GPU rack to start. Begin by trying one workflow on one small device.',
    ],
    price: {
      label: 'PoC',
      amount: 'JPY 300,000+',
      note: 'Reference pricing for a pilot (proof of concept). We quote individually based on scope.',
    },
  },
  pilot: {
    eyebrow: 'Pilot',
    title: ['Try one workflow', 'inside.'],
    points: [
      {
        title: 'Choose one workflow',
        text: 'One task you want AI to handle but cannot send to the cloud.',
      },
      {
        title: 'Install one device inside',
        text: 'KOKODE handles equipment preparation and setup.',
      },
      {
        title: 'Use it in practice',
        text: 'Staff use it in their browsers, and we assess the results together.',
      },
    ],
  },
  cta: {
    eyebrow: 'Talk with us',
    title: ['Bring one task', 'for AI that cannot', 'go to the cloud.'],
    body: [
      'Tell us the workflow you want to try. We will walk you through the pilot.',
    ],
    notes: ['notReplacement'],
    action: { label: 'Discuss your workflow' },
  },
  partnerDemand: {
    eyebrow: 'For sales partners',
    title: ['Your clients', 'want AI.'],
    body: [
      'They want AI, but patient data must stay inside. We address this need with AI that runs within the facility.',
    ],
  },
  partnerGap: {
    eyebrow: 'Your role',
    title: ['No AI engineer', 'or GPU expertise needed.'],
    body: [
      'KOKODE handles equipment selection, AI model setup and support after installation. Introduce us through your client relationships.',
    ],
  },
  partnerRoles: {
    eyebrow: 'Shared responsibilities',
    title: ['Partners and', 'KOKODE support', 'medical facilities.'],
    figure: 'partnerRoles',
  },
  partnerCta: {
    eyebrow: 'Getting started',
    title: ['Start with one facility,', 'together.'],
    body: [
      'We work with our partners to install at the first facility. Get in touch if you have a potential introduction.',
    ],
    action: { label: 'Discuss a partnership', interest: 'partner' },
  },
};
