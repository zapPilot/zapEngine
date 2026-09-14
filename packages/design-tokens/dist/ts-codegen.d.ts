import { type Options } from 'prettier';
import { type DesignTokens } from './tokens.js';
export declare function buildPrettierOptions(config: Options | null): Options;
export declare function renderTsTokens(tokens: DesignTokens): Promise<string>;
export declare function writeTsTokens(): Promise<void>;
export declare function runTsCodegenCli(metaUrl: string): Promise<void>;
//# sourceMappingURL=ts-codegen.d.ts.map
