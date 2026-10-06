/** Fish Official English preset voices. Public reference IDs, not secrets. */
export const VOICES = {
  selene: {
    id: 'b347db033a6549378b48d00acb0d06cd',
    gender: 'female',
    character: 'Soft, meditative',
  },
  adrian: {
    id: 'bf322df2096a46f18c579d0baa36f41d',
    gender: 'male',
    character: 'Calm, deep, reliable narrator',
  },
  sarah: {
    id: '933563129e564b19a115bedd57b7406a',
    gender: 'female',
    character: 'Young, engaged speaker',
  },
  ethan: {
    id: '536d3a5e000945adb7038665781a4aca',
    gender: 'male',
    character: 'Clear, curious explainer',
  },
  laura: {
    id: 'e3cd384158934cc9a01029cd7d278634',
    gender: 'female',
    character: 'Warm, confident narrator',
  },
  jordan: {
    id: '79d0bd3e4e5444b18f7b6d89b5927bf1',
    gender: 'male',
    character: 'Grounded, motivational speaker',
  },
  hannah: {
    id: '9a9cf47702da476aa4629e2506d4a857',
    gender: 'female',
    character: 'Conversational, advertisement',
  },
} as const;
export type VoiceName = keyof typeof VOICES;
