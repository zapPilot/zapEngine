import type { ModalFooterProps } from "./types";

export function ModalFooter({ children, className = "" }: ModalFooterProps) {
  return <div className={`flex gap-3 mt-6 ${className}`}>{children}</div>;
}
