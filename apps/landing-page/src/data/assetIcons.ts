import type {
  ChainBrandKey,
  ProtocolBrandKey,
  TokenBrandSymbol,
} from '@zapengine/brand-assets';
import type { StaticImageData } from 'next/image';

import arbitrumMark from '@zapengine/brand-assets/assets/chains/arbitrum.png';
import baseMark from '@zapengine/brand-assets/assets/chains/base.png';
import ethereumMark from '@zapengine/brand-assets/assets/chains/ethereum.png';
import hyperliquidChainMark from '@zapengine/brand-assets/assets/chains/hyperliquid.png';
import aaveMark from '@zapengine/brand-assets/assets/protocols/aave.png';
import gmxV2Mark from '@zapengine/brand-assets/assets/protocols/gmx-v2.png';
import hyperliquidProtocolMark from '@zapengine/brand-assets/assets/protocols/hyperliquid.png';
import lidoMark from '@zapengine/brand-assets/assets/protocols/lido.png';
import morphoMark from '@zapengine/brand-assets/assets/protocols/morpho.png';
import ondoMark from '@zapengine/brand-assets/assets/protocols/ondo.png';
import altMark from '@zapengine/brand-assets/assets/tokens/alt.png';
import btcMark from '@zapengine/brand-assets/assets/tokens/btc.png';
import cbbtcMark from '@zapengine/brand-assets/assets/tokens/cbbtc.png';
import ethMark from '@zapengine/brand-assets/assets/tokens/eth.png';
import spyMark from '@zapengine/brand-assets/assets/tokens/spy.png';
import usdcMark from '@zapengine/brand-assets/assets/tokens/usdc.png';
import usdtMark from '@zapengine/brand-assets/assets/tokens/usdt.png';
import wbtcMark from '@zapengine/brand-assets/assets/tokens/wbtc.png';
import wethMark from '@zapengine/brand-assets/assets/tokens/weth.png';

export const CHAIN_ICON_SRC: Record<ChainBrandKey, StaticImageData> = {
  ethereum: ethereumMark,
  base: baseMark,
  arbitrum: arbitrumMark,
  hyperliquid: hyperliquidChainMark,
};

export const TOKEN_ICON_SRC: Record<TokenBrandSymbol, StaticImageData> = {
  USDC: usdcMark,
  USDT: usdtMark,
  ETH: ethMark,
  WETH: wethMark,
  WBTC: wbtcMark,
  CBBTC: cbbtcMark,
  BTC: btcMark,
  SPY: spyMark,
  ALT: altMark,
};

export const PROTOCOL_ICON_SRC: Record<ProtocolBrandKey, StaticImageData> = {
  morpho: morphoMark,
  'gmx-v2': gmxV2Mark,
  hyperliquid: hyperliquidProtocolMark,
  ondo: ondoMark,
  aave: aaveMark,
  lido: lidoMark,
};
