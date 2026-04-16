from unittest.mock import MagicMock, patch

from src.services.market.regime_tracking_service import RegimeTrackingService


class TestRegimeTrackingServiceCoverage:
    def test_init_resolves_dependency(self):
        """Test that __init__ resolves get_query_service when not provided."""
        mock_db = MagicMock()
        mock_qs = MagicMock()

        with patch(
            "src.services.dependencies.get_query_service", return_value=mock_qs
        ) as mock_get:
            service = RegimeTrackingService(mock_db, query_service=None)

            mock_get.assert_called_once()
            assert service.query_service == mock_qs
