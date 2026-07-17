import { describe, expect, it } from 'vitest';

import {
  parseDepositDefaultSplit,
  planSimulationConfigFromEnv,
} from '../../../../src/modules/plan-orchestration/module';

describe('parseDepositDefaultSplit', () => {
  it('parses a valid JSON split into numeric chain keys', () => {
    expect(parseDepositDefaultSplit('{"8453":0.7,"1337":0.3}')).toEqual({
      8453: 0.7,
      1337: 0.3,
    });
  });

  it('parses the Base-only rollback value', () => {
    expect(parseDepositDefaultSplit('{"8453":1}')).toEqual({ 8453: 1 });
  });

  it('throws on malformed JSON so the container fails fast', () => {
    expect(() => parseDepositDefaultSplit('{8453:0.7}')).toThrow(
      /DEPOSIT_DEFAULT_SPLIT is not valid JSON/,
    );
  });

  it('throws on non-numeric keys', () => {
    expect(() => parseDepositDefaultSplit('{"base":1}')).toThrow(
      /DEPOSIT_DEFAULT_SPLIT is invalid/,
    );
  });

  it('throws on non-positive weights', () => {
    expect(() => parseDepositDefaultSplit('{"8453":0}')).toThrow(
      /DEPOSIT_DEFAULT_SPLIT is invalid/,
    );
  });

  it('throws on unsupported chain ids', () => {
    expect(() => parseDepositDefaultSplit('{"999":0.3,"8453":0.7}')).toThrow(
      /unsupported chain id\(s\): 999/,
    );
  });
});

describe('planSimulationConfigFromEnv', () => {
  const CREDS = {
    accountSlug: 'acct',
    projectSlug: 'proj',
    accessToken: 'token',
  };
  const EMPTY = {
    accountSlug: undefined,
    projectSlug: undefined,
    accessToken: undefined,
  };

  it('turns the gate on when credentials are present', () => {
    expect(
      planSimulationConfigFromEnv({
        ...CREDS,
        required: undefined,
        mode: undefined,
      }),
    ).toEqual({ tenderly: CREDS, required: false });
  });

  it('PLAN_SIMULATION_MODE=off skips the gate despite credentials', () => {
    expect(
      planSimulationConfigFromEnv({
        ...CREDS,
        required: undefined,
        mode: 'off',
      }),
    ).toEqual({ required: false });
  });

  it('PLAN_SIMULATION_REQUIRED=true beats mode=off so fail-closed wins', () => {
    expect(
      planSimulationConfigFromEnv({ ...CREDS, required: 'true', mode: 'off' }),
    ).toEqual({ tenderly: CREDS, required: true });
  });

  it('keeps the fail-at-boot required flag when credentials are missing', () => {
    expect(
      planSimulationConfigFromEnv({ ...EMPTY, required: 'true', mode: 'off' }),
    ).toEqual({ required: true });
  });

  it('leaves the gate off with partial credentials', () => {
    expect(
      planSimulationConfigFromEnv({
        ...CREDS,
        accessToken: undefined,
        required: undefined,
        mode: undefined,
      }),
    ).toEqual({ required: false });
  });
});
