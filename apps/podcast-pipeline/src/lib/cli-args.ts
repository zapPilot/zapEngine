export interface ParsedFlagArgs {
  command: string | null;
  flags: Record<string, string | boolean>;
  positionals: string[];
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
