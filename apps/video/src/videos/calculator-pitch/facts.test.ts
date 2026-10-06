import { getContractAddress, keccak256, toHex } from 'viem';
import { describe, expect, it } from 'vitest';

import artifact from '../../../../landing-page/src/data/strategy-deployment.json';
import dataset from '../../../../landing-page/src/data/verifiable-strategy.json';
import { facts, shortHex } from './facts';

// The calculator's committed dataset is the single source of truth. A
// redeploy, a new codehash or a refreshed example turns this red, which is the
// cue to re-render the video instead of shipping one that contradicts the page.
const { deployment } = dataset;
const example = dataset.examples.find(
  (candidate) => candidate.date === facts.example.date,
);
const percent = (decimal: string) => Number((Number(decimal) * 100).toFixed(2));

describe('calculator facts', () => {
  it('match the committed deployment', () => {
    expect(deployment.chainId).toBe(facts.chainId);
    expect(deployment.address).toBe(facts.address);
    expect(deployment.transactionHash).toBe(facts.deployTransaction);
    expect(Number(deployment.blockNumber)).toBe(facts.deployBlock);
    expect(deployment.factory).toBe(facts.factory);
    expect(deployment.salt).toBe(facts.salt);
    expect(deployment.compiler).toBe(facts.compiler);
    expect(deployment.sourcify.status).toBe(facts.sourcify);
  });

  it('pin the same runtime codehash everywhere', () => {
    expect(dataset.runtimeCodehash).toBe(facts.runtimeCodehash);
    expect(deployment.runtimeCodehash).toBe(facts.runtimeCodehash);
    expect(artifact.runtimeCodehash).toBe(facts.runtimeCodehash);
    expect(dataset.sourceUrl.endsWith(`/${facts.contractFile}`)).toBe(true);
  });

  it('show a CREATE2 address that factory + salt + initcode really produce', () => {
    expect(keccak256(toHex(facts.saltLabel))).toBe(facts.salt);
    expect(
      getContractAddress({
        opcode: 'CREATE2',
        from: facts.factory,
        salt: facts.salt,
        bytecode: artifact.initcode as `0x${string}`,
      }),
    ).toBe(facts.address);
  });

  it('use the recorded example’s inputs', () => {
    const btc = example?.current.find((row) => row.symbol === 'BTC');
    expect(btc?.price.wad).toBe(facts.example.btc.priceWad);
    expect(Number(btc?.price.decimal)).toBe(Number(facts.example.btc.price));
    expect(Number(btc?.dma.decimal)).toBe(Number(facts.example.btc.dma));
    expect(BigInt(facts.example.btc.priceWad)).toBe(
      BigInt(facts.example.btc.price.replace('.', '').padEnd(24, '0')),
    );
    expect(Number(facts.example.btc.display.replaceAll(',', ''))).toBe(
      Number(Number(facts.example.btc.price).toFixed(2)),
    );
  });

  it('use the recorded allocation before and the Python target after', () => {
    const [btc, eth, spy, stable] = example?.allocation ?? [];
    expect(facts.example.before).toEqual({
      BTC: percent(btc?.decimal ?? ''),
      ETH: percent(eth?.decimal ?? ''),
      SPY: percent(spy?.decimal ?? ''),
      Stable: percent(stable?.decimal ?? ''),
    });
    const [afterBtc, afterEth, afterSpy, afterStable] =
      example?.expected.pythonTarget ?? [];
    expect(facts.example.after).toEqual({
      BTC: percent(afterBtc ?? ''),
      ETH: percent(afterEth ?? ''),
      SPY: percent(afterSpy ?? ''),
      Stable: percent(afterStable ?? ''),
    });
  });

  it('quote the published move as a share, never in dollars', () => {
    expect(example?.publishedEvent.amountPercent).toBe(
      facts.example.movedPercent,
    );
    expect(example?.publishedEvent.fromAssets).toEqual(['BTC', 'ETH']);
    expect(JSON.stringify(facts)).not.toMatch(/\$\d|USD/);
  });

  it('claim one rule out of six', () => {
    expect(dataset.rulesCovered).toHaveLength(facts.rulesCovered);
    expect(facts.rulesTotal).toBe(6);
  });
});

describe('shortHex', () => {
  it('keeps the head and tail', () => {
    expect(shortHex(facts.address)).toBe('0x074A…11Cd');
    expect(shortHex(facts.runtimeCodehash, 10, 6)).toBe('0xc34735d8…7acf50');
  });
});
