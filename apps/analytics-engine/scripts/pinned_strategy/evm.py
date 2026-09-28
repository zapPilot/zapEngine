"""In-memory Shanghai EVM. Deploy initcode once; all subsequent calls are static."""

from __future__ import annotations

import json

from pyrevm import EVM

from scripts.pinned_strategy.codec import Codec
from scripts.pinned_strategy.compile import ARTIFACT

CALLER = "0x" + "10" * 20


class SliceEVM:
    def __init__(self, artifact: dict | None = None):
        artifact = json.loads(ARTIFACT.read_text()) if artifact is None else artifact
        self.codec = Codec(artifact["abi"])
        self.evm = EVM(spec_id="SHANGHAI")
        self.address = self.evm.deploy(CALLER, bytes.fromhex(artifact["initcode"][2:]))
        code = self.evm.get_code(self.address)
        expected = bytes.fromhex(artifact["runtime_code"][2:])
        # revm exposes analyzed bytecode with 33 trailing STOP bytes.
        if (
            code is None
            or code[: len(expected)] != expected
            or "0x" + self.evm.basic(self.address).code_hash.hex()
            != artifact["runtime_codehash"]
        ):
            raise RuntimeError("Deployed runtime codehash mismatch")
        self.gas = 0

    def call(self, name: str, *args):
        output = self.evm.message_call(
            caller=CALLER,
            to=self.address,
            calldata=self.codec.encode(name, args),
            is_static=True,
        )
        result = self.evm.result
        if result is None or not result.is_success:
            raise RuntimeError(f"EVM call failed: {name}")
        self.gas = result.gas_used
        decoded = self.codec.decode(name, output)
        return decoded[0] if len(decoded) == 1 else decoded
