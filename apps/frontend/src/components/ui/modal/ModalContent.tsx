import type { ModalContentProps } from "./types";

export function ModalContent({ children, className = "" }: ModalContentProps) {
  return <div className={`space-y-6 ${className}`}>{children}</div>;
}
