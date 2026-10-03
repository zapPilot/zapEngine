"""Operator-run CREATE2 deployment. No private keys in arguments, files or env."""

from __future__ import annotations

import argparse
import getpass
import json
import sys
import time

import httpx
from eth_account import Account
from eth_hash.auto import keccak
from eth_utils import to_checksum_address

from scripts.pinned_strategy.compile import ARTIFACT, SOURCE, compile_source

CHAIN_ID = 421614
RPC = "https://sepolia-rollup.arbitrum.io/rpc"
FACTORY = "0x4e59b44847b379578588920cA78FbF26c0B4956C"
FACTORY_CODE = "0x7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe03601600081602082378035828234f58015156039578182fd5b8082525050506014600cf3"
SALT = keccak(b"zap-pilot/research/dma-cross-down-slice/v1")
DEPLOYMENTS = ARTIFACT.with_name("deployments.json")
SOURCIFY = "https://sourcify.dev/server"


def predicted_address(initcode):
    return to_checksum_address(
        keccak(
            b"\xff"
            + bytes.fromhex(FACTORY[2:])
            + SALT
            + keccak(bytes.fromhex(initcode[2:]))
        )[-20:]
    )


class Rpc:
    def __init__(self, url):
        self.client = httpx.Client(timeout=30)
        self.url = url

    def call(self, method, *params):
        response = self.client.post(
            self.url,
            json={"jsonrpc": "2.0", "id": 1, "method": method, "params": list(params)},
        )
        response.raise_for_status()
        body = response.json()
        if "error" in body:
            # Don't echo RPC request bodies (sendRawTransaction contains a signature).
            raise RuntimeError(f"{method} failed: {body['error'].get('code')}")
        return body["result"]


def verify_code(rpc, address, artifact, block="latest"):
    code = rpc.call("eth_getCode", address, block)
    if "0x" + keccak(bytes.fromhex(code[2:])).hex() != artifact["runtime_codehash"]:
        raise RuntimeError("Runtime codehash mismatch")


