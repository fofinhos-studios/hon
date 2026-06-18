from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi.testclient import TestClient

from hon.main import app


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


def response(data: object = None, *, json_error: Exception | None = None) -> MagicMock:
    mock = MagicMock()
    if json_error is not None:
        mock.json.side_effect = json_error
    else:
        mock.json.return_value = data
    mock.raise_for_status = MagicMock()
    return mock


def async_client(*responses: object) -> AsyncMock:
    client = AsyncMock()
    client.__aenter__ = AsyncMock(return_value=client)
    client.__aexit__ = AsyncMock(return_value=False)
    client.get = AsyncMock(side_effect=[response(data) for data in responses])
    return client
