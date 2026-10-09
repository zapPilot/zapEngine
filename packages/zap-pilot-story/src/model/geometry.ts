export { cameraProgress } from './motion.js';
/** Geometry helpers retain the prototype's defensive defaults. */
export const worldLength = (units: number): string =>
  `calc(${units.toFixed(4)} * var(--zp-u))`;
export const wireBorder = (width?: string, color?: string): string =>
  `${width || '1.5px'} dashed ${color || 'var(--ink-3)'}`;
export const lineBorder = (color: string, style = 'solid'): string =>
  `1px ${style || 'solid'} ${color}`;
export const labelStem = (units?: number): string => worldLength(units || 1.2);
