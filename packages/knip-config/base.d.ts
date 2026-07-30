import type { KnipConfig } from 'knip';

type KnipObjectConfig = Exclude<KnipConfig, (...args: never[]) => unknown>;

export declare const baseConfig: KnipObjectConfig;

export interface DefineKnipConfigOptions {
  omitDefaultIgnoreDependencies?: string[];
}

export declare function defineKnipConfig(
  config: KnipObjectConfig,
  options?: DefineKnipConfigOptions,
): KnipObjectConfig;
