"""``liveness``, ``sweep``, ``holdout`` and ``ledger``: the commands that guard a search."""

from __future__ import annotations

import argparse
import json
from datetime import timedelta
from pathlib import Path
from typing import Any

from src.services.backtesting.lab import evaluation_commands
from src.services.backtesting.lab.bundle import Bundle, BundleError, load_bundle
from src.services.backtesting.lab.envelope import (
    EXIT_DATA,
    EXIT_GATE,
    EXIT_HOLDOUT,
    EXIT_NOT_APPLICABLE,
    CliError,
    Context,
    Outcome,
    bundle_failure,
    load_bundle_or_fail,
    load_spec_or_fail,
)
from src.services.backtesting.lab.evaluate import STRATEGY_KEY, evaluate
from src.services.backtesting.lab.holdout import (
    HoldoutAlreadyLooked,
    HoldoutError,
    HoldoutExists,
    HoldoutNeedsNewData,
    HoldoutNotFound,
    check_lineage,
    consume_look,
    init_pin,
    read_pin,
)
from src.services.backtesting.lab.ledger import Ledger, LedgerCorruptError
from src.services.backtesting.lab.liveness import DEAD, NoDaysError, liveness
from src.services.backtesting.lab.report import hash_of, normalize
from src.services.backtesting.lab.sweep import (
    INSUFFICIENT,
    SpaceError,
    SweepConfig,
    load_space,
    sweep,
)
from src.services.backtesting.spec import behavior_hash, spec_ref

DEFAULT_STRESS = tuple(f"synthetic:stress?seed={seed}&days=300" for seed in range(1, 7))
REFERENCE_REF = "reference/dma_fgi"
SPEC_HELP = evaluation_commands.SPEC_HELP
BUNDLE_HELP = evaluation_commands.BUNDLE_HELP


def add_commands(commands: Any) -> None:
    live = commands.add_parser(
        "liveness",
        help="Which tunable parameters actually change a decision (dead ones exit 1).",
    )
    live.add_argument("--spec", required=True, help=SPEC_HELP)
    live.add_argument(
        "--bundle",
        action="append",
        required=True,
        help="A primary history; repeat for several. " + BUNDLE_HELP,
    )
    live.add_argument(
        "--stress",
        action="append",
        help="A history where rare conditions occur (default: six synthetic stress seeds).",
    )
    live.add_argument(
        "--only",
        action="append",
        help="Only probe parameters whose pointer starts with this; repeatable.",
    )
    evaluation_commands.add_evaluation_options(live)
    live.set_defaults(handler=liveness_command, command_path=["liveness"])

    sweeping = commands.add_parser(
        "sweep",
        help="Search a parameter space with walk-forward folds and a deflated Sharpe.",
    )
    sweeping.add_argument("--spec", required=True, help=SPEC_HELP)
    sweeping.add_argument("--bundle", required=True, help=BUNDLE_HELP)
    sweeping.add_argument(
        "--space", required=True, help="A JSON file of parameters and sampling."
    )
    sweeping.add_argument(
        "--reference",
        help="Judge the folds against this spec instead of --spec itself "
        "(promotion judges against the production reference). " + SPEC_HELP,
    )
    evaluation_commands.add_assumption_options(sweeping)
    sweeping.set_defaults(handler=sweep_command, command_path=["sweep"])

    holdout = commands.add_parser(
        "holdout", help="Pin a lineage's holdout and take its single look."
    ).add_subparsers(dest="holdout_command", required=True)
    init = holdout.add_parser("init", help="Pin the data as it is now.")
    init.add_argument("--lineage", required=True)
    init.add_argument("--bundle", required=True, help=BUNDLE_HELP)
    init.set_defaults(handler=holdout_init_command, command_path=["holdout", "init"])
    status = holdout.add_parser("status", help="Is the lineage's look allowed yet?")
    status.add_argument("--lineage", required=True)
    status.add_argument(
        "--bundle", help="Newer data (default: the pinned bundle's latest)."
    )
    status.set_defaults(
        handler=holdout_status_command, command_path=["holdout", "status"]
    )
    look = holdout.add_parser(
        "look", help="Evaluate a candidate on the new data, once."
    )
    look.add_argument("--lineage", required=True)
    look.add_argument("--spec", required=True, help=SPEC_HELP)
    look.add_argument("--bundle", required=True, help=BUNDLE_HELP)
    look.add_argument(
        "--reference", default=REFERENCE_REF, help="The spec to compare against."
    )
    evaluation_commands.add_evaluation_options(look)
    look.set_defaults(handler=holdout_look_command, command_path=["holdout", "look"])

    ledger = commands.add_parser(
        "ledger", help="Every evaluation the lab has made."
    ).add_subparsers(dest="ledger_command", required=True)
    summary = ledger.add_parser("summary", help="How many things have been tried.")
    summary.set_defaults(
        handler=ledger_summary_command, command_path=["ledger", "summary"]
    )
    show = ledger.add_parser("show", help="The latest entries.")
    show.add_argument("--limit", type=int, default=20)
    show.add_argument("--kind")
    show.set_defaults(handler=ledger_show_command, command_path=["ledger", "show"])


