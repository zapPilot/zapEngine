# Spike: EIP-7702 session scoping via Ambire/OKX delegates (ADR 0002 Stage B)

**Date:** 2026-07-07 · **Question (D3 Stage B):** can Ambire's or OKX's audited 7702 delegate express session keys with (1) target-contract whitelist, (2) per-tx value cap, (3) any-time user revocation — enforced on-chain by the delegate?

## TL;DR verdict

**Stage B partially viable (gaps: neither Ambire nor OKX ships whitelist+cap session keys today; an audited third-party delegate that does exists — MetaMask's Delegation Framework on Base).** Ambire's delegate has all-or-nothing key privileges and its session-keys feature is still "coming soon"; OKX's delegate has the _mechanism_ (per-owner hooks that see full call batches) but ships no whitelist/cap policy contract, so using it still means writing our own Solidity hook. The strict Ambire/OKX answer is **no**, but Stage C ("write our own delegate") is not automatically triggered: MetaMask's audited `EIP7702StatelessDeleGator` + caveat enforcers already express whitelist + per-tx cap + revocation on Base.

## Method & sources consulted

- Read contract source on GitHub (raw files): `AmbireTech/ambire-common` v2 branch; `okxlabs/okx-smart-wallet-evm` main; `MetaMask/delegation-framework` main.
- Checked deployments via Base Blockscout API (chain 8453) for both delegate addresses.
- Cross-checked audit artifacts committed in each repo and Code4rena's published Ambire reports; vendor blogs/docs used only for product-status claims, flagged as such.
- Could not open audit PDFs or Walletbeat (403); flagged below.

## Ambire findings

**Mechanism.** The 7702 delegate is [`AmbireAccount7702.sol`](https://github.com/AmbireTech/ambire-common/blob/v2/contracts/AmbireAccount7702.sol), a thin extension of [`AmbireAccount.sol`](https://github.com/AmbireTech/ambire-common/blob/v2/contracts/AmbireAccount.sol). Authorization = per-key `privileges[addr]` mapping set via `setAddrPrivilege(address addr, bytes32 priv)`, callable only as a self-call (`require(msg.sender == address(this), 'ONLY_ACCOUNT_CAN_CALL')`). A signature is valid if the signer's privilege is non-zero — privileges are effectively **binary** (or a hash committing to an external validator config).

- **Target whitelist: NO.** `executeBatch` executes any `call.to` with no per-key target filtering (verified in `AmbireAccount.sol` source, link above).
- **Per-tx value cap: NO.** Values pass through unchecked; no spend-limit code exists in the contract.
- **Revocation: YES.** Set the key's privilege to `bytes32(0)` via `setAddrPrivilege`; an anti-bricking check prevents removing the _last_ key. Plus universal 7702 revocation (re-delegate/clear delegation with a new authorization).
- **Extension point:** `ExternalSigValidator` — privilege can be `keccak256(abi.encode(validatorAddr, validatorData))` and validation delegates to `validateSig(validatorData, innerSig, calls)`, which _does_ receive the calls array, so a scoped-session validator is expressible. But the only shipped validators are recovery ones (`DKIMRecoverySigValidator.sol`, `RecoverySigValidator.sol`) — no session/whitelist/cap validator exists in [the v2 contracts tree](https://github.com/AmbireTech/ambire-common/tree/v2/contracts). Writing one = writing our own audited Solidity, i.e. Stage C by another name.
- **Product status:** Ambire's own blog says session keys "will be available … in the near future" — announced, not shipped ([blog.ambire.com/eip-7702-wallet](https://blog.ambire.com/eip-7702-wallet/)).
- **Audits:** AmbireAccount v2 audited via Code4rena — [2023-05 invitational](https://code4rena.com/reports/2023-05-ambire) + [2023-06 mitigation review](https://code4rena.com/audits/2023-06-ambire-wallet-mitigation-review) (earlier v1: [2021-10](https://code4rena.com/reports/2021-10-ambire)). **No audit specifically covering the `AmbireAccount7702` wrapper was found.**
- **Base:** deployed and source-verified as `AmbireAccount7702` at [`0x5A7FC11397E9a8AD41BF10bf13F22B0a63f96f6d` on Base](https://base.blockscout.com/address/0x5A7FC11397E9a8AD41BF10bf13F22B0a63f96f6d) (same address Etherscan labels ["Ambire: EIP-7702 Delegator"](https://etherscan.io/address/0x5A7FC11397E9a8AD41BF10bf13F22B0a63f96f6d) on mainnet).

**Ambire verdict: fails N3 today** — no on-chain scoping for a secondary key; only add/remove full-power keys.

## OKX findings

**Mechanism.** The original [`okx/wallet-core`](https://github.com/okx/wallet-core) is **deprecated**; current code is [`okxlabs/okx-smart-wallet-evm`](https://github.com/okxlabs/okx-smart-wallet-evm) (`SmartWalletEntry` delegate composed of `OwnerManager`, `ValidationManager`, `ExecutionManager`, `NonceManager`, `AllowanceManager`, `ERC4337Account`). An owner = `keyHash` + validator + packed `settings`: `[isAdmin bit][uint40 expiration][160-bit hook address]` ([`src/OwnerManager.sol`](https://github.com/okxlabs/okx-smart-wallet-evm/blob/main/src/OwnerManager.sol)).

- **Target whitelist: NOT BUILT-IN, but expressible via hooks.** `OwnerManager` itself has no target filtering, and validators receive only `(keyHash, typedDataHash, signature)` — no calldata, so they cannot scope calls ([`src/ValidationManager.sol`](https://github.com/okxlabs/okx-smart-wallet-evm/blob/main/src/ValidationManager.sol)). However, each owner can carry a **hook**: `IHook.preCheck(Call[] calldata calls, address executor)` receives the full batch — each `Call` has `target`/`value`/`data` — and can revert to block execution ([`src/interfaces/IHook.sol`](https://github.com/okxlabs/okx-smart-wallet-evm/blob/main/src/interfaces/IHook.sol)); hooks run in `_batchCall`, which all entry points (`execute`, `executeUserOp`, `executeWithRelayer`) converge on ([`src/SmartWallet.sol`](https://github.com/okxlabs/okx-smart-wallet-evm/blob/main/src/SmartWallet.sol)). So whitelist + per-tx cap is _expressible_ — **but the repo ships no such hook implementation** (no policy/hook contracts in `src/`), so we would have to write and audit the hook contract ourselves.
- **Per-tx value cap: NOT BUILT-IN** at the owner level (same hook story). `AllowanceManager` is a different thing — cumulative ETH/ERC-20 allowances keyed by _external spender_ (`msg.sender`), not by owner key ([`src/AllowanceManager.sol`](https://github.com/okxlabs/okx-smart-wallet-evm/blob/main/src/AllowanceManager.sol)) — useful for pull-payment patterns, not for scoping a session signer's `execute`.
- **Useful built-ins:** per-owner `uint40` expiry; non-admin owners are blocked from self-calls (`NonAdminSelfCall` revert), so a session owner cannot add owners or change config — a real anti-escalation property.
- **Revocation: YES.** `removeOwner(bytes32 keyHash)` (`onlySelf`, i.e. admin-signed self-call) + expiry + universal 7702 re-delegation.
- **Audits:** BlockSec and CertiK reports committed at [`docs/audits`](https://github.com/okxlabs/okx-smart-wallet-evm/tree/main/docs/audits) (`blocksec_okx_smart_wallet_v1.0-signed.pdf`, `certik_okx_smart_wallet.pdf`, plus an OKX internal report). PDFs not opened in this spike — scope/dates unverified.
- **Base:** README lists "Ethereum / X Layer / Base / Optimism / Arbitrum / BSC / Polygon", `SmartWalletEntry = 0xe40ccB2D94975c51bff0C004eFDfd9B3a5796fA4` on all chains. Bytecode exists at that address on Base but it is [**not source-verified on Base Blockscout**](https://base.blockscout.com/address/0xe40ccB2D94975c51bff0C004eFDfd9B3a5796fA4) as of today.

**OKX verdict: mechanism yes, policy no** — audited delegate with the right extension seam (per-owner hook seeing full `Call[]`), but N3 scoping still requires custom Solidity (a hook, not a full delegate).

## Other 7702 delegates (fallback survey)

**MetaMask Delegation Framework — fits the requirement.** [`EIP7702StatelessDeleGatorImpl`](https://github.com/MetaMask/delegation-framework) is a 7702 delegate whose delegations carry caveats enforced on-chain by dedicated contracts: [`src/enforcers`](https://github.com/MetaMask/delegation-framework/tree/main/src/enforcers) includes `AllowedTargetsEnforcer` (target whitelist), `AllowedMethodsEnforcer`, `ValueLteEnforcer` (per-redemption ETH value cap), `ERC20TransferAmountEnforcer` / `ERC20PeriodTransferEnforcer` / `NativeTokenPeriodTransferEnforcer` (token spend caps incl. per-period), `LimitedCallsEnforcer`, `TimestampEnforcer` (~44 enforcers total). Revocation: `disableDelegation(Delegation calldata)` on the DelegationManager, callable by the delegator ([`IDelegationManager.sol`](https://github.com/MetaMask/delegation-framework/blob/main/src/interfaces/IDelegationManager.sol)). Audited by Cyfrin and Consensys Diligence ([`audits/`](https://github.com/MetaMask/delegation-framework/tree/main/audits)); deployed deterministically (CREATE2, salt "GATOR") on Base per [`documents/Deployments.md`](https://github.com/MetaMask/delegation-framework/blob/main/documents/Deployments.md) — v1.3.0 `DelegationManager 0xdb9B1e94B5b69Df7e401DDbedE43491141047dB3`, `EIP7702StatelessDeleGatorImpl 0x63c0c19a282a1B52b07dD5a65b58948A07DAE32B`. [7702 quickstart docs](https://docs.metamask.io/delegation-toolkit/development/get-started/eip7702-quickstart/).

**ZeroDev Kernel (7702 mode).** Kernel supports [7702](https://docs.zerodev.app/sdk/getting-started/quickstart-7702) and a [permissions system](https://docs.zerodev.app/smart-wallet/permissions/intro) with a Call policy ("only call certain contracts or functions (and only with certain params)"), rate-limit and timestamp policies. Docs consulted don't spell out revocation or a token-spend cap policy; would need a deeper pass before relying on it.

**Biconomy Nexus (7702 mode).** Supports 7702 with module-based smart sessions and spending limits, audited by Spearbit/Cyfrin per [Biconomy's docs](https://docs.biconomy.io/new/learn-about-biconomy/nexus) and [7702 guide](https://blog.biconomy.io/a-comprehensive-eip-7702-guide-for-apps/) — vendor claims, not source-verified in this spike.

**Coinbase Smart Wallet:** ERC-4337 contract wallet, no production 7702 delegate found — not a candidate.

## Gaps & what could not be verified

- **Ambire:** no audit found covering `AmbireAccount7702` specifically (only v1/v2 `AmbireAccount` via Code4rena); session-key ship date unknown; possible unshipped session validator on a private branch — couldn't check. Walletbeat's independent assessment returned 403.
- **OKX:** audit PDFs not opened (scope, versions, findings unread); `SmartWalletEntry` unverified on Base Blockscout (bytecode-only trust today); whether the OKX _consumer wallet app_ currently authorizes this new delegate vs. the old `wallet-core` one is unknown (deprecated README lists no addresses); hook resolution on the relayer path (signing owner's hook vs. `msg.sender`'s) inferred from source summary, not line-by-line verified.
- **Cross-cutting for N3:** a per-tx ETH `value` cap does **not** bound ERC-20 notional. Real DeFi rebalancing moves tokens via arbitrary protocol calldata, so "per-tx notional cap" needs token-aware enforcement (MetaMask's ERC20 amount/period enforcers + target/method whitelist come closest; a plain value cap alone is insufficient on every delegate surveyed).
- MetaMask enforcer semantics taken from contract names, docs search results, and interface source — individual enforcer code not read line-by-line.

## Recommendation for ADR 0002 D3

**Do not proceed Stage B with Ambire or OKX as-shipped; do not yet trigger Stage C.** Concretely:

1. **Re-scope Stage B to the MetaMask Delegation Framework** as the audited third-party 7702 delegate: `EIP7702StatelessDeleGator` on Base + delegation to the rebalancer key caveated with `AllowedTargetsEnforcer` + `AllowedMethodsEnforcer` + `ValueLteEnforcer` + ERC-20 amount/period enforcers + `TimestampEnforcer`; revocation via `disableDelegation` or 7702 re-delegation. Next spike step: prototype on Base Sepolia and read the Cyfrin/Diligence reports for enforcer coverage.
2. **Keep OKX as plan B:** its delegate is audited and Base-deployed with per-owner expiry and no-self-call containment; cost is writing + auditing a small `IHook` policy contract (whitelist+cap) — materially cheaper than a full Stage C delegate, but still our Solidity.
3. **Re-spike Ambire when session keys actually ship** (watch `ambire-common` v2 for a session/scoped `ExternalSigValidator` and a 7702-specific audit).
