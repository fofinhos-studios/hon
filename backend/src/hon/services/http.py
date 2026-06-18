from typing import Any

import httpx


def decode_json_object(response: httpx.Response, provider: str) -> dict[str, Any]:
    try:
        data = response.json()
    except ValueError as exc:
        raise httpx.DecodingError(f"{provider} returned invalid JSON") from exc
    if not isinstance(data, dict):
        raise httpx.DecodingError(f"{provider} returned an invalid response")
    return data
