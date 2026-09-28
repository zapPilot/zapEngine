"""Round-trip decimal to WAD flooring and ABI encoding for the slice."""

from __future__ import annotations

import math
from datetime import date
from decimal import ROUND_FLOOR, Decimal, localcontext

from eth_abi import decode, encode
from eth_hash.auto import keccak

WAD = 10**18
EPOCH = date(1970, 1, 1)
SYMBOLS = ("SPY", "BTC", "ETH")
KEYS = ("btc", "eth", "spy", "stable", "alt")
ZONE = {None: 0, "above": 1, "below": 2, "at": 3}
CROSS = {None: 0, "cross_down": 1, "cross_up": 2}
EMPTY_STATES = ((0, 0, 0, 0),) * 3


def to_wad(value: float) -> int:
    if not math.isfinite(value) or value < 0:
        raise ValueError("WAD input must be finite and nonnegative")
    # Use the round-trip decimal (str) so test/shadow WADs match the published
    # landing export (export_landing_examples.decimal_value), which quantizes
    # Decimal(str(value)) to 18 places. Binary-exact Decimal(value) flooring
    # maps 1e-12 to 999999 (below EPSILON) while the published form maps it to
    # 1000000, producing a discrete liquidation-mask mismatch and inflating DMA
    # distance relative error above 1e-15 on recorded history.
    with localcontext() as context:
        context.prec = 1100
        decimal = Decimal(str(value)).quantize(Decimal("1e-18"), rounding=ROUND_FLOOR)
        result = int(decimal * WAD)
    if result >= 2**256:
        raise ValueError("WAD input exceeds uint256")
    return result


def check_collisions(values) -> None:
    seen = {}
    for value in values:
        encoded = to_wad(value)
        if encoded in seen and seen[encoded] != value:
            raise ValueError(f"WAD collision: {seen[encoded]!r} and {value!r}")
        seen[encoded] = value


def epoch_day(value: date | None) -> int:
    if value is None:
        return 0
    result = (value - EPOCH).days
    if not 0 < result < 2**32:
        raise ValueError("Day zero is reserved for unset dates")
    return result


def mask(symbols) -> int:
    return sum(1 << i for i, symbol in enumerate(SYMBOLS) if symbol in symbols)


def abi_type(parameter: dict) -> str:
    kind = parameter["type"]
    if kind.startswith("tuple"):
        return (
            "("
            + ",".join(abi_type(c) for c in parameter["components"])
            + ")"
            + kind[5:]
        )
    return kind


class Codec:
    def __init__(self, abi: list[dict]):
        self.methods = {}
        for item in abi:
            if item["type"] != "function":
                continue
            inputs = [abi_type(p) for p in item["inputs"]]
            outputs = [abi_type(p) for p in item["outputs"]]
            signature = item["name"] + "(" + ",".join(inputs) + ")"
            self.methods[item["name"]] = (
                keccak(signature.encode())[:4],
                inputs,
                outputs,
            )

    def encode(self, name: str, args: tuple) -> bytes:
        selector, inputs, _ = self.methods[name]
        return selector + encode(inputs, args)

    def decode(self, name: str, output: bytes) -> tuple:
        return decode(self.methods[name][2], output)
