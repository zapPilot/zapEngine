import { engineDecision } from '../facts/decision.js';
import { createEngineModel } from './numeric-engine.js';
export const engineFrame = createEngineModel(engineDecision());
export { createEngineModel } from './numeric-engine.js';
export { ASSET_GLYPH_PATHS, type Sleeve } from './asset-glyphs.js';
export type * from './scene.js';
export {
  cameraMatrix,
  perspectiveMatrix,
  transform4,
  transformPoint,
  multiply4,
  translation4,
  homography,
  projectFace,
  projectFaces,
  projectBillboard,
  type Matrix4,
  type Point3,
  type ProjectionLayout,
  type ProjectedFace,
  type ProjectedPoint,
} from './projection.js';
export * from './draw-list.js';
