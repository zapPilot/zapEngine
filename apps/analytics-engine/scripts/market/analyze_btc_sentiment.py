#!/usr/bin/env python3
"""
BTC Price & Sentiment Historical Analysis

Generates dual-axis charts showing BTC price and market sentiment (Fear & Greed Index)
over time. Fetches data from Supabase alpha_raw schema and produces high-resolution
PNG visualizations.

Usage:
    # Fetch all available historical data
    uv run python scripts/market/analyze_btc_sentiment.py

    # Specify custom date range
    uv run python scripts/market/analyze_btc_sentiment.py --start 2024-01-01 --end 2024-12-31

    # Last N days
    uv run python scripts/market/analyze_btc_sentiment.py --days 365

    # Custom output path
    uv run python scripts/market/analyze_btc_sentiment.py --output /path/to/chart.png
"""

import argparse
import sys
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any

# Add src to path for imports
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

import matplotlib.dates as mdates
import matplotlib.pyplot as plt

from src.core.database import db_manager
from src.services.dependencies import get_query_service
from src.services.market.sentiment_database_service import SentimentDatabaseService
from src.services.market.token_price_service import TokenPriceService


def align_data(
    btc_data: list[dict[str, Any]], sentiment_data: list[dict[str, Any]]
) -> tuple[list[date], list[float], list[float]]:
    """
    Align BTC and sentiment data on common dates with min length constraint.

    Creates date-keyed dictionaries from both datasets, finds the intersection
    of common dates, and applies the minimum length constraint as specified
    in requirements.

    Args:
        btc_data: List of dicts with 'snapshot_date' and 'price' keys
        sentiment_data: List of dicts with 'snapshot_date' and 'avg_sentiment' keys

    Returns:
        Tuple of (dates, btc_prices, sentiment_values) sorted chronologically
    """
    # Create date-keyed dictionaries
    btc_dict = {row["snapshot_date"]: float(row["price"]) for row in btc_data}
    sentiment_dict = {
        row["snapshot_date"]: float(row["avg_sentiment"]) for row in sentiment_data
    }

    # Find common dates
    common_dates = set(btc_dict.keys()) & set(sentiment_dict.keys())

    if not common_dates:
        return [], [], []

    # Sort chronologically
    aligned_dates = sorted(common_dates)

    # Extract aligned values
    btc_prices = [btc_dict[d] for d in aligned_dates]
    sentiment_values = [sentiment_dict[d] for d in aligned_dates]

    return aligned_dates, btc_prices, sentiment_values


def create_chart(
    dates: list[date],
    btc_prices: list[float],
    sentiment_values: list[float],
    output_path: str,
) -> None:
    """
    Generate dual-axis chart with matplotlib.

    Creates a high-resolution chart with BTC price on the left axis and
    sentiment on the right axis, with sentiment zone background shading.

    Args:
        dates: List of dates for x-axis
        btc_prices: BTC prices corresponding to dates
        sentiment_values: Sentiment values corresponding to dates
        output_path: Path to save the PNG output
    """
    # Convert dates to datetime objects for matplotlib
    datetime_dates = [datetime.combine(d, datetime.min.time()) for d in dates]

    # Create figure with dual y-axes
    fig, ax1 = plt.subplots(figsize=(14, 7))
    ax2 = ax1.twinx()

    # Plot BTC price on left axis
    line1 = ax1.plot(
        datetime_dates,
        btc_prices,
        color="blue",
        linewidth=2,
        label="BTC Price (USD)",
    )
    ax1.set_xlabel("Date", fontsize=12)
    ax1.set_ylabel("BTC Price (USD)", color="blue", fontsize=12)
    ax1.tick_params(axis="y", labelcolor="blue")
    ax1.grid(True, alpha=0.3)

    # Plot sentiment on right axis
    line2 = ax2.plot(
        datetime_dates,
        sentiment_values,
        color="orange",
        linewidth=2,
        linestyle="--",
        label="Fear & Greed Index",
    )
    ax2.set_ylabel("Sentiment (Fear & Greed Index)", color="orange", fontsize=12)
    ax2.tick_params(axis="y", labelcolor="orange")
    ax2.set_ylim(0, 100)

    # Add sentiment zone backgrounds (axhspan for 5 zones)
    ax2.axhspan(0, 25, facecolor="red", alpha=0.1, label="Extreme Fear")
    ax2.axhspan(25, 45, facecolor="orange", alpha=0.1, label="Fear")
    ax2.axhspan(45, 55, facecolor="yellow", alpha=0.1, label="Neutral")
    ax2.axhspan(55, 75, facecolor="lightgreen", alpha=0.1, label="Greed")
    ax2.axhspan(75, 100, facecolor="green", alpha=0.1, label="Extreme Greed")

    # Format x-axis with monthly ticks and 45° rotation
    ax1.xaxis.set_major_locator(mdates.MonthLocator())
    ax1.xaxis.set_major_formatter(mdates.DateFormatter("%Y-%m-%d"))
    plt.setp(ax1.xaxis.get_majorticklabels(), rotation=45, ha="right")

    # Add title
    plt.title(
        "BTC Price vs Market Sentiment (Fear & Greed Index)",
        fontsize=14,
        fontweight="bold",
        pad=20,
    )

    # Combine legends
    lines = line1 + line2
    labels = [line.get_label() for line in lines]
    ax1.legend(lines, labels, loc="upper left", fontsize=10)

    # Tight layout to prevent label cutoff
    plt.tight_layout()

    # Save as 300 DPI PNG
    plt.savefig(output_path, dpi=300, bbox_inches="tight")
    print(f"✓ Chart saved to: {output_path}")


