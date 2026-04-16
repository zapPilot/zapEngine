import { ChevronDown } from "lucide-react";
import { useCallback, useRef, useState } from "react";

import { useClickOutside } from "@/hooks/ui/useClickOutside";

import { phosphorGlowStyle } from "./terminalStyles";

export interface TerminalDropdownOption {
  value: string;
  label: string;
}

export interface TerminalDropdownProps {
  /** Available options to select from */
  options: TerminalDropdownOption[];
  /** Currently selected value */
  value: string;
  /** Called when the user selects an option */
  onChange: (value: string) => void;
  /** Disable the dropdown */
  disabled?: boolean;
}

/**
 * Terminal-themed dropdown selector that matches the CLI aesthetic.
 * Uses emerald underlined text with a `>` prefix for the selected item.
 *
 * @param props - {@link TerminalDropdownProps}
 * @returns A dropdown component styled as a terminal prompt selector
 *
 * @example
 * ```tsx
 * <TerminalDropdown
 *   options={[{ value: "dma_gated_fgi", label: "DMA Gated FGI" }]}
 *   value="dma_gated_fgi"
 *   onChange={id => console.log(id)}
 * />
 * ```
 */
export function TerminalDropdown({
  options,
  value,
  onChange,
  disabled = false,
}: TerminalDropdownProps): React.ReactElement {
  const [isOpen, setIsOpen] = useState(false);
  const [focusIndex, setFocusIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);

  useClickOutside(containerRef, () => setIsOpen(false), isOpen);

  const selectedLabel = options.find(o => o.value === value)?.label ?? value;

  const toggle = () => {
    if (disabled) return;
    setIsOpen(prev => {
      if (!prev) {
        const idx = options.findIndex(o => o.value === value);
        setFocusIndex(idx >= 0 ? idx : 0);
      }
      return !prev;
    });
  };

  const select = useCallback(
    (optionValue: string) => {
      onChange(optionValue);
      setIsOpen(false);
    },
    [onChange]
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") {
        e.preventDefault();
        toggle();
      }
      return;
    }

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setFocusIndex(prev => Math.min(prev + 1, options.length - 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setFocusIndex(prev => Math.max(prev - 1, 0));
        break;
      case "Enter": {
        e.preventDefault();
        const focused = options[focusIndex];
        if (focused) {
          select(focused.value);
        }
        break;
      }
      case "Escape":
        e.preventDefault();
        setIsOpen(false);
        break;
    }
  };

  return (
    <div ref={containerRef} className="relative inline-block">
      <button
        type="button"
        onClick={toggle}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        className="border-b border-emerald-400/30 text-emerald-400 px-1 inline-flex items-center gap-1 hover:bg-emerald-400/10 transition-colors focus:outline-none disabled:opacity-40 disabled:cursor-not-allowed"
        style={phosphorGlowStyle}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        {selectedLabel}
        <ChevronDown className="w-3 h-3" />
      </button>

      {isOpen && (
        <ul
          role="listbox"
          className="absolute top-full left-0 mt-1 bg-gray-900 border border-emerald-400/30 rounded font-mono text-sm z-20 min-w-[200px] py-1 shadow-lg"
          onKeyDown={handleKeyDown}
        >
          {options.map((option, index) => {
            const isSelected = option.value === value;
            const isFocused = index === focusIndex;
            return (
              <li
                key={option.value}
                role="option"
                aria-selected={isSelected}
                onClick={() => select(option.value)}
                onMouseEnter={() => setFocusIndex(index)}
                className={`px-3 py-1.5 cursor-pointer transition-colors ${
                  isFocused
                    ? "bg-emerald-400/10 text-emerald-400"
                    : "text-gray-300 hover:text-emerald-400"
                }`}
                style={isFocused ? phosphorGlowStyle : undefined}
              >
                <span className="text-emerald-400/60 mr-1">
                  {isSelected ? ">" : "\u00A0"}
                </span>
                {option.label}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
