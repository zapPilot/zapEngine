import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
export const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
export function isCurrentScript(metaUrl) {
    return metaUrl === pathToFileURL(process.argv[1] ?? '').href;
}
export function writeGeneratedFile(relativePath, content) {
    const outputPath = join(packageRoot, relativePath);
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, content);
}
//# sourceMappingURL=paths.js.map