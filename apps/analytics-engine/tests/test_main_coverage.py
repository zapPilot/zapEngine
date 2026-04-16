import pytest
from fastapi import Request

from src.core.exceptions import DataIntegrityError
from src.main import data_integrity_error_handler


@pytest.mark.asyncio
async def test_data_integrity_error_handler():
    """Test the data integrity error handler in main.py."""
    exc = DataIntegrityError("Test error", context={"detail": "foo"})
    request = Request(scope={"type": "http"})

    response = await data_integrity_error_handler(request, exc)
    assert response.status_code == 500
    body = response.body.decode()
    assert "Test error" in body
    assert "DATA_INTEGRITY_ERROR" in body
