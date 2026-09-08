export interface ParsedFlagArgs {
  command: string | null;
  flags: Record<string, string | boolean>;
  positionals: string[];
}

/**
 * Rejects a parsed invocation that carries a stray positional or a `--flag`
 * outside `allowedFlags`, throwing `usage` or an `Unknown option: --x`
 * message respectively.
 */
export function assertOnlyKnownFlags(
  parsed: ParsedFlagArgs,
  allowedFlags: readonly string[],
  usage: string,
): void {
  if (parsed.positionals.length > 0) {
    throw new Error(usage);
  }
  for (const key of Object.keys(parsed.flags)) {
    if (!allowedFlags.includes(key)) {
      throw new Error(`Unknown option: --${key}`);
    }
  }
}

export function parseFlagArgs(argv: readonly string[]): ParsedFlagArgs {
  const [command = null, ...rest] = argv;
  const flags: Record<string, string | boolean> = {};
  const positionals: string[] = [];
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index]!;
    if (!token.startsWith('--')) {
      positionals.push(token);
      continue;
    }
    const key = token.slice(2);
    const next = rest[index + 1];
    if (next && !next.startsWith('--')) {
      flags[key] = next;
      index += 1;
    } else {
      flags[key] = true;
    }
  }
  return { command, flags, positionals };
}
