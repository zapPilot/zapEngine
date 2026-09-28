"""Every mutation must compile, execute on EVM, and violate a behavioral assertion."""

import pytest

from scripts.pinned_strategy.codec import EMPTY_STATES, WAD
from scripts.pinned_strategy.compile import SOURCE, compile_source
from scripts.pinned_strategy.evm import SliceEVM

MUTATIONS = [
    ("zone", "if o.price > o.dma:", "if o.price >= o.dma:"),
    ("expiry", "day <= states[i].end_day", "day < states[i].end_day"),
    (
        "peer",
        "result.exit_mask = result.exit_mask | 6",
        "result.exit_mask = result.exit_mask",
    ),
    ("dust", "cleaned[largest] += WAD - assigned", "cleaned[3] += WAD - assigned"),
    ("touch", "(touch and zone == 3)", "(zone == 3)"),
]


def assert_behavior(evm, name):
    if name == "zone":
        result = evm.call("warmup", EMPTY_STATES, [(100 * WAD, 100 * WAD)] * 3)
        assert result[0][0] == 3
    elif name == "expiry":
        result, _ = evm.call(
            "observe", [(2, 2, 130, 1)] * 3, [(110 * WAD, 100 * WAD)] * 3, 130, True
        )
        assert result[0][3] is True
    elif name == "peer":
        views = [
            (0, 0, 0, False, 0, 0, 0),
            (2, 1, 1, False, 0, 0, 0),
            (1, 0, 0, False, 0, 0, 0),
        ]
        result = evm.call("cross_down_exit", views, [0, WAD, 0, 0, 0], 0, 200)
        assert result[4] == 6 and result[6][1] == 0
    elif name == "dust":
        result = evm.call(
            "cross_down_exit", [(0, 0, 0, False, 0, 0, 0)] * 3, [1, 1, 1, 0, 0], 0, 200
        )
        assert result[6][3] == 0
    else:
        result, _ = evm.call(
            "observe", [(1, 1, 0, 0)] * 3, [(100 * WAD, 100 * WAD)] * 3, 200, False
        )
        assert result[0][2] == 0


@pytest.mark.parametrize(("name", "before", "after"), MUTATIONS)
def test_mutation_is_killed(name, before, after):
    assert_behavior(SliceEVM(), name)
    source = SOURCE.read_text()
    assert before in source
    mutant = SliceEVM(compile_source(source.replace(before, after)))
    with pytest.raises(AssertionError):
        assert_behavior(mutant, name)
