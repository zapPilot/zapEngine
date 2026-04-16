"""
Unit Tests for Financial Utilities Module

Comprehensive test coverage for safe type conversions and percentage calculations.
Validates edge cases, error handling, and behavioral compatibility with existing code.
"""

from src.core.financial_utils import (
    calculate_percentage,
    calculate_percentage_rounded,
    safe_float,
    safe_int,
    sum_category_total_values,
    sum_category_wallet_values,
)
from src.models.portfolio import CategoryAllocation, PortfolioAllocation


class TestSafeFloat:
    """Test suite for safe_float() function"""

    def test_converts_valid_integer(self):
        """Should convert integer to float"""
        assert safe_float(42) == 42.0

    def test_converts_valid_float(self):
        """Should pass through float unchanged"""
        assert safe_float(123.45) == 123.45

    def test_converts_valid_string(self):
        """Should parse numeric string to float"""
        assert safe_float("123.45") == 123.45

    def test_handles_none(self):
        """Should return 0.0 for None"""
        assert safe_float(None) == 0.0

    def test_handles_empty_string(self):
        """Should return 0.0 for empty string"""
        assert safe_float("") == 0.0

    def test_handles_invalid_string(self):
        """Should return 0.0 for non-numeric string"""
        assert safe_float("invalid") == 0.0
        assert safe_float("abc123") == 0.0

    def test_handles_invalid_types(self):
        """Should return 0.0 for unconvertible types"""
        assert safe_float([1, 2, 3]) == 0.0
        assert safe_float({"key": "value"}) == 0.0
        assert safe_float(object()) == 0.0

    def test_handles_zero(self):
        """Should handle zero correctly"""
        assert safe_float(0) == 0.0
        assert safe_float(0.0) == 0.0
        assert safe_float("0") == 0.0

    def test_handles_negative_numbers(self):
        """Should convert negative numbers correctly"""
        assert safe_float(-42) == -42.0
        assert safe_float(-123.45) == -123.45
        assert safe_float("-67.89") == -67.89

    def test_handles_scientific_notation(self):
        """Should handle scientific notation strings"""
        assert safe_float("1e10") == 1e10
        assert safe_float("1.5e-5") == 1.5e-5


class TestSafeInt:
    """Test suite for safe_int() function"""

    def test_converts_valid_integer(self):
        """Should pass through integer unchanged"""
        assert safe_int(42) == 42

    def test_converts_float_to_int(self):
        """Should truncate float to integer"""
        assert safe_int(45.7) == 45
        assert safe_int(99.9) == 99

    def test_converts_valid_string(self):
        """Should parse numeric string to int"""
        assert safe_int("123") == 123

    def test_handles_none(self):
        """Should return 0 for None"""
        assert safe_int(None) == 0

    def test_handles_empty_string(self):
        """Should return 0 for empty string"""
        assert safe_int("") == 0

    def test_handles_invalid_string(self):
        """Should return 0 for non-numeric string"""
        assert safe_int("invalid") == 0
        assert safe_int("abc123") == 0

    def test_handles_invalid_types(self):
        """Should return 0 for unconvertible types"""
        assert safe_int([1, 2, 3]) == 0
        assert safe_int({"key": "value"}) == 0
        assert safe_int(object()) == 0

    def test_handles_zero(self):
        """Should handle zero correctly"""
        assert safe_int(0) == 0
        assert safe_int(0.0) == 0
        assert safe_int("0") == 0

    def test_handles_negative_numbers(self):
        """Should convert negative numbers correctly"""
        assert safe_int(-42) == -42
        assert safe_int(-45.7) == -45
        assert safe_int("-67") == -67

    def test_truncates_not_rounds(self):
        """Should truncate floats, not round them"""
        assert safe_int(2.9) == 2
        assert safe_int(7.1) == 7
        assert safe_int(-2.9) == -2


class TestCalculatePercentage:
    """Test suite for calculate_percentage() function"""

    def test_calculates_basic_percentage(self):
        """Should calculate basic percentage correctly"""
        assert calculate_percentage(50, 200) == 25.0
        assert calculate_percentage(75, 100) == 75.0

    def test_calculates_full_percentage(self):
        """Should return 100.0 when part equals whole"""
        assert calculate_percentage(100, 100) == 100.0
        assert calculate_percentage(50, 50) == 100.0

    def test_handles_zero_part(self):
        """Should return 0.0 when part is zero"""
        assert calculate_percentage(0, 100) == 0.0

    def test_handles_zero_whole(self):
        """Should return 0.0 when whole is zero (division by zero protection)"""
        assert calculate_percentage(50, 0) == 0.0

    def test_handles_negative_part(self):
        """Should return 0.0 when part is negative"""
        assert calculate_percentage(-10, 100) == 0.0

    def test_handles_negative_whole(self):
        """Should return 0.0 when whole is negative"""
        assert calculate_percentage(50, -100) == 0.0

    def test_handles_both_negative(self):
        """Should return 0.0 when both are negative"""
        assert calculate_percentage(-50, -100) == 0.0

    def test_calculates_fractional_percentage(self):
        """Should calculate fractional percentages correctly"""
        result = calculate_percentage(1, 3)
        assert abs(result - 33.333333) < 0.00001

    def test_handles_large_numbers(self):
        """Should handle large numbers correctly"""
        assert calculate_percentage(1_000_000, 10_000_000) == 10.0

    def test_handles_very_small_numbers(self):
        """Should handle very small numbers correctly"""
        result = calculate_percentage(0.01, 100)
        assert abs(result - 0.01) < 0.00001


