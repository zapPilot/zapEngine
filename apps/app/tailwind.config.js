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
      ...tokens.color,
      transparent: 'transparent',
      current: 'currentColor',
    },
    fontFamily: tokens.font,
    screens: {
      md: `${tokens.breakpoint.medium}px`,
      lg: `${tokens.breakpoint.expanded}px`,
    },
    extend: {
      fontSize: Object.fromEntries(
        Object.entries(tokens.type).map(([name, value]) => [
          name,
          [
            `${value.size}px`,
            {
              lineHeight: `${value.line}px`,
              letterSpacing: `${value.tracking}px`,
            },
          ],
        ]),
      ),
      borderRadius: px(tokens.radius),
      boxShadow: Object.fromEntries(
        Object.entries(tokens.shadow).map(([name, value]) => [name, value.css]),
      ),
      elevation: Object.fromEntries(
        Object.entries(tokens.shadow).map(([name, value]) => [
          name,
          value.elevation,
        ]),
      ),
      spacing: {
        hit: `${tokens.size.hit}px`,
        sidenav: `${tokens.size.sidenav}px`,
        ...Object.fromEntries(
          Object.entries(tokens.size.control).map(([name, value]) => [
            `control-${name}`,
            `${value}px`,
          ]),
        ),
      },
      maxWidth: px(tokens.container),
      transitionDuration: Object.fromEntries(
        Object.entries(tokens.duration).map(([name, value]) => [
          name,
          `${value}ms`,
        ]),
      ),
      transitionTimingFunction: tokens.easing,
      scale: { press: String(tokens.motion['press-scale']) },
    },
  },
};
