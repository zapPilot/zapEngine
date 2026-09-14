import { useEffect, useRef } from 'react';

/**
 * Run `advance` once for each checkpoint the reviewed queue reaches.
 *
 * `key` identifies the checkpoint — the batch that landed plus the queue index
 * waiting behind it — and a null key means there is nothing to advance. The
 * same key never fires twice: a checkpoint that failed stays stopped until a
 * person retries, rather than looping a wallet prompt. `advance` is read
 * through a ref so a new callback identity is not a new checkpoint.
 */
export function useCheckpointAutoAdvance(
  key: string | null,
  advance: () => void,
): void {
  const firedKeyRef = useRef<string | null>(null);
  const advanceRef = useRef(advance);

  useEffect(() => {
    advanceRef.current = advance;
  }, [advance]);

  useEffect(() => {
    if (key === null || firedKeyRef.current === key) return;
    firedKeyRef.current = key;
    advanceRef.current();
  }, [key]);
}