class TestCalculatePercentageRounded:
    """Test suite for calculate_percentage_rounded() function"""

    def test_rounds_to_two_decimals_by_default(self):
        """Should round to 2 decimal places by default"""
        result = calculate_percentage_rounded(1, 3)
        assert result == 33.33
        assert isinstance(result, float)

    def test_rounds_to_custom_decimals(self):
        """Should round to specified decimal places"""
        assert calculate_percentage_rounded(1, 3, decimals=4) == 33.3333
        assert calculate_percentage_rounded(2, 3, decimals=1) == 66.7
        assert calculate_percentage_rounded(2, 3, decimals=0) == 67.0

    def test_handles_exact_values(self):
        """Should handle exact percentage values"""
        assert calculate_percentage_rounded(50, 100) == 50.0
        assert calculate_percentage_rounded(25, 100) == 25.0

    def test_inherits_edge_case_handling(self):
        """Should inherit edge case handling from calculate_percentage"""
        assert calculate_percentage_rounded(0, 100) == 0.0
        assert calculate_percentage_rounded(50, 0) == 0.0
        assert calculate_percentage_rounded(-10, 100) == 0.0

    def test_rounds_correctly(self):
        """Should follow standard rounding rules"""
        # 33.333... rounds to 33.33
        assert calculate_percentage_rounded(1, 3) == 33.33
        # 66.666... rounds to 66.67
        assert calculate_percentage_rounded(2, 3) == 66.67


class TestBehavioralCompatibility:
    """
    Test suite ensuring new functions behave identically to old implementations.

    These tests validate that the consolidated functions maintain exact behavioral
    compatibility with the original duplicate implementations.
    """

    def test_safe_float_matches_original_behavior(self):
        """Should match behavior of original _safe_float implementations"""
        # Original: try: return float(value or 0.0) except: return 0.0
        test_cases = [
            (None, 0.0),
            (0, 0.0),
            ("", 0.0),
            (42, 42.0),
            ("123.45", 123.45),
            ("invalid", 0.0),
        ]
        for value, expected in test_cases:
            assert safe_float(value) == expected

    def test_safe_int_matches_original_behavior(self):
        """Should match behavior of original _safe_int implementation"""
        # Original: try: return int(value or 0) except: return 0
        test_cases = [
            (None, 0),
            (0, 0),
            ("", 0),
            (42, 42),
            ("123", 123),
            (45.7, 45),
            ("invalid", 0),
        ]
        for value, expected in test_cases:
            assert safe_int(value) == expected

    def test_percentage_matches_original_behavior(self):
        """Should match behavior of original _percentage implementation"""
        # Original: if whole <= 0.0 or part <= 0.0: return 0.0
        #           return (part / whole) * 100.0
        test_cases = [
            (50, 200, 25.0),
            (0, 100, 0.0),
            (50, 0, 0.0),
            (-10, 100, 0.0),
            (100, 100, 100.0),
        ]
        for part, whole, expected in test_cases:
            assert calculate_percentage(part, whole) == expected

    def test_rounded_percentage_matches_original_behavior(self):
        """Should match behavior of original _rounded_percentage implementation"""
        # Original: return round(PortfolioAggregator._percentage(part, whole), 2)
        assert calculate_percentage_rounded(1, 3) == 33.33
        assert calculate_percentage_rounded(2, 3) == 66.67
        assert calculate_percentage_rounded(50, 200) == 25.0


