# Pinned Strategy — Vyper DMA / cross_down_exit feasibility spike

Date: 2026-09-27. Research slice only; **not a release or cutover candidate**.

## Decision

**No-go for semantic parity under the proposed WAD ABI as currently specified.**
Vyper can express the state transitions, and Python can deploy and call its actual
bytecode locally. Ordinary synthetic histories agree, but adversarial boundaries
produce a discrete liquidation-mask mismatch and violate the required distance
relative-error bound. These are measured counterexamples, not a compiler failure.
Production-history acceptance and its performance measurement remain pending
explicit approval to use production read-only secrets. No real-history result is
claimed here.

Python remains the production path and oracle. No executable file under `src/`,
existing snapshot, landing marketing data, branch, or commit was changed. The
checkout was clean, detached HEAD when inspected, rather than `main` with other
agents' edits as described in the handoff. No commit or GitHub write was attempted.

## What was built

- `contracts/pinned_strategy/dma_cross_down_slice.vy`: four external pure methods,
  fixed arrays, bounded loops, Shanghai, Vyper 0.4.3. Array/mask order SPY/BTC/ETH;
  allocation order BTC/ETH/SPY/stable/alt. Zone and event encodings are documented
  in the contract. Zero price/DMA means absent; zero epoch day means unset.
- `scripts/pinned_strategy/compile.py`: compiler/version/settings/source hash,
  ABI/initcode/runtime/codehash artifact, plus reproducibility `--check`.
- `codec.py`: exact `Decimal(float)` flooring with sufficient precision, range
  validation, collision detection, epoch days, ABI derived from compiled artifact.
- `evm.py`: deploy initcode once, check runtime bytes/account codehash, static calls
  through pyrevm 0.3.7. revm's exposed analyzed bytecode includes 33 trailing STOP
  bytes; account codehash is checked rather than hashing the padded buffer.
- `shadow.py`: instrument each real `RuleBasedPortfolioStrategy` instance's
  warmup/observe/decide/apply_intent/record_execution. Actual compare runs drive
  state; Python winners drive selected/forced masks, including other rules.
  Only an executed cross_down_exit updates the rule cooldown date. DMA state is
  checked after observation, warmup, and commit against Python debug state.
- `record_market_history.py`: capture prepared compare inputs before the engine,
  including warmup, market features and sentiments; deterministic gzip JSONL;
  collision check; reject overwrite/out-of-directory output. No snapshot writer.
- Tests: existing validation histories, 500-day synthetic stream with missing ETH
  DMA and touch/direct-cross transitions, cooldown edges, peer exits with absent
  peers, alt recycling, empty holdings, epsilon, codec and five mutations.
- `benchmark.py`: encode/call/decode latency and three-repeat median full compare
  with/without shadow. Default and the actual optimized public params are used.
  Real history is required unless `--synthetic` is explicitly selected.

The installed runtime is CPython 3.11.15 on macOS 26.6.2 ARM64. `.python-version`
is 3.11; Vyper/pyrevm/eth-abi are dev-only and locked. This file alone does not
change an independently configured CI Python version; CI alignment is not claimed.

## Parity evidence

The saved result `tests/fixtures/pinned_strategy/benchmark_pyrevm_synthetic.json`
contains **synthetic**, not production, evidence:

| Metric                          |   Default | Optimized |
| ------------------------------- | --------: | --------: |
| Evaluated days                  |       500 |       500 |
| Per-asset observations          |     1,487 |     1,487 |
| cross_down_exit matches         |        13 |        33 |
| Executed cross_down_exit        |        12 |        11 |
| Discrete DMA threshold flips    |         0 |         0 |
| Maximum distance absolute error | 8.327e-17 | 8.327e-17 |
| Maximum distance relative error | 8.327e-16 | 8.327e-16 |
| Maximum target per-cell error   | 1.111e-16 | 1.111e-16 |
| Python result changed by shadow |        no |        no |

The 14 existing event histories also run in both touch modes. These normal-case
results do **not** override the following boundary failures.

### Counterexample 1: discrete epsilon flip (acceptance test remains red)

Input allocation `[1e-12, 0.2, 0.3, 0.5-1e-12, 0]`, BTC cross-down, ETH absent:
Python liquidates BTC and ETH (mask **6**); bytecode liquidates only ETH (mask
**4**). Python's binary float `1e-12` converts by the specified floor codec to
**999999** WAD units, below the integer epsilon **1000000**. The first target
normalization discards BTC before liquidation. Python retains it at its float
threshold. The failing regression is
`test_rule_allocation_against_python[allocation1]`.