def verify_source(address, transaction):
    payload = {
        "compilerVersion": "0.4.3",
        "contractIdentifier": "dma_cross_down_slice.vy:dma_cross_down_slice",
        "creationTransactionHash": transaction,
        "stdJsonInput": {
            "language": "Vyper",
            "sources": {"dma_cross_down_slice.vy": {"content": SOURCE.read_text()}},
            "settings": {
                "evmVersion": "shanghai",
                "optimize": "gas",
                "outputSelection": {
                    "*": ["abi", "evm.bytecode", "evm.deployedBytecode"]
                },
            },
        },
    }
    with httpx.Client(timeout=60) as client:
        response = client.post(
            f"{SOURCIFY}/v2/verify/{CHAIN_ID}/{address}", json=payload
        )
        response.raise_for_status()
        job = response.json()["verificationId"]
        for _ in range(60):
            response = client.get(f"{SOURCIFY}/v2/verify/{job}")
            response.raise_for_status()
            result = response.json()
            if result["isJobCompleted"]:
                if result.get("contract", {}).get("runtimeMatch") not in (
                    "match",
                    "exact_match",
                ):
                    raise RuntimeError(f"Sourcify verification failed; job {job}")
                return result
            time.sleep(2)
    raise RuntimeError(
        f"Sourcify pending; job {job}. Rerun with --transaction to resume."
    )


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--rpc", default=RPC)
    parser.add_argument(
        "--broadcast",
        action="store_true",
        help="Prompt locally for a key and broadcast the deployment",
    )
    parser.add_argument(
        "--transaction",
        help="Resume verification of a previously broadcast transaction",
    )
    args = parser.parse_args()
    artifact = json.loads(ARTIFACT.read_text())
    if compile_source() != artifact:
        raise SystemExit("Artifact is stale; compile --check must pass")
    address = predicted_address(artifact["initcode"])
    print(
        json.dumps(
            {
                "chainId": CHAIN_ID,
                "predictedAddress": address,
                "salt": "0x" + SALT.hex(),
                "runtimeCodehash": artifact["runtime_codehash"],
            },
            indent=2,
        )
    )
    if not args.broadcast and not args.transaction:
        return
    rpc = Rpc(args.rpc)
    if int(rpc.call("eth_chainId"), 16) != CHAIN_ID:
        raise RuntimeError("Only Arbitrum Sepolia is supported")
    if rpc.call("eth_getCode", FACTORY, "latest").lower() != FACTORY_CODE:
        raise RuntimeError("Deterministic deployer bytecode mismatch or absent")
    data = "0x" + SALT.hex() + artifact["initcode"][2:]
    transaction = args.transaction
    if transaction is None:
        if rpc.call("eth_getCode", address, "latest") != "0x":
            raise RuntimeError(
                "Already deployed; provide --transaction to verify provenance"
            )
        if not sys.stdin.isatty():
            raise RuntimeError(
                "Run interactively in your own terminal; never pipe a key"
            )
        account = Account.from_key(
            getpass.getpass("Arbitrum Sepolia deployment private key (hidden): ")
        )
        tx = {
            "chainId": CHAIN_ID,
            "to": to_checksum_address(FACTORY),
            "value": 0,
            "data": data,
            "nonce": int(
                rpc.call("eth_getTransactionCount", account.address, "pending"), 16
            ),
            "gasPrice": int(rpc.call("eth_gasPrice"), 16),
        }
        tx["gas"] = (
            int(
                rpc.call(
                    "eth_estimateGas",
                    {
                        "from": account.address,
                        "to": FACTORY,
                        "data": data,
                        "value": "0x0",
                    },
                ),
                16,
            )
            * 12
            // 10
        )
        print(
            f"Deployer {account.address}; maximum gas cost {tx['gas'] * tx['gasPrice']} wei"
        )
        if input("Type DEPLOY to broadcast this research slice: ") != "DEPLOY":
            return
        transaction = rpc.call(
            "eth_sendRawTransaction",
            "0x" + account.sign_transaction(tx).raw_transaction.hex(),
        )
        del account
        print(
            f"Deployment transaction: {transaction} (save this to resume verification)"
        )
    receipt = None
    for _ in range(90):
        receipt = rpc.call("eth_getTransactionReceipt", transaction)
        if receipt:
            break
        time.sleep(2)
    if receipt is None or int(receipt["status"], 16) != 1:
        raise RuntimeError("Deployment pending or reverted; resume with --transaction")
    tx = rpc.call("eth_getTransactionByHash", transaction)
    if (
        tx["to"].lower() != FACTORY.lower()
        or tx["input"].lower() != data.lower()
        or int(tx["value"], 16) != 0
    ):
        raise RuntimeError("Transaction is not this CREATE2 deployment")
    verify_code(rpc, address, artifact, receipt["blockNumber"])
    verify_code(rpc, address, artifact)
    record = {
        "chainId": CHAIN_ID,
        "address": address,
        "transactionHash": transaction,
        "blockNumber": str(int(receipt["blockNumber"], 16)),
        "runtimeCodehash": artifact["runtime_codehash"],
        "salt": "0x" + SALT.hex(),
        "factory": FACTORY,
        "compiler": "0.4.3",
        "evmVersion": "shanghai",
        "sourcify": {"status": "pending"},
    }
    DEPLOYMENTS.write_text(json.dumps(record, indent=2) + "\n")
    result = verify_source(address, transaction)
    record["sourcify"] = {
        "status": "verified",
        "verificationId": result["verificationId"],
        "runtimeMatch": result["contract"]["runtimeMatch"],
    }
    DEPLOYMENTS.write_text(json.dumps(record, indent=2) + "\n")
    print(f"Verified deployment written to {DEPLOYMENTS}")


if __name__ == "__main__":
    main()
