"""Explicit ETH liquid-staking asset registry for income attribution.

Identity is intentionally chain + token address. Symbols are display metadata only;
never use them to decide whether an asset is eligible for synthetic staking income.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

LstAccrualMode = Literal["benchmark-rate", "balance-delta"]


@dataclass(frozen=True)
class EthLstAsset:
    chain: str
    token_address: str
    symbol: str
    accrual_mode: LstAccrualMode


def _asset(
    chain: str,
    token_address: str,
    symbol: str,
    accrual_mode: LstAccrualMode,
) -> EthLstAsset:
    return EthLstAsset(
        chain=chain,
        token_address=token_address.lower(),
        symbol=symbol,
        accrual_mode=accrual_mode,
    )


# Keep this list deliberately small. Add a chain/address pair only when the product
# explicitly supports that direct LST representation. Derivatives/receipt tokens are
# not eligible unless they receive their own exact registry entry.
ETH_LST_ASSETS: tuple[EthLstAsset, ...] = (
    # Ethereum mainnet.
    _asset(
        "eth", "0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0", "wstETH", "benchmark-rate"
    ),
    _asset(
        "eth", "0xBe9895146f7AF43049ca1c1AE358B0541Ea49704", "cbETH", "benchmark-rate"
    ),
    _asset(
        "eth", "0xae78736Cd615f374D3085123A210448E74Fc6393", "rETH", "benchmark-rate"
    ),
    _asset(
        "eth", "0xCd5fE23C85820F7B72D0926FC9b05b43E359b7ee", "weETH", "benchmark-rate"
    ),
    _asset(
        "eth", "0xbf5495Efe5DB9ce00f80364C8B423567e58d2110", "ezETH", "benchmark-rate"
    ),
    _asset(
        "eth", "0xA1290d69c65A6Fe4DF752f95823fae25cb99e5A7", "rsETH", "benchmark-rate"
    ),
    # stETH rebases in-place. Existing snapshot amount deltas already observe that
    # accrual, so it must never receive the benchmark rate on top.
    _asset(
        "eth", "0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84", "stETH", "balance-delta"
    ),
    # Direct canonical wstETH representations on product-supported L2s.
    _asset(
        "arb", "0x5979D7b546E38E414F7E9822514be443A4800529", "wstETH", "benchmark-rate"
    ),
    _asset(
        "base", "0xc1CBa3fCea344f92D9239c08C0568f6F2F0ee452", "wstETH", "benchmark-rate"
    ),
    _asset(
        "op", "0x1F32b1c2345538c0c6f582fCB022739c4A194Ebb", "wstETH", "benchmark-rate"
    ),
)

_CHAIN_ALIASES = {
    "ethereum": "eth",
    "arbitrum": "arb",
    "arbitrum-one": "arb",
    "optimism": "op",
}


def normalize_lst_chain(chain: str) -> str:
    normalized = chain.strip().lower()
    return _CHAIN_ALIASES.get(normalized, normalized)


ETH_LST_BY_IDENTITY = {
    (normalize_lst_chain(asset.chain), asset.token_address): asset
    for asset in ETH_LST_ASSETS
}


def find_eth_lst_asset(chain: str, token_address: str | None) -> EthLstAsset | None:
    """Resolve only an exact registered chain/address pair."""
    if not token_address:
        return None
    return ETH_LST_BY_IDENTITY.get(
        (normalize_lst_chain(chain), token_address.strip().lower())
    )
