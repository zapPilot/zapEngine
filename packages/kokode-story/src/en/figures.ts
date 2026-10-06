import type { CopyShape } from '../types.js';
import type * as Japanese from '../ja/figures.js';
// Labels of the diagrams. They are real text on every surface (HTML and
// film), never baked into an image, so they stay searchable and reviewable.
export const FIGURES: CopyShape<typeof Japanese.FIGURES> = {
  hardware: {
    caption: 'Illustrative equipment for facilities of different sizes',
    sizes: [
      {
        label: 'Small clinic',
        note: 'Start here',
        alt: 'Illustration of a compact device installed inside',
      },
      {
        label: 'Mid-sized facility',
        note: 'Ask us',
        alt: 'Illustration of rack-mounted server equipment',
      },
      {
        label: 'Hospital or research institute',
        note: 'Ask us',
        alt: 'Illustration of a row of server cabinets',
      },
    ],
  },
  beforeAfter: {
    caption: 'Where patient data goes: cloud AI and KOKODE',
    inside: 'Inside',
    before: {
      label: 'Before',
      steps: ['Patient data', 'Cloud AI', 'Concerns / limits'],
    },
    after: {
      label: 'KOKODE',
      steps: ['Patient data', 'KOKODE', 'AI inside'],
    },
  },
  boundary: {
    caption:
      'Only signed-in devices on the facility staff network connect to KOKODE',
    inside: 'Inside',
    network: 'Staff network',
    devices: ['PC', 'Tablet'],
    login: 'Sign in',
    server: 'KOKODE',
    guest: 'Patient Wi-Fi',
    outside: 'Outside',
    blocked: 'No connection',
  },
  turnkey: {
    caption: 'What KOKODE installs together',
    layers: [
      { title: 'Chat interface', text: 'Staff use a browser' },
      { title: 'Agents', text: 'Workflow-specific steps' },
      { title: 'AI models', text: 'Run on equipment inside' },
      { title: 'Hardware', text: 'Equipment installed inside' },
    ],
    hardwareAlt:
      'Illustration of equipment KOKODE installs inside the facility',
  },
  partnerRoles: {
    caption: 'Responsibilities of facilities, partners and KOKODE',
    client: { title: 'Medical facility', text: 'Use AI inside' },
    partner: { title: 'Partner', text: 'Introductions / client contact' },
    kokode: { title: 'KOKODE', text: 'Installation / setup / support' },
  },
} as const;
