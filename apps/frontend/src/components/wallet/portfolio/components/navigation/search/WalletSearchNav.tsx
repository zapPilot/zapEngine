import { Search, X } from "lucide-react";
import {
  type EventHandler,
  type MouseEvent,
  type ReactNode,
  type SyntheticEvent,
  useEffect,
  useRef,
  useState,
} from "react";

import { validateWalletAddress } from "@/lib/validation/walletUtils";

interface WalletSearchNavProps {
  onSearch: (address: string) => void;
  placeholder?: string;
  className?: string;
  isSearching?: boolean;
}

const REQUIRED_ADDRESS_MESSAGE = "Wallet address is required";
const INVALID_ADDRESS_MESSAGE =
  "Invalid wallet address. Must be a 42-character Ethereum address starting with 0x";

function getValidationError(address: string): string | null {
  if (!address) {
    return REQUIRED_ADDRESS_MESSAGE;
  }

  if (!validateWalletAddress(address)) {
    return INVALID_ADDRESS_MESSAGE;
  }

  return null;
}

const DESKTOP_INPUT_WRAPPER =
  "bg-gray-900/50 hover:bg-gray-900/80 border border-gray-800 focus-within:border-purple-500/50 focus-within:ring-2 focus-within:ring-purple-500/20 rounded-xl transition-all";

export function WalletSearchNav({
  onSearch,
  placeholder = "Search address...",
  className = "",
  isSearching = false,
}: WalletSearchNavProps): ReactNode {
  const [address, setAddress] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const [isMobileExpanded, setIsMobileExpanded] = useState(false);
  const [validationError, setValidationError] = useState<string>("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isMobileExpanded && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isMobileExpanded]);

  const handleSubmit: EventHandler<SyntheticEvent<HTMLFormElement>> = event => {
    event.preventDefault();
    const trimmedAddress = address.trim();

    const validationMessage = getValidationError(trimmedAddress);
    setValidationError(validationMessage ?? "");
    if (validationMessage) {
      return;
    }

    onSearch(trimmedAddress);
    setIsMobileExpanded(false);
  };

  const handleChangeAddress = (nextValue: string): void => {
    setAddress(nextValue);
    if (validationError) {
      setValidationError("");
    }
  };

  const handleClearOrClose = (event: MouseEvent<HTMLButtonElement>): void => {
    if (!address) {
      setIsMobileExpanded(false);
      return;
    }

    setAddress("");
    if (isMobileExpanded) {
      return;
    }

    const input = event.currentTarget
      .previousElementSibling as HTMLInputElement;
    input?.focus();
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setIsMobileExpanded(true)}
        className={`md:hidden p-2 text-gray-400 hover:text-white transition-colors ${isMobileExpanded ? "hidden" : "block"} ${className}`}
        aria-label="Open search"
      >
        <Search className="w-5 h-5" />
      </button>

      <form
        onSubmit={handleSubmit}
        className={`relative flex items-center transition-all duration-300 ease-in-out ${
          isMobileExpanded
            ? "fixed inset-x-0 top-0 h-16 bg-gray-950/95 backdrop-blur-xl px-4 z-50 border-b border-gray-800"
            : "hidden md:flex h-10"
        } ${isFocused ? "md:w-80" : "md:w-64"} ${className}`}
      >
        <div
          className={`relative flex items-center w-full h-full ${!isMobileExpanded ? DESKTOP_INPUT_WRAPPER : ""}`}
        >
          {isSearching ? (
            <div
              className={`absolute w-4 h-4 animate-spin rounded-full border-2 border-purple-400 border-t-transparent ${isMobileExpanded ? "left-0" : "left-3"}`}
            />
          ) : (
            <Search
              className={`absolute w-4 h-4 pointer-events-none transition-colors duration-200 ${isMobileExpanded ? "left-0 text-gray-400" : "left-3"} ${isFocused ? "text-purple-400" : "text-gray-500"}`}
            />
          )}

          <input
            ref={inputRef}
            type="text"
            value={address}
            onChange={e => handleChangeAddress(e.target.value)}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            placeholder={placeholder}
            disabled={isSearching}
            className={`w-full bg-transparent border-none text-white text-sm placeholder-gray-500 focus:ring-0 focus:outline-none transition-all ${
              isMobileExpanded
                ? "pl-8 pr-10 h-full text-base"
                : "pl-9 pr-8 h-full"
            } ${isSearching ? "opacity-50 cursor-not-allowed" : ""}`}
          />

          {(address || isMobileExpanded) && (
            <button
              type="button"
              onMouseDown={e => {
                e.preventDefault();
              }}
              onClick={handleClearOrClose}
              className={`absolute right-0 p-2 text-gray-500 hover:text-white transition-colors ${isMobileExpanded ? "mr-0" : "mr-1"}`}
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {validationError && (
          <div className="absolute top-full left-0 right-0 mt-1 p-2 bg-red-600/10 border border-red-600/20 rounded-lg">
            <p className="text-xs text-red-300">{validationError}</p>
          </div>
        )}
      </form>
    </>
  );
}
