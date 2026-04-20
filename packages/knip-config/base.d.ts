import type { KnipConfig } from 'knip';

type KnipObjectConfig = Exclude<KnipConfig, (...args: never[]) => unknown>;

export declare const baseConfig: KnipObjectConfig;

export declare function defineKnipConfig(
  config: KnipObjectConfig,
): KnipObjectConfig;
