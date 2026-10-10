"""Regression guard: the managed PostgreSQL runner must not leak anonymous volumes.

postgres:15-alpine declares ``VOLUME /var/lib/postgresql/data``, so every container
the runner creates owns an anonymous volume. Removing that container without ``-v``
leaves the volume dangling, and the leak fills the Docker VM disk.

The runner skips its main body when sourced, so these tests source it with a
recording ``docker`` function in place. No Docker daemon is involved.
"""

from __future__ import annotations

import os
import shlex
import subprocess
from pathlib import Path

RUNNER = (
    Path(__file__).resolve().parents[2] / "scripts" / "ci" / "run-tests-precommit.sh"
)
REMOVE_MANAGED_WITH_VOLUMES = "rm -f -v analytics-test-postgres"

RECORDING_DOCKER = r"""
docker() {
    printf '%s\n' "$*" >> "$CALLS_FILE"
    if [[ "$1" == run ]]; then
        return "$DOCKER_RUN_STATUS"
    fi
    return 0
}
"""


def _run_runner(tmp_path: Path, body: str, *, docker_run_status: int = 0) -> list[str]:
    calls_file = tmp_path / "docker-calls.txt"
    script = f"{RECORDING_DOCKER}\nsource {shlex.quote(str(RUNNER))}\n{body}\n"
    subprocess.run(
        ["bash", "-c", script],
        check=True,
        capture_output=True,
        text=True,
        env={
            "PATH": os.environ["PATH"],
            "CALLS_FILE": str(calls_file),
            "DOCKER_RUN_STATUS": str(docker_run_status),
        },
    )
    return calls_file.read_text().splitlines() if calls_file.exists() else []


def _removals(calls: list[str]) -> list[str]:
    return [call for call in calls if call.startswith("rm ")]


def test_exit_cleanup_removes_created_container_with_its_anonymous_volume(
    tmp_path: Path,
) -> None:
    calls = _run_runner(tmp_path, "CREATED_NEW_CONTAINER=true\ncleanup_postgres")

    assert _removals(calls) == [REMOVE_MANAGED_WITH_VOLUMES]


def test_exit_cleanup_leaves_reused_container_untouched(tmp_path: Path) -> None:
    calls = _run_runner(tmp_path, "CREATED_NEW_CONTAINER=false\ncleanup_postgres")

    assert _removals(calls) == []


def test_stale_container_replacement_removes_its_anonymous_volume(
    tmp_path: Path,
) -> None:
    calls = _run_runner(tmp_path, "remove_stale_managed_container")

    assert _removals(calls) == [REMOVE_MANAGED_WITH_VOLUMES]


def test_failed_create_removes_partial_container_with_its_anonymous_volume(
    tmp_path: Path,
) -> None:
    body = """
container_running() { return 1; }
container_exists() { return 1; }
start_postgres || true
"""
    calls = _run_runner(tmp_path, body, docker_run_status=1)

    assert any(call.startswith("run ") for call in calls)
    assert _removals(calls) == [REMOVE_MANAGED_WITH_VOLUMES]


def test_reusing_a_publishing_container_makes_no_docker_calls(tmp_path: Path) -> None:
    body = """
container_running() { return 0; }
container_publishes_expected_port() { return 0; }
start_postgres
"""
    calls = _run_runner(tmp_path, body)

    assert calls == []


def test_container_created_by_another_runner_is_never_removed_on_exit(
    tmp_path: Path,
) -> None:
    body = """
CREATED_NEW_CONTAINER=true
container_running() { return 0; }
container_publishes_expected_port() { return 0; }
start_postgres
cleanup_postgres
"""
    calls = _run_runner(tmp_path, body)

    assert _removals(calls) == []


def test_every_managed_container_removal_drops_its_volume() -> None:
    removals = [
        line.strip()
        for line in RUNNER.read_text().splitlines()
        if "docker rm" in line and not line.lstrip().startswith("#")
    ]

    assert removals, "the runner must still remove its managed container"
    assert all(" -v " in line for line in removals), removals


def test_runner_never_prunes_volumes_globally() -> None:
    text = RUNNER.read_text()

    assert "volume prune" not in text
    assert "system prune" not in text
