const tokens = require('@zapengine/design-tokens/tokens.json');
const px = (values) =>
  Object.fromEntries(
    Object.entries(values).map(([name, value]) => [name, `${value}px`]),
  );
/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: ['./src/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    colors: {
      ...tokens.mode.night,
      sleeve: tokens.sleeve.night,
      transparent: 'transparent',
      current: 'currentColor',
    },
    fontFamily: Object.fromEntries(
      Object.entries(tokens.font.native).map(([key, font]) => [
        key,
        font.family,
      ]),
    ),
    borderRadius: px(tokens.radius),
    screens: {
      md: `${tokens.breakpoint.medium}px`,
      lg: `${tokens.breakpoint.expanded}px`,
    },
    extend: {
      fontSize: Object.fromEntries(
        Object.entries(tokens.type).map(([key, role]) => [
          key,
          [
            `${role.size}px`,
            {
              lineHeight: `${role.line}px`,
              letterSpacing: `${role.tracking * role.size}px`,
            },
          ],
        ]),
      ),
      boxShadow: { overlay: tokens.shadow.overlay.night.css },
      elevation: { overlay: tokens.shadow.overlay.night.elevation },
      spacing: {
        hit: `${tokens.size.hit}px`,
        sidenav: `${tokens.size.sidenav}px`,
        ...Object.fromEntries(
          Object.entries(tokens.size.control).map(([key, value]) => [
            `control-${key}`,
            `${value}px`,
          ]),
        ),
      },
      maxWidth: px(tokens.container),
      transitionDuration: Object.fromEntries(
        Object.entries(tokens.duration).map(([key, value]) => [
          key,
          `${value}ms`,
        ]),
      ),
      transitionTimingFunction: Object.fromEntries(
        Object.entries(tokens.easing).map(([key, value]) => [
          key,
          `cubic-bezier(${value.join(', ')})`,
        ]),
      ),
      scale: { press: String(tokens.motion['press-scale']) },
    },
  },
};
