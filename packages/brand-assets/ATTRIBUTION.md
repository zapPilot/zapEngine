# Attribution

Every file in `assets/` is a 256x256 PNG produced by `scripts/rasterize.mjs`
from the matching file in `sources/`. This table records where each source came
from so any mark can be re-fetched or replaced without guesswork.

Third-party logos are used nominatively — they name the chain, token, or venue a
user is actually depositing into, the same way DeBank, Zapper, and DefiLlama use
them. They remain the trademarks of their respective owners, are not modified
beyond the normalization described below, and imply no endorsement.

## Chains

| Asset                    | Source file       | Origin                                                                                                                                          |
| ------------------------ | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `chains/arbitrum.png`    | `arbitrum.svg`    | [web3icons](https://github.com/0xa3k5/web3icons) `raw-svgs/networks/branded/arbitrum-one.svg` (MIT)                                             |
| `chains/base.png`        | `base.png`        | Carried over from `apps/app/assets/chains/base.png`. See the Base note below.                                                                   |
| `chains/ethereum.png`    | `ethereum.svg`    | Official — [ethereum/ethereum-org-website](https://github.com/ethereum/ethereum-org-website) `public/images/assets/svgs/eth-diamond-purple.svg` |
| `chains/hyperliquid.png` | `hyperliquid.svg` | [web3icons](https://github.com/0xa3k5/web3icons) `raw-svgs/networks/branded/hyper-evm.svg` (MIT)                                                |

## Tokens

| Asset              | Source file  | Origin                                                                                                                     |
| ------------------ | ------------ | -------------------------------------------------------------------------------------------------------------------------- |
| `tokens/btc.png`   | `btc.svg`    | [web3icons](https://github.com/0xa3k5/web3icons) `raw-svgs/tokens/branded/BTC.svg` (MIT)                                   |
| `tokens/cbbtc.png` | `cbbtc.webp` | [CoinGecko](https://assets.coingecko.com/coins/images/40143/large/cbbtc.webp) — no SVG form of the cbBTC mark is published |
| `tokens/eth.png`   | `eth.svg`    | [web3icons](https://github.com/0xa3k5/web3icons) `raw-svgs/tokens/branded/ETH.svg` (MIT)                                   |
| `tokens/spy.png`   | `spy.svg`    | Original work — neutral rising-index motif created for zapEngine; not an SPDR mark.                                        |
| `tokens/alt.png`   | `alt.svg`    | Original work — neutral overlapping multi-asset motif created for zapEngine.                                               |
| `tokens/usdc.png`  | `usdc.svg`   | [web3icons](https://github.com/0xa3k5/web3icons) `raw-svgs/tokens/branded/USDC.svg` (MIT)                                  |
| `tokens/usdt.png`  | `usdt.svg`   | [web3icons](https://github.com/0xa3k5/web3icons) `raw-svgs/tokens/branded/USDT.svg` (MIT)                                  |
| `tokens/wbtc.png`  | `wbtc.svg`   | [web3icons](https://github.com/0xa3k5/web3icons) `raw-svgs/tokens/branded/WBTC.svg` (MIT)                                  |
| `tokens/weth.png`  | `weth.png`   | [CoinGecko](https://assets.coingecko.com/coins/images/2518/large/weth.png) — no SVG form of the WETH mark is published     |

## Protocols

| Asset                       | Source file       | Origin                                                                                                                                                                                                                 |
| --------------------------- | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `protocols/aave.png`        | `aave.svg`        | [web3icons](https://github.com/0xa3k5/web3icons) `raw-svgs/tokens/branded/AAVE.svg` (MIT)                                                                                                                              |
| `protocols/gmx-v2.png`      | `gmx-v2.svg`      | Official — [gmx-io/gmx-interface](https://github.com/gmx-io/gmx-interface) `src/img/ic_gmx_64.svg`                                                                                                                     |
| `protocols/hyperliquid.png` | `hyperliquid.svg` | [web3icons](https://github.com/0xa3k5/web3icons) `raw-svgs/networks/branded/hyper-evm.svg` (MIT). Hyperliquid uses one mark for the venue and the chain, so this is a byte-identical copy of `chains/hyperliquid.svg`. |
| `protocols/lido.png`        | `lido.svg`        | [web3icons](https://github.com/0xa3k5/web3icons) `raw-svgs/tokens/branded/LDO.svg` (MIT)                                                                                                                               |
| `protocols/morpho.png`      | `morpho.svg`      | Official — `https://cdn.morpho.org/assets/logos/morpho.svg`                                                                                                                                                            |
| `protocols/ondo.png`        | `ondo.svg`        | Official — `https://ondo.finance/favicon.svg`                                                                                                                                                                          |

Moonwell has no asset here on purpose. Moonwell curates a Morpho vault rather
than being a protocol the deposit lands in, so it is rendered as the Morpho mark
next to the text "Moonwell USDC".

## Normalization applied by `scripts/rasterize.mjs`

- SVG is rendered at 256px wide, then fitted into a 256x256 transparent canvas.
- Raster sources are fitted into the same canvas without upscaling past 256px.
- `protocols/ondo.png` has its ink inverted. Ondo publishes only the light-mode
  (black-on-transparent) mark, which is invisible on this product's dark
  surfaces; the inversion changes the ink color and nothing else.

## The Base mark

Base's current official symbol (`logo/TheSquare` in
[base/brand-kit](https://github.com/base/brand-kit)) is a solid blue square. It
carries no interior form, so once clipped to the circular chain badge it renders
as a featureless blue disc and stops identifying anything. The circular Base
mark this repository already shipped is kept instead. Replace it if Base
publishes a symbol that survives a circular clip at badge size.

## The SPY mark

The SPY asset is an original neutral market-index symbol: a light circular
field, subdued pillars, and a rising line. It deliberately avoids the SPDR
wordmark, spider imagery, and other SPDR trade dress. “S&P 500” is used only as
the human-readable label for the tracked index exposure.

## The ALT mark

The ALT asset is an original neutral multi-asset symbol: three overlapping
circles in a subdued gray palette. It names the aggregate altcoin allocation
category rather than any individual token or protocol.
