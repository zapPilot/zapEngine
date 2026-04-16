"""
Updated tests for PoolPerformanceAggregator after APR removal.

Focus areas:
- Parsing and normalization of required fields
- Aggregation of asset values and contribution percentages
- Snapshot ID handling across wallets
- Verification that deprecated APR-related fields are absent in outputs
"""

from uuid import uuid4

import pytest

from src.services.aggregators.pool_performance_aggregator import (
    AggregatedPoolPosition,
    PoolPerformanceAggregator,
    PoolPositionData,
)


def create_position_row(
    *,
    protocol_id: str = "aave-v3",
    protocol_name: str = "Aave V3",
    chain: str = "ethereum",
    wallet: str = "0xabc",
    asset_usd_value: float = 1000.0,
    contribution_to_portfolio: float = 10.0,
    pool_symbols: list[str] | None = None,
    snapshot_id: str | None = None,
    snapshot_ids: list[str] | None = None,
) -> dict[str, object]:
    if pool_symbols is None:
        pool_symbols = ["USDC", "WETH"]
    if snapshot_id is None:
        snapshot_id = str(uuid4())

    row: dict[str, object] = {
        "protocol_id": protocol_id,
        "protocol_name": protocol_name,
        "chain": chain,
        "wallet": wallet,
        "asset_usd_value": asset_usd_value,
        "contribution_to_portfolio": contribution_to_portfolio,
        "pool_symbols": pool_symbols,
        "snapshot_id": snapshot_id,
    }

    if snapshot_ids is not None:
        row["snapshot_ids"] = snapshot_ids

    return row


class TestParsing:
    def test_parse_position_normalizes_required_fields(self):
        snapshot_id = uuid4()
        snapshot_ids = [uuid4(), uuid4()]
        row = create_position_row(
            protocol_id="compound-v3",
            protocol_name="Compound V3",
            chain="polygon",
            wallet="0x123",
            asset_usd_value=7500.5,
            contribution_to_portfolio=62.5,
            pool_symbols=["DAI", "USDC"],
            snapshot_id=str(snapshot_id),
            snapshot_ids=[str(sid) for sid in snapshot_ids],
        )

        position = PoolPerformanceAggregator.parse_position(row)

        assert isinstance(position, PoolPositionData)
        assert position.protocol_id == "compound-v3"
        assert position.protocol_name == "Compound V3"
        assert position.chain == "polygon"
        assert position.wallet == "0x123"
        assert position.asset_usd_value == 7500.5
        assert position.contribution_to_portfolio == 62.5
        assert position.pool_symbols == ["DAI", "USDC"]
        assert position.snapshot_id == str(snapshot_id)
        assert position.snapshot_ids == [str(sid) for sid in snapshot_ids]

    def test_parse_position_defaults_missing_contribution(self):
        row = create_position_row()
        row.pop("contribution_to_portfolio")

        position = PoolPerformanceAggregator.parse_position(row)

        assert position.contribution_to_portfolio == 0.0

    def test_parse_position_missing_required_field_raises(self):
        row = create_position_row()
        row.pop("protocol_id")

        with pytest.raises(KeyError):
            PoolPerformanceAggregator.parse_position(row)


class TestAggregation:
    def test_aggregate_positions_sums_values_and_contributions(self):
        snapshot_ids = [str(uuid4()), str(uuid4())]
        rows = [
            create_position_row(
                wallet="0x111",
                asset_usd_value=1000.0,
                contribution_to_portfolio=10.0,
                snapshot_id=snapshot_ids[0],
                snapshot_ids=snapshot_ids,
            ),
            create_position_row(
                wallet="0x222",
                asset_usd_value=2000.0,
                contribution_to_portfolio=20.0,
                snapshot_id=snapshot_ids[1],
                snapshot_ids=snapshot_ids,
            ),
        ]

        aggregated = PoolPerformanceAggregator.aggregate_positions(rows)

        assert len(aggregated) == 1
        pool = aggregated[0]
        assert pool["asset_usd_value"] == 3000.0
        assert pool["contribution_to_portfolio"] == 30.0
        assert pool["snapshot_id"] == snapshot_ids[0]
        assert pool["snapshot_ids"] == snapshot_ids

    def test_aggregate_positions_keeps_distinct_pools(self):
        rows = [
            create_position_row(protocol_id="aave-v3", pool_symbols=["USDC", "DAI"]),
            create_position_row(protocol_id="curve", pool_symbols=["USDC", "DAI"]),
        ]

        aggregated = PoolPerformanceAggregator.aggregate_positions(rows)

        protocols = {pool["protocol"] for pool in aggregated}
        assert protocols == {"aave-v3", "curve"}
        assert len(aggregated) == 2

    def test_deprecated_apr_fields_not_in_output(self):
        rows = [create_position_row()]

        aggregated = PoolPerformanceAggregator.aggregate_positions(rows)

        pool = aggregated[0]
        assert "final_apr" not in pool or pool.get("final_apr") is None
        assert "protocol_matched" not in pool or pool.get("protocol_matched") is None
        assert "apr_data" not in pool or pool.get("apr_data") is None


class TestAggregatedPoolPosition:
    def test_to_dict_omits_deprecated_fields(self):
        agg = AggregatedPoolPosition(
            protocol_id="aave-v3",
            protocol_name="Aave V3",
            chain="ethereum",
            pool_symbols_key=("USDC", "WETH"),
        )

        # Simulate add_position with minimal data
        agg.wallets.append("0xabc")
        agg.primary_wallet = "0xabc"
        agg.asset_usd_value = 1500.0
        agg.contribution_to_portfolio = 15.0
        agg.snapshot_id = "snap-1"
        agg.snapshot_ids = ["snap-1", "snap-2"]
        agg.snapshot_ids_present = True

        result = agg.to_dict()

        assert result["protocol_id"] == "aave-v3"
        assert result["asset_usd_value"] == 1500.0
        assert result["snapshot_ids"] == ["snap-1", "snap-2"]
        assert "final_apr" not in result
        assert "protocol_matched" not in result
        assert "apr_data" not in result
