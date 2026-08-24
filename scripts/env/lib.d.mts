export interface ParsedEnv {
  values: Record<string, string>;
  duplicates: string[];
}

export function parseEnv(text: string): ParsedEnv;
export function loadEnvFile(path: string): ParsedEnv;
export function mergeEnv(
  fileValues: Record<string, string>,
  processValues?: Record<string, string | undefined>,
): Record<string, string>;
export function projectEnv(
  canonicalEnv: Record<string, string | undefined>,
  target: string,
): Record<string, string>;
export function projectAllClientEnv(
  canonicalEnv: Record<string, string | undefined>,
): Record<string, string>;