Changing the constant alone is not a general repair: distinct adjacent floats
around epsilon can map to the same WAD integer. A nondecreasing codec is not an
injective codec. Dataset collision checks are necessary but cannot establish
universal parity. Backend precomputed zone/cross flags would bypass the intended
trust boundary and are not used as a workaround.

### Counterexample 2: distance cancellation

Price `100.00000000000001`, DMA `100.0`:

- Python `price / dma - 1`: `2.220446049250313e-16`.
- WAD divide/subtract: `1.42e-16`.
- Relative error: **0.3604888529133896**, exceeding `1e-15`.

`test_float_relative_distance_limit_is_explicit` records this counterexample.
The historical tests enforce the original `1e-15` bound; it was not relaxed.
Exact DMA observation parity means the DMA subset of `DmaMarketState`; FGI,
ATH and technical fields are outside this slice's ABI and remain Python-owned.

## Mutation results

Each mutant is compiled independently, deployed, and must violate a behavioral
assertion that passes on original bytecode. Source/artifact files are not mutated.

| Mutation                     | Result | Witness                                              |
| ---------------------------- | ------ | ---------------------------------------------------- |
| zone `>` → `>=`              | killed | price equals DMA must be `at`                        |
| cooldown `<=` → `<`          | killed | D+N is still active                                  |
| remove crypto peer exit      | killed | BTC trigger must liquidate held ETH                  |
| remainder assigned to stable | killed | three equal nonstable weights must leave stable zero |
| ignore cross_on_touch        | killed | above → at must not cross when disabled              |

Five of five compiled mutants are killed. The epsilon acceptance failure is
separate from these expected mutant failures.

## Measured performance

500 iterations per method after 20 warmups, static calls, Shanghai on both engines;
py-evm is supplied transiently by titanoboa 0.2.8 (not in the lock). Samples use
three downward-crossing assets. The same artifact and eth-abi codec are used.
Raw reports live beside the artifact as `benchmark_py_evm.json` and
`benchmark_pyrevm_synthetic.json`. Wall times are machine/load-dependent.

| Method          | pyrevm median µs | py-evm median µs | Execution gas (both) |
| --------------- | ---------------: | ---------------: | -------------------: |
| warmup          |          119.917 |          774.792 |                2,088 |
| observe         |          209.646 |        1,985.563 |                6,259 |
| commit          |          166.167 |        1,672.021 |                5,549 |
| cross_down_exit |          142.792 |        3,468.396 |               12,328 |

pyrevm's raw reported gas includes intrinsic transaction/calldata gas; py-evm's
computation gas does not. The benchmark subtracts 21,000 plus calldata byte cost
for comparable execution gas. This distinction is significant for projections.

Full 500-day compare, three-run median:

| Preset    | Python seconds | With validating EVM shadow |  Ratio |
| --------- | -------------: | -------------------------: | -----: |
| Default   |          0.526 |                      0.795 | 1.513× |
| Optimized |          0.478 |                      0.823 | 1.723× |

Shadow timing includes duplicate Python rule evaluation, assertions and encoding,
so it is neither a measured replacement runtime nor a forecast of a complete
six-rule kernel. Production-history end-to-end overhead is still unknown.

Using the requested call-count assumptions, pyrevm adds approximately **5.4–9.4
ms for 45 calls**, or **17.3–30.2 s for 144,000 calls**, depending on the method.
py-evm's corresponding range is 34.9–156.1 ms and 111.6–499.4 s. These are latency
multiplications, not measured suggestion/Optuna runs.

A crude six-rule execution-gas scenario, treating each unknown rule as expensive
as this slice, is `6,259 + 5,549 + 6 × 12,328 = 85,776` gas, plus ABI/dispatch and
transaction overhead. This is **not a bound** or Arbitrum fee quote. Other rules,
full State/Params encoding, early exits and L1 data fees are not measured.

For further local feasibility work, pyrevm is the measured faster choice. Whether
51–72% synthetic shadow overhead is acceptable needs a workload budget and the
real-history run; no blanket acceptability claim is made.

## Corrections and trust boundaries

- The handoff's assertion that `at` never triggers cross_up is false in this
  checkout: `detect_zone_cross` permits below → at when cross_on_touch is true.
  From `at` as the previous zone, neither directional cross is generated.
