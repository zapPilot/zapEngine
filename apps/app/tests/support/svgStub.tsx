import { createElement, type ReactNode } from 'react';
function shape(tag: string) {
  function Shape({
    children,
    ...props
  }: Record<string, unknown> & { children?: ReactNode }) {
    return createElement(tag, props, children);
  }
  return Shape;
}
export const svgStub = {
  default: shape('svg'),
  Circle: shape('circle'),
  Path: shape('path'),
  Text: shape('text'),
  Rect: shape('rect'),
  Defs: shape('defs'),
  ClipPath: shape('clipPath'),
  Line: shape('line'),
  G: shape('g'),
};
