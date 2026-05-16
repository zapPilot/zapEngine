import type { ChangeEvent } from 'react';

const DECIMAL_INPUT_PATTERN = /^\d*(?:\.\d*)?$/;

export interface NumericInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  id?: string;
  'aria-label'?: string;
}

export function NumericInput({
  value,
  onChange,
  placeholder,
  className,
  disabled,
  id,
  'aria-label': ariaLabel,
}: NumericInputProps) {
  const handleChange = (event: ChangeEvent<HTMLInputElement>): void => {
    const nextValue = event.target.value.replace(',', '.');

    if (nextValue === '' || DECIMAL_INPUT_PATTERN.test(nextValue)) {
      onChange(nextValue);
    }
  };

  return (
    <input
      id={id}
      type="text"
      inputMode="decimal"
      pattern="^[0-9]*[.,]?[0-9]*$"
      autoComplete="off"
      autoCorrect="off"
      spellCheck={false}
      minLength={1}
      maxLength={79}
      value={value}
      onChange={handleChange}
      placeholder={placeholder}
      className={className}
      disabled={disabled}
      aria-label={ariaLabel}
    />
  );
}