- DMA cooldown blocks through D+N inclusive and releases on D+N+1. Global rule
  cooldown releases at D+N. Per-symbol DMA durations remain SPY 14/BTC 30/ETH 30;
  the exit rule cooldown is global 30. Missing assets skip observation/commit,
  including expiry processing, exactly as Python does.
- Selected assets may start DMA cooldown even without an eventual fill; only
  actual transfers update the global rule execution date. Empty holdings and
  peer exit are retained rather than redesigned.
- Python currently has execution plugin factory paths distinct from this
  strategy's direct allocation executor. This spike does not wire plugins or
  change quota/pacing behavior. Optimized params are passed through the real
  strategy, rather than assuming only cross_on_touch matters.
- Live reset/warmup and missing persisted state remain outside this work. Pure
  bytecode does not authenticate prior state or market inputs. The supplied
  backend state remains a trust boundary. No production DB saved-config facts
  were re-queried without approval.
- WAD is preferable to coarse BPS for precision, but is **not sufficient** for
  the claimed universal float parity. BPS remains display-only in this design.

## Validation and remaining work

- Reproducible compile check: passed; runtime codehash
  `0xc34735d87c23ebd06260a554d0e5a15f8d6616c16b3d73c296ee29cd837acf50`.
- Focused pytest: **48 passed, 1 failed, 2 skipped**. The failure is the epsilon
  parity counterexample; skips are the two real-history tests awaiting recording.
- Ruff (including new scripts/tests), repository lint and strict mypy: passed.
- dup:check: passed, zero clones. Vulture and service reachability: passed.
- Aggregate Turbo lint/type-check/test: lint and type-check passed; tests finished
  **2,813 passed, 1 failed, 2 skipped** using the local PostgreSQL test backend.
  The only failure is the preserved epsilon counterexample. The separate coverage
  run produced the same test result with **100.00% src coverage**, meeting the
  configured 95% threshold; the overall command still fails on parity.
- Snapshot fast check skipped without DATABASE_READ_ONLY_URL. This is **not**
  successful snapshot verification. Existing snapshot and landing fixture diffs
  are zero.
- Existing production security:audit: failed (two AnyIO 4.12.0 advisories).
  Separate locked export **including dev** plus pip-audit: failed, reporting
  55 advisories across nine packages (some repeated IDs), including
  Vyper 0.4.3 `PYSEC-2023-142` and `PYSEC-2025-33`. These are scanner results,
  not adjudicated exploitability findings. No advisory was suppressed and the
  requested compiler version was not silently changed. Compiler security review
  and dependency remediation are prerequisites for a deployable release.

Commands from `apps/analytics-engine`:

```sh
uv run python scripts/pinned_strategy/compile.py --check
uv run pytest tests/scripts/pinned_strategy -q
uv run python scripts/pinned_strategy/benchmark.py --synthetic
uv run --with titanoboa==0.2.8 python scripts/pinned_strategy/benchmark.py --backend py-evm
# Only after explicit approval, using configured prod read-only secrets:
infisical run --env=prod -- env DATABASE_READ_ONLY=true uv run python scripts/pinned_strategy/record_market_history.py
uv run python scripts/pinned_strategy/benchmark.py
# Audit dev dependencies too (the existing security:audit excludes them):
uv export --locked --no-emit-project --format requirements.txt --no-header --output-file /tmp/pinned-audit.txt
uvx --from pip-audit pip-audit -r /tmp/pinned-audit.txt --disable-pip
```

## Phase 2 recommendations and decisions

Do not start cutover until numeric semantics are resolved and real-history
acceptance completes. Options requiring design review are exact float-emulation
or an explicit versioned fixed-point semantic change; neither is silently added
here. A full kernel needs complete state input/output including per-asset DMA,
rule execution dates, ratio observe-count cooldown, prior FGI/cycle/latch state,
and parameters validated against actual supported production contracts. Audit
the four reported active parameter families before freezing a full Params ABI.

Use chainId + address + runtime codehash + params hash for version identity, while
separately addressing state provenance. The current slice is pure and undeployed.
Vyper's lack of Python float arithmetic, checked uint256 intermediate products,
fixed-width day fields and explicit struct ABI are the principal constraints.

User decisions still required: live-state persistence gap, whether quota should
remain in the complete kernel, and whether a hackathon demo uses a separately
named subset. The five remaining rules, network deployment and demo remain out
of scope.

Compiler/host references: [Vyper compilation](https://docs.vyperlang.org/en/stable/compiling-a-contract.html),
[pyrevm API/source](https://github.com/paradigmxyz/pyrevm).
