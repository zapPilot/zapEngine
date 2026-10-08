import { readFileSync, writeFileSync } from 'node:fs';
const tokens = JSON.parse(
  readFileSync(
    new URL('../../design-tokens/tokens.json', import.meta.url),
    'utf8',
  ),
);
writeFileSync(
  new URL('../src/token-colors.ts', import.meta.url),
  `// Generated from design-tokens/tokens.json by scripts/token-colors.mjs.\nexport const sleeveColors = ${JSON.stringify(tokens.sleeve.paper, null, 2)} as const;\n`,
);