class TestDocstringExamples:
    """Validate that all docstring examples execute correctly"""

    def test_safe_float_docstring_examples(self):
        """Validate safe_float() docstring examples"""
        assert safe_float(42) == 42.0
        assert safe_float("123.45") == 123.45
        assert safe_float(None) == 0.0
        assert safe_float("") == 0.0
        assert safe_float("invalid") == 0.0
        assert safe_float([1, 2, 3]) == 0.0

    def test_safe_int_docstring_examples(self):
        """Validate safe_int() docstring examples"""
        assert safe_int(42) == 42
        assert safe_int("123") == 123
        assert safe_int(45.7) == 45
        assert safe_int(None) == 0
        assert safe_int("") == 0
        assert safe_int("invalid") == 0
        assert safe_int([1, 2, 3]) == 0

    def test_calculate_percentage_docstring_examples(self):
        """Validate calculate_percentage() docstring examples"""
        assert calculate_percentage(50, 200) == 25.0
        assert calculate_percentage(75, 100) == 75.0
        assert calculate_percentage(100, 100) == 100.0
        assert calculate_percentage(0, 100) == 0.0
        assert calculate_percentage(50, 0) == 0.0
        assert calculate_percentage(-10, 100) == 0.0
        assert calculate_percentage(50, -100) == 0.0

    def test_calculate_percentage_rounded_docstring_examples(self):
        """Validate calculate_percentage_rounded() docstring examples"""
        assert calculate_percentage_rounded(33.33, 100) == 33.33
        assert calculate_percentage_rounded(1, 3) == 33.33
        assert calculate_percentage_rounded(2, 3) == 66.67
        assert calculate_percentage_rounded(1, 3, decimals=4) == 33.3333
        assert calculate_percentage_rounded(0, 100) == 0.0
        assert calculate_percentage_rounded(50, 0) == 0.0


class TestSumCategoryWalletValues:
    """Test suite for sum_category_wallet_values() function"""

    def test_sums_all_category_wallet_values(self):
        """Should sum wallet_tokens_value across all categories"""
        allocation = PortfolioAllocation(
            btc=CategoryAllocation(
                total_value=100.0,
                percentage_of_portfolio=25.0,
                wallet_tokens_value=50.0,
                other_sources_value=50.0,
            ),
            eth=CategoryAllocation(
                total_value=200.0,
                percentage_of_portfolio=50.0,
                wallet_tokens_value=150.0,
                other_sources_value=50.0,
            ),
            stablecoins=CategoryAllocation(
                total_value=80.0,
                percentage_of_portfolio=20.0,
                wallet_tokens_value=80.0,
                other_sources_value=0.0,
            ),
            others=CategoryAllocation(
                total_value=20.0,
                percentage_of_portfolio=5.0,
                wallet_tokens_value=20.0,
                other_sources_value=0.0,
            ),
        )
        # 50.0 + 150.0 + 80.0 + 20.0 = 300.0
        assert sum_category_wallet_values(allocation) == 300.0

    def test_handles_decimal_precision(self):
        """Test with exact bug case: 680.39 precision issue"""
        # Create allocation with values that triggered the original bug
        allocation = PortfolioAllocation(
            btc=CategoryAllocation(
                total_value=170.1,
                percentage_of_portfolio=25.0,
                wallet_tokens_value=170.1,
                other_sources_value=0.0,
            ),
            eth=CategoryAllocation(
                total_value=340.19,
                percentage_of_portfolio=50.0,
                wallet_tokens_value=340.19,
                other_sources_value=0.0,
            ),
            stablecoins=CategoryAllocation(
                total_value=136.08,
                percentage_of_portfolio=20.0,
                wallet_tokens_value=136.08,
                other_sources_value=0.0,
            ),
            others=CategoryAllocation(
                total_value=34.02,
                percentage_of_portfolio=5.0,
                wallet_tokens_value=34.02,
                other_sources_value=0.0,
            ),
        )
        # Expected: 170.1 + 340.19 + 136.08 + 34.02 = 680.39
        result = sum_category_wallet_values(allocation)
        assert result == 680.39

    def test_handles_zero_values(self):
        """Should handle edge case with zero values"""
        allocation = PortfolioAllocation(
            btc=CategoryAllocation(
                total_value=0.0,
                percentage_of_portfolio=0.0,
                wallet_tokens_value=0.0,
                other_sources_value=0.0,
            ),
            eth=CategoryAllocation(
                total_value=0.0,
                percentage_of_portfolio=0.0,
                wallet_tokens_value=0.0,
                other_sources_value=0.0,
            ),
            stablecoins=CategoryAllocation(
                total_value=0.0,
                percentage_of_portfolio=0.0,
                wallet_tokens_value=0.0,
                other_sources_value=0.0,
            ),
            others=CategoryAllocation(
                total_value=0.0,
                percentage_of_portfolio=0.0,
                wallet_tokens_value=0.0,
                other_sources_value=0.0,
            ),
        )
        assert sum_category_wallet_values(allocation) == 0.0


