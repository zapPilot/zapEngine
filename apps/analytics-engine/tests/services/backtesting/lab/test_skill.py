"""The agent skill must keep describing commands that exist."""

from __future__ import annotations

import re
import shlex
from pathlib import Path

import pytest

from src.services.backtesting.lab import cli

SKILL = Path(__file__).resolve().parents[6] / ".agents/skills/strategy-lab/SKILL.md"


@pytest.fixture(scope="module")
def skill() -> str:
    if not SKILL.is_file():
        pytest.skip("the repository's agent skills are not part of this checkout")
    return SKILL.read_text()


def test_the_skill_declares_what_it_is_for(skill: str) -> None:
    header = skill.split("---")[1]

    assert re.search(r"^name: strategy-lab$", header, re.MULTILINE)
    assert re.search(r"^description: .+", header, re.MULTILINE)


def _commands(skill: str) -> list[list[str]]:
    blocks = re.findall(r"```bash\n(.*?)```", skill, re.DOTALL)
    commands = []
    for block in blocks:
        for line in block.splitlines():
            line = line.split("   #")[0].strip()
            if line.startswith("strategy-lab "):
                commands.append(shlex.split(line)[1:])
    return commands


def test_every_command_the_skill_shows_parses(skill: str) -> None:
    commands = _commands(skill)

    assert len(commands) >= 6
    for argv in commands:
        parsed = cli._parser().parse_args(argv)
        assert parsed.handler is not None, argv


def test_the_skill_names_every_exit_code_the_cli_uses(skill: str) -> None:
    for code in ("0", "1", "2", "3", "4"):
        assert re.search(rf"\b{code} ", skill), code


def test_the_skill_points_at_files_that_exist(skill: str) -> None:
    root = SKILL.parents[3]

    for relative in (
        "apps/analytics-engine/src/services/backtesting/COMMANDS.md",
        "apps/analytics-engine/src/config/strategies/VOCABULARY.md",
        "apps/analytics-engine/src/config/strategies/strategy-spec.schema.json",
    ):
        assert (root / relative).is_file(), relative
