import { ReactNode, useEffect, useState } from "react";
import { createPortal } from "react-dom";

interface PortalProps {
  children: ReactNode;
  /** Optional: attach to a specific container; defaults to document.body */
  container?: Element | null;
}

export function Portal({ children, container }: PortalProps) {
  const [mounted, setMounted] = useState(false);
  const target =
    container ?? (typeof document !== "undefined" ? document.body : null);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || !target) return null;
  return createPortal(children, target);
}
