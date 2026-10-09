import { engineDecision } from '../facts/decision.js';
import { createEngineModel } from './numeric-engine.js';
import { serializeEngineCss } from './css.js';
const frame = createEngineModel(engineDecision());
export const engineScene = (time: number, ambient = 0, narrow = false) =>
  serializeEngineCss(frame(time, ambient, narrow));
