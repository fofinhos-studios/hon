import base64
import binascii
import zlib
from typing import Literal

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import Response
from pydantic import ValidationError

from hon.models.calendar import CalendarSnapshot
from hon.services.calendar import generate_ical

router = APIRouter(prefix="/calendar", tags=["calendar"])
MAX_PAYLOAD_CHARS = 8192
MAX_DECOMPRESSED_BYTES = 256 * 1024


def decode_snapshot(payload: str, encoding: Literal["deflate", "plain"]) -> CalendarSnapshot:
    if len(payload) > MAX_PAYLOAD_CHARS:
        raise HTTPException(status_code=413, detail="Calendar URL is too long")
    try:
        padded = payload + "=" * (-len(payload) % 4)
        data = base64.b64decode(padded.encode("ascii"), altchars=b"-_", validate=True)
        if encoding == "deflate":
            decompressor = zlib.decompressobj(wbits=-zlib.MAX_WBITS)
            decoded = decompressor.decompress(data, MAX_DECOMPRESSED_BYTES + 1)
            if decompressor.unconsumed_tail or len(decoded) > MAX_DECOMPRESSED_BYTES:
                raise HTTPException(status_code=413, detail="Calendar payload is too large")
            decoded += decompressor.flush(MAX_DECOMPRESSED_BYTES + 1 - len(decoded))
            if not decompressor.eof or decompressor.unused_data:
                raise ValueError("invalid compressed payload")
        else:
            decoded = data
        if len(decoded) > MAX_DECOMPRESSED_BYTES:
            raise HTTPException(status_code=413, detail="Calendar payload is too large")
        return CalendarSnapshot.model_validate_json(decoded)
    except (UnicodeEncodeError, binascii.Error, ValidationError, ValueError, zlib.error) as exc:
        raise HTTPException(status_code=422, detail="Invalid calendar URL") from exc


@router.post("/ics")
async def download_ics(snapshot: CalendarSnapshot) -> Response:
    return Response(
        content=generate_ical(snapshot),
        media_type="text/calendar",
        headers={"Content-Disposition": 'attachment; filename="hon.ics"'},
    )


@router.get("/ics")
async def calendar_feed(
    payload: str = Query(min_length=1, max_length=MAX_PAYLOAD_CHARS),
    encoding: Literal["deflate", "plain"] = "deflate",
) -> Response:
    snapshot = decode_snapshot(payload, encoding)
    return Response(
        content=generate_ical(snapshot),
        media_type="text/calendar",
        headers={"Content-Disposition": 'inline; filename="hon.ics"'},
    )
