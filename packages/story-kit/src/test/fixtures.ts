import type { Cut } from '../cut.js';
export const cut: Cut = {
  id: 'test',
  duration: 48,
  fps: 30,
  width: 1920,
  height: 1080,
  poster: 20.5,
  windows: [{ id: 'all', from: 0, to: 48, fadeIn: 1, fadeOut: 1 }],
  stops: [
    { id: 'pain', time: 2.2, beats: ['pain'] },
    { id: 'answer', time: 20.5, beats: ['answer'] },
    { id: 'ask', time: 46, beats: ['ask'] },
  ],
  arc: {
    opening: ['pain'],
    pains: ['pain'],
    answers: ['answer'],
    endings: ['ask'],
    required: [['pain'], ['answer'], ['ask', 'alternate']],
    repeatable: ['hero'],
  },
};
