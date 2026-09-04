import pytest

from src.services.yield_return_service import YieldReturnService


def test_token_breakdown_separates_price_and_amount_effects() -> None:
    breakdown = YieldReturnService._build_token_breakdown(
        current_amounts={"ETH": {"amount": 2.1, "price": 2_400.0}},
        previous_amounts={"ETH": {"amount": 2.0, "price": 2_300.0}},
    )

    assert len(breakdown) == 1
    token = breakdown[0]
    assert token.amount_change == pytest.approx(0.1)
    assert token.yield_return_usd == pytest.approx(240.0)
    assert token.market_return_usd == pytest.approx(200.0)

    previous_value = 2.0 * 2_300.0
    current_value = 2.1 * 2_400.0
    assert token.yield_return_usd + token.market_return_usd == pytest.approx(
        current_value - previous_value
    )


def test_removed_token_uses_previous_price_without_inventing_market_move() -> None:
    [token] = YieldReturnService._build_token_breakdown(
        current_amounts={},
        previous_amounts={"USDC": {"amount": 100.0, "price": 1.0}},
    )

    assert token.current_price == pytest.approx(1.0)
    assert token.amount_change == pytest.approx(-100.0)
    assert token.yield_return_usd == pytest.approx(-100.0)
    assert token.market_return_usd == pytest.approx(0.0)


@pytest.mark.parametrize(
    ("current_price", "previous_price"),
    [(0.0, 1.0), (1.0, 0.0)],
)
def test_unpriced_side_reports_no_market_effect(
    current_price: float, previous_price: float
) -> None:
    """A zero price means "unknown", so it must not fabricate a market move."""
    [token] = YieldReturnService._build_token_breakdown(
        current_amounts={"WETH": {"amount": 5.0, "price": current_price}},
        previous_amounts={"WETH": {"amount": 5.0, "price": previous_price}},
    )

    assert token.market_return_usd == pytest.approx(0.0)
