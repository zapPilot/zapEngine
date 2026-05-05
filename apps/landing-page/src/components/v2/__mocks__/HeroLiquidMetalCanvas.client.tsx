const HeroLiquidMetalCanvas = (props: {
  heroRef: React.RefObject<HTMLElement | null>;
  regime: string;
}) => {
  return (
    <div data-testid="hero-liquid-metal-canvas" data-regime={props.regime}>
      {/* Mock canvas component - WebGL animations suppressed in JSDOM */}
    </div>
  );
};

export default HeroLiquidMetalCanvas;
