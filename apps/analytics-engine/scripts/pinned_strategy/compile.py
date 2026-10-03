"""Reproducible compiler for the research slice; never touches production fixtures."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

import vyper
from eth_hash.auto import keccak
from vyper.compiler.settings import OptimizationLevel, Settings

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "contracts/pinned_strategy/dma_cross_down_slice.vy"
ARTIFACT = ROOT / "tests/fixtures/pinned_strategy/dma_cross_down_slice.json"


def compile_source(source: str | None = None) -> dict:
    if vyper.__version__ != "0.4.3":
        raise RuntimeError("This spike requires vyper==0.4.3")
    source = SOURCE.read_text() if source is None else source
    compiled = vyper.compile_code(
        source,
        contract_path="dma_cross_down_slice.vy",
        output_formats=["abi", "bytecode", "bytecode_runtime"],
        settings=Settings(evm_version="shanghai", optimize=OptimizationLevel.GAS),
    )
    return {
        "compiler": vyper.__version__,
        "settings": {"evm_version": "shanghai", "optimize": "gas"},
        "source_sha256": hashlib.sha256(source.encode()).hexdigest(),
        "abi": compiled["abi"],
        "initcode": compiled["bytecode"],
        "runtime_code": compiled["bytecode_runtime"],
        "runtime_codehash": "0x"
        + keccak(bytes.fromhex(compiled["bytecode_runtime"][2:])).hex(),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    artifact = compile_source()
    if args.check:
        if json.loads(ARTIFACT.read_text()) != artifact:
            raise SystemExit("Artifact differs from pinned compilation")
    else:
        ARTIFACT.write_text(json.dumps(artifact, indent=2, sort_keys=True) + "\n")
    print(artifact["runtime_codehash"])


if __name__ == "__main__":
    main()
