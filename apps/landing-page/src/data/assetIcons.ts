import type { TokenBrandSymbol } from '@zapengine/brand-assets';
import type { StaticImageData } from 'next/image';

import btcMark from '@zapengine/brand-assets/assets/tokens/btc.png';
import cbbtcMark from '@zapengine/brand-assets/assets/tokens/cbbtc.png';
import ethMark from '@zapengine/brand-assets/assets/tokens/eth.png';
import spyMark from '@zapengine/brand-assets/assets/tokens/spy.png';
import usdcMark from '@zapengine/brand-assets/assets/tokens/usdc.png';
import usdtMark from '@zapengine/brand-assets/assets/tokens/usdt.png';
import wbtcMark from '@zapengine/brand-assets/assets/tokens/wbtc.png';
import wethMark from '@zapengine/brand-assets/assets/tokens/weth.png';

export const TOKEN_ICON_SRC: Record<TokenBrandSymbol, StaticImageData> = {
  USDC: usdcMark,
  USDT: usdtMark,
  ETH: ethMark,
  WETH: wethMark,
  WBTC: wbtcMark,
  CBBTC: cbbtcMark,
  BTC: btcMark,
  SPY: spyMark,
};
