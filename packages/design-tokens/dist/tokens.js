import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { packageRoot } from './paths.js';
export function loadTokens() {
    return JSON.parse(readFileSync(join(packageRoot, 'tokens.json'), 'utf8'));
}
//# sourceMappingURL=tokens.js.map