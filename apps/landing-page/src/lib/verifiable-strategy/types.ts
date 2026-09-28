import type { Abi, Address, Hex } from 'viem';

export interface Deployment {
  chainId: number;
  address: Address;
  transactionHash: Hex;
  blockNumber: string;
  runtimeCodehash: Hex;
  sourcify: { status: string };
}
export interface DecimalValue {
  decimal: string;
  wad: string;
}
export interface Observation {
  symbol: string;
  price: DecimalValue;
  dma: DecimalValue;
}
export type AssetState = {
  observed: number;
  actionable: number;
  end_day: number;
  blocked: number;
};
export type AssetView = {
  zone: number;
  cross: number;
  actionable_cross: number;
  active: boolean;
  remaining: number;
  blocked: number;
  distance: bigint;
};
export interface ExitResult {
  matched: boolean;
  cooled_off: boolean;
  remaining_days: number;
  trigger_mask: number;
  exit_mask: number;
  liquidated_mask: number;
  target: readonly bigint[];
}
export interface Example {
  date: string;
  previousDate: string;
  previous: Observation[];
  current: Observation[];
  allocation: DecimalValue[];
  lastExecutedDay: number;
  crossOnTouch: boolean;
  stateMode: 'warmup' | 'explicit';
  priorStates: number[][];
  expected: {
    pythonTarget: string[];
    publishedTarget: string[];
    pyrevmTarget: string[];
    triggerMask: number;
    exitMask: number;
    liquidatedMask: number;
  };
  publishedEvent: {
    date: string;
    reason: string;
    fromAssets: string[];
    amountPercent: number;
  };
  provenance: {
    source: string;
    historySha256: string;
    trackRecordSha256: string;
    encoding: string;
  };
}
export interface Dataset {
  abi: Abi;
  runtimeCodehash: Hex;
  sourceUrl: string;
  compiler: string;
  evmVersion: string;
  deployment: Deployment | null;
  examples: Example[];
}
export interface CalculatorInput {
  date: string;
  previousDate: string;
  previous: { price: string; dma: string }[];
  current: { price: string; dma: string }[];
  allocation: string[];
  lastExecutedDay: number;
  crossOnTouch: boolean;
  stateMode: 'warmup' | 'explicit';
  priorStates: number[][];
}
export interface CallStep {
  name: 'warmup' | 'observe' | 'cross_down_exit';
  args: readonly unknown[];
  output: unknown;
  data: Hex;
}
export interface CalculatorResult {
  blockNumber: bigint;
  warmup: AssetState[];
  states: AssetState[];
  views: AssetView[];
  exit: ExitResult;
  steps: CallStep[];
}