def _bundle_entry(bundle: Bundle) -> dict[str, Any]:
    manifest = bundle.manifest
    return {
        "ref": f"{manifest.name}:{manifest.bundle_id}",
        "content_sha256": manifest.content_sha256,
    }


def _last_day(bundle: Bundle) -> Any:
    return max(row["date"] for row in bundle.prices)


def liveness_command(args: argparse.Namespace, context: Context) -> Outcome:
    _, spec = load_spec_or_fail(args.spec, context)
    primary = {ref: load_bundle_or_fail(ref, context) for ref in args.bundle}
    stress = {
        ref: load_bundle_or_fail(ref, context)
        for ref in (args.stress or DEFAULT_STRESS)
        if ref not in primary
    }
    config = evaluation_commands.eval_config(args)
    try:
        report = liveness(
            spec, {**primary, **stress}, set(primary), config, only=args.only
        )
    except NoDaysError as error:
        raise CliError(EXIT_DATA, "no_days_in_window", str(error)) from error
    body = {
        "spec": {"ref": spec_ref(spec), "behavior_hash": behavior_hash(spec)},
        **report.as_dict(),
    }
    run_hash = hash_of(normalize(body)).split(":")[1][:16]
    run_dir = context.runs_dir / f"liveness-{run_hash}"
    run_dir.mkdir(parents=True, exist_ok=True)
    path = run_dir / "liveness.json"
    path.write_text(json.dumps(normalize(body), indent=2, sort_keys=True) + "\n")
    Ledger(context.ledger_path).append(
        "liveness",
        spec=body["spec"],
        bundles=list(report.bundles),
        summary=report.counts,
    )
    dead = [leaf.pointer for leaf in report.leaves if leaf.status == DEAD]
    return Outcome(
        normalize(body),
        artifacts=[str(path)],
        warnings=[f"Dead parameter: {pointer}" for pointer in dead],
        exit_code=EXIT_GATE if dead else 0,
    )


def sweep_command(args: argparse.Namespace, context: Context) -> Outcome:
    _, spec = load_spec_or_fail(args.spec, context)
    reference = (
        None
        if args.reference is None
        else load_spec_or_fail(args.reference, context)[1]
    )
    bundle = load_bundle_or_fail(args.bundle, context)
    config = SweepConfig(
        assumptions=evaluation_commands.assumptions_of(args),
        **evaluation_commands.capital_settings(args),
    )
    try:
        result = sweep(
            spec,
            bundle,
            load_space(Path(args.space)),
            config,
            ledger=Ledger(context.ledger_path),
            reference=reference,
        )
    except SpaceError as error:
        raise CliError(
            EXIT_NOT_APPLICABLE, "invalid_search_space", str(error)
        ) from error
    run_dir = context.runs_dir / f"sweep-{result['sweep_id']}"
    run_dir.mkdir(parents=True, exist_ok=True)
    path = run_dir / "sweep.json"
    path.write_text(json.dumps(result, indent=2, sort_keys=True) + "\n")
    insufficient = result["status"] == INSUFFICIENT
    return Outcome(
        result,
        artifacts=[str(path)],
        warnings=result.get("reasons", []) if insufficient else result["warnings"],
        exit_code=EXIT_DATA if insufficient else 0,
    )


def _holdout_failure(error: HoldoutError) -> CliError:
    if isinstance(error, HoldoutExists):
        return CliError(EXIT_GATE, "holdout_exists", str(error))
    if isinstance(error, HoldoutNotFound):
        return CliError(EXIT_HOLDOUT, "holdout_not_initialized", str(error))
    if isinstance(error, HoldoutAlreadyLooked):
        return CliError(EXIT_HOLDOUT, "holdout_already_looked", str(error))
    assert isinstance(error, HoldoutNeedsNewData)
    return CliError(EXIT_HOLDOUT, "holdout_needs_new_data", str(error))


def _lineage(args: argparse.Namespace) -> str:
    try:
        return check_lineage(args.lineage)
    except ValueError as error:
        raise CliError(EXIT_NOT_APPLICABLE, "invalid_lineage", str(error)) from error


def holdout_init_command(args: argparse.Namespace, context: Context) -> Outcome:
    lineage = _lineage(args)
    bundle = load_bundle_or_fail(args.bundle, context)
    last = _last_day(bundle)
    try:
        pin = init_pin(
            context.holdouts_dir,
            lineage,
            pin_date=last,
            bundle={**_bundle_entry(bundle), "name": bundle.manifest.name},
        )
    except HoldoutError as error:
        raise _holdout_failure(error) from error
    Ledger(context.ledger_path).append(
        "holdout_init", lineage=lineage, pin_date=last.isoformat(), bundle=pin.bundle
    )
    return Outcome(
        pin.status(last),
        artifacts=[str(context.holdouts_dir / f"{lineage}.json")],
    )


