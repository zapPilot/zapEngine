/**
 * TooltipWrapper - Consistent wrapper for tooltip content
 */

interface TooltipWrapperProps {
  date: string;
  children: React.ReactNode;
  spacing?: "normal" | "tight";
}

export function TooltipWrapper({
  date,
  children,
  spacing = "normal",
}: TooltipWrapperProps) {
  const spacingClass = spacing === "tight" ? "space-y-1" : "space-y-1.5";

  return (
    <>
      <div className="text-xs text-gray-300 mb-2">{date}</div>
      <div className={spacingClass}>{children}</div>
    </>
  );
}
