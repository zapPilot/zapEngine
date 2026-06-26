import { Delete } from 'lucide-react';

interface NumericKeypadProps {
  onKey: (key: string) => void;
}

const KEYS = [
  '1',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  '.',
  '0',
  'back',
] as const;

/** On-screen numeric keypad. Emits '0'–'9', '.', or 'back'. */
export function NumericKeypad({ onKey }: NumericKeypadProps) {
  return (
    <div className="grid grid-cols-3 gap-x-1 gap-y-1.5 px-6 pt-[18px] font-mono">
      {KEYS.map((key) => (
        <button
          key={key}
          type="button"
          onClick={() => onKey(key)}
          aria-label={key === 'back' ? 'Delete' : key}
          className="zp-tap grid place-items-center rounded-xl py-[13px] text-[23px] font-medium text-ink"
        >
          {key === 'back' ? (
            <Delete size={22} strokeWidth={1.7} className="text-ink-dim" />
          ) : (
            key
          )}
        </button>
      ))}
    </div>
  );
}