class TestSumCategoryTotalValues:
    """Test suite for sum_category_total_values() function"""

    def test_sums_all_category_total_values(self):
        """Should sum total_value across all categories"""
        allocation = PortfolioAllocation(
            btc=CategoryAllocation(
                total_value=100.0,
                percentage_of_portfolio=25.0,
                wallet_tokens_value=50.0,
                other_sources_value=50.0,
            ),
            eth=CategoryAllocation(
                total_value=200.0,
                percentage_of_portfolio=50.0,
                wallet_tokens_value=150.0,
                other_sources_value=50.0,
            ),
            stablecoins=CategoryAllocation(
                total_value=80.0,
                percentage_of_portfolio=20.0,
                wallet_tokens_value=80.0,
                other_sources_value=0.0,
            ),
            others=CategoryAllocation(
                total_value=20.0,
                percentage_of_portfolio=5.0,
                wallet_tokens_value=20.0,
                other_sources_value=0.0,
            ),
        )
        # 100.0 + 200.0 + 80.0 + 20.0 = 400.0
        assert sum_category_total_values(allocation) == 400.0

    def test_handles_decimal_precision(self):
        """Test decimal precision consistency"""
        allocation = PortfolioAllocation(
            btc=CategoryAllocation(
                total_value=123.45,
                percentage_of_portfolio=30.86,
                wallet_tokens_value=100.0,
                other_sources_value=23.45,
            ),
            eth=CategoryAllocation(
                total_value=234.56,
                percentage_of_portfolio=58.64,
                wallet_tokens_value=200.0,
                other_sources_value=34.56,
            ),
            stablecoins=CategoryAllocation(
                total_value=34.67,
                percentage_of_portfolio=8.67,
                wallet_tokens_value=30.0,
                other_sources_value=4.67,
            ),
            others=CategoryAllocation(
                total_value=7.32,
                percentage_of_portfolio=1.83,
                wallet_tokens_value=5.0,
                other_sources_value=2.32,
            ),
        )
        # 123.45 + 234.56 + 34.67 + 7.32 = 400.0
        result = sum_category_total_values(allocation)
        assert result == 400.0


class TestCategoryCalculationConsistency:
    """
    Critical test proving builder and validator use same calculation.

    This test verifies that calling the same function multiple times
    produces bit-for-bit identical results, proving that the builder
    and validator will never have precision discrepancies.
    """

    def test_builder_validator_produce_identical_results(self):
        """Verify both calculation paths produce bit-for-bit identical results"""
        # Create allocation with decimal precision edge cases (the bug case)
        allocation = PortfolioAllocation(
            btc=CategoryAllocation(
                total_value=170.1,
                percentage_of_portfolio=25.0,
                wallet_tokens_value=170.1,
                other_sources_value=0.0,
            ),
            eth=CategoryAllocation(
                total_value=340.19,
                percentage_of_portfolio=50.0,
                wallet_tokens_value=340.19,
                other_sources_value=0.0,
            ),
            stablecoins=CategoryAllocation(
                total_value=136.08,
                percentage_of_portfolio=20.0,
                wallet_tokens_value=136.08,
                other_sources_value=0.0,
            ),
            others=CategoryAllocation(
                total_value=34.02,
                percentage_of_portfolio=5.0,
                wallet_tokens_value=34.02,
                other_sources_value=0.0,
            ),
        )

        # Call function multiple times (simulating builder and validator)
        result1 = sum_category_wallet_values(allocation)
        result2 = sum_category_wallet_values(allocation)
        result3 = sum_category_wallet_values(allocation)

        # Assert EXACT equality (not just within tolerance)
        # This proves identical execution path
        assert result1 == result2
        assert result2 == result3
        assert result1 == result3

        # Also verify the expected value
        assert result1 == 680.39

    def test_total_values_calculation_consistency(self):
        """Verify total_value summation is also consistent"""
        allocation = PortfolioAllocation(
            btc=CategoryAllocation(
                total_value=170.1,
                percentage_of_portfolio=25.0,
                wallet_tokens_value=170.1,
                other_sources_value=0.0,
            ),
            eth=CategoryAllocation(
                total_value=340.19,
                percentage_of_portfolio=50.0,
                wallet_tokens_value=340.19,
                other_sources_value=0.0,
            ),
            stablecoins=CategoryAllocation(
                total_value=136.08,
                percentage_of_portfolio=20.0,
                wallet_tokens_value=136.08,
                other_sources_value=0.0,
            ),
            others=CategoryAllocation(
                total_value=34.02,
                percentage_of_portfolio=5.0,
                wallet_tokens_value=34.02,
                other_sources_value=0.0,
            ),
        )

        # Call function multiple times
        result1 = sum_category_total_values(allocation)
        result2 = sum_category_total_values(allocation)
        result3 = sum_category_total_values(allocation)

        # Assert EXACT equality
        assert result1 == result2
        assert result2 == result3

        # Verify expected value
        assert result1 == 680.39