def holdout_status_command(args: argparse.Namespace, context: Context) -> Outcome:
    lineage = _lineage(args)
    try:
        pin = read_pin(context.holdouts_dir, lineage)
    except HoldoutError as error:
        raise _holdout_failure(error) from error
    data_end = None
    try:
        bundle = load_bundle(
            args.bundle or f"{pin.bundle['name']}:latest", context.bundles_dir
        )
    except BundleError as error:
        if args.bundle:
            raise bundle_failure(error) from error
    else:
        data_end = _last_day(bundle)
    return Outcome(pin.status(data_end))


def holdout_look_command(args: argparse.Namespace, context: Context) -> Outcome:
    lineage = _lineage(args)
    _, spec = load_spec_or_fail(args.spec, context)
    _, reference = load_spec_or_fail(args.reference, context)
    bundle = load_bundle_or_fail(args.bundle, context)
    try:
        pin = read_pin(context.holdouts_dir, lineage)
        data_end = _last_day(bundle)
        # The look is spent before anything is computed: a failure after this
        # point does not give it back.
        consume_look(
            context.holdouts_dir,
            pin,
            data_end=data_end,
            record={
                "spec": {"ref": spec_ref(spec), "behavior_hash": behavior_hash(spec)},
                "bundle": _bundle_entry(bundle),
                "window_start": (pin.pin_date + timedelta(days=1)).isoformat(),
                "window_end": data_end.isoformat(),
            },
        )
    except HoldoutError as error:
        raise _holdout_failure(error) from error
    config = evaluation_commands.eval_config(
        args,
        leave_one_out=False,
        benchmarks=(),
        start=pin.pin_date + timedelta(days=1),
    )
    candidate = evaluate(spec, bundle, config)
    baseline = evaluate(reference, bundle, config)
    own = candidate.body["strategies"][STRATEGY_KEY]
    other = baseline.body["strategies"][STRATEGY_KEY]
    result = {
        "lineage": lineage,
        "pin_date": pin.pin_date.isoformat(),
        "bundle": {**_bundle_entry(bundle), "source": bundle.manifest.source},
        "assumptions": candidate.body["assumptions"],
        "total_capital": candidate.body["total_capital"],
        "window": candidate.body["window"],
        "candidate": {**candidate.body["fingerprint"]["spec"], **own},
        "reference": {**baseline.body["fingerprint"]["spec"], **other},
        "edge": {
            "roi_pp": own["roi_percent"] - other["roi_percent"],
            "max_drawdown_pp": own["max_drawdown_percent"]
            - other["max_drawdown_percent"],
            "sharpe": own["sharpe_ratio"] - other["sharpe_ratio"],
        },
        "report_hashes": {
            "candidate": candidate.report_hash,
            "reference": baseline.report_hash,
        },
        "invariants": candidate.body["invariants"],
        "warnings": candidate.body["warnings"],
        "note": (
            "This was the lineage's only look. Whether the edge is enough is a "
            "promotion decision, not this command's."
        ),
    }
    Ledger(context.ledger_path).append(
        "holdout_look",
        lineage=lineage,
        spec={"ref": spec_ref(spec), "behavior_hash": behavior_hash(spec)},
        bundle=_bundle_entry(bundle),
        report_hash=candidate.report_hash,
    )
    # The only copy of the look's numbers: a promotion reads them from here.
    path = context.holdouts_dir / f"{lineage}.look.json"
    path.write_text(json.dumps(normalize(result), indent=2, sort_keys=True) + "\n")
    return Outcome(
        dict(normalize(result)),
        artifacts=[str(path)],
        warnings=candidate.body["warnings"],
    )


def _ledger(context: Context) -> Ledger:
    return Ledger(context.ledger_path)


def ledger_summary_command(args: argparse.Namespace, context: Context) -> Outcome:
    del args
    try:
        return Outcome(_ledger(context).summary())
    except LedgerCorruptError as error:
        raise CliError(EXIT_DATA, "ledger_corrupt", str(error)) from error


def ledger_show_command(args: argparse.Namespace, context: Context) -> Outcome:
    try:
        entries = _ledger(context).entries(args.kind)
    except LedgerCorruptError as error:
        raise CliError(EXIT_DATA, "ledger_corrupt", str(error)) from error
    return Outcome(
        {
            "total": len(entries),
            "entries": entries[-max(args.limit, 0) :] if args.limit else [],
        }
    )


__all__ = ["DEFAULT_STRESS", "add_commands"]