def main() -> None:
    """CLI entry point for BTC sentiment analysis."""
    parser = argparse.ArgumentParser(
        description="Generate BTC Price & Sentiment historical charts",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Fetch all available data
  python scripts/market/analyze_btc_sentiment.py

  # Last 365 days
  python scripts/market/analyze_btc_sentiment.py --days 365

  # Custom date range
  python scripts/market/analyze_btc_sentiment.py --start 2024-01-01 --end 2024-12-31

  # Custom output path
  python scripts/market/analyze_btc_sentiment.py --output /tmp/btc_chart.png
        """,
    )

    parser.add_argument(
        "--days",
        type=int,
        default=None,
        help="Fetch last N days of data (default: fetch all data)",
    )
    parser.add_argument(
        "--start",
        type=str,
        default=None,
        help="Start date (YYYY-MM-DD, optional)",
    )
    parser.add_argument(
        "--end",
        type=str,
        default=None,
        help="End date (YYYY-MM-DD, optional)",
    )
    parser.add_argument(
        "--output",
        type=str,
        default="btc_sentiment_analysis.png",
        help="Output PNG file path (default: btc_sentiment_analysis.png)",
    )

    args = parser.parse_args()

    # Parse date arguments
    start_date: date | None = None
    end_date: date | None = None

    if args.days:
        end_date = date.today()
        start_date = end_date - timedelta(days=args.days)
    else:
        if args.start:
            start_date = datetime.strptime(args.start, "%Y-%m-%d").date()
        if args.end:
            end_date = datetime.strptime(args.end, "%Y-%m-%d").date()

    # Validate date range
    if start_date and end_date and start_date > end_date:
        print("Error: start_date must be <= end_date")
        sys.exit(1)

    print("=" * 60)
    print("BTC Price & Sentiment Analysis")
    print("=" * 60)
    print(f"Start Date: {start_date or 'All available data'}")
    print(f"End Date:   {end_date or 'All available data'}")
    print(f"Output:     {args.output}")
    print()

    # Initialize database session and services
    print("Fetching data from database...")
    db_manager.init_database()
    db = next(db_manager.get_db())
    query_service = get_query_service()

    try:
        # Initialize services
        sentiment_service = SentimentDatabaseService(db, query_service)
        token_price_service = TokenPriceService(db, query_service)

        # Fetch BTC price history
        print("  - Fetching BTC price history...")
        # Use args.days or default to 3650 (10 years) to satisfy "fetch all data" intent
        fetch_days = args.days if args.days is not None else 3650
        btc_snapshots = token_price_service.get_price_history(
            token_symbol="BTC",
            days=fetch_days,
            start_date=start_date,
            end_date=end_date,
        )
        # Convert TokenPriceSnapshot objects to dict format for align_data
        btc_data = [
            {
                "snapshot_date": datetime.fromisoformat(snap.date).date(),
                "price": snap.price_usd,
            }
            for snap in btc_snapshots
        ]
        print(f"    ✓ Retrieved {len(btc_data)} BTC price records")

        # Sync start_date and end_date from btc_data to ensure sentiment query aligns
        if btc_data:
            computed_start = min(d["snapshot_date"] for d in btc_data)
            computed_end = max(d["snapshot_date"] for d in btc_data)
            if not start_date:
                start_date = computed_start
            if not end_date:
                end_date = computed_end

        # Fetch daily sentiment aggregates
        print("  - Fetching daily sentiment aggregates...")
        sentiment_data = sentiment_service.get_daily_sentiment_aggregates(
            start_date=start_date, end_date=end_date
        )
        print(f"    ✓ Retrieved {len(sentiment_data)} sentiment records")

        # Align data on common dates
        print("\nAligning data on common dates...")
        aligned_dates, btc_prices, sentiment_values = align_data(
            btc_data, sentiment_data
        )

        if not aligned_dates:
            print("Error: No common dates found between BTC and sentiment data")
            sys.exit(1)

        print(f"  ✓ Aligned {len(aligned_dates)} data points")

        # Generate chart
        print("\nGenerating chart...")
        create_chart(aligned_dates, btc_prices, sentiment_values, args.output)

        # Print summary statistics
        print("\n" + "=" * 60)
        print("Summary Statistics")
        print("=" * 60)
        print(f"Date Range:        {aligned_dates[0]} to {aligned_dates[-1]}")
        print(f"Total Data Points: {len(aligned_dates)}")
        print(f"BTC Price Range:   ${min(btc_prices):,.2f} - ${max(btc_prices):,.2f}")
        print(
            f"Sentiment Range:   {min(sentiment_values):.1f} - {max(sentiment_values):.1f}"
        )
        print(f"Avg BTC Price:     ${sum(btc_prices) / len(btc_prices):,.2f}")
        print(f"Avg Sentiment:     {sum(sentiment_values) / len(sentiment_values):.1f}")
        print("=" * 60)

    except Exception as error:
        print(f"\nError: {error}")
        import traceback

        traceback.print_exc()
        sys.exit(1)
    finally:
        db.close()


if __name__ == "__main__":
    main()
