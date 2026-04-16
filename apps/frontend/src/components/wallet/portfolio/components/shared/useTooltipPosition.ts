import { RefObject, useEffect, useState } from "react";

export function useTooltipPosition(
  isHovered: boolean,
  containerRef: RefObject<HTMLElement | null>,
  tooltipRef: RefObject<HTMLElement | null>
) {
  const [position, setPosition] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (!isHovered || !containerRef.current || !tooltipRef.current) return;

    const updatePosition = () => {
      const container = containerRef.current;
      const tooltip = tooltipRef.current;
      if (!container || !tooltip) return;

      const cRect = container.getBoundingClientRect();
      const tRect = tooltip.getBoundingClientRect();

      let top = cRect.bottom + 8;
      let left = cRect.left + cRect.width / 2 - tRect.width / 2;

      // viewport checks
      const padding = 16;
      if (left < padding) left = padding;
      if (left + tRect.width > window.innerWidth - padding)
        left = window.innerWidth - tRect.width - padding;

      if (top + tRect.height > window.innerHeight - padding)
        top = cRect.top - tRect.height - 8;

      setPosition({ top, left });
    };

    updatePosition();
    window.addEventListener("scroll", updatePosition);
    window.addEventListener("resize", updatePosition);

    return () => {
      window.removeEventListener("scroll", updatePosition);
      window.removeEventListener("resize", updatePosition);
    };
  }, [isHovered, containerRef, tooltipRef]);

  return position;
}
