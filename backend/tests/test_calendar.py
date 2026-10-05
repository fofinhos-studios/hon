import base64
import json
import zlib

from icalendar import Calendar


def snapshot(locale: str = "pt-BR") -> dict:
    return {
        "v": 1,
        "locale": locale,
        "created_at": "2026-01-01T12:00:00Z",
        "start_date": "2026-01-05",
        "books": ["Água, Vento; Luz", "Outro livro"],
        "events": [[0, 0, 5], [0, 1, 2], [2, 0, 3]],
    }


def payload(data: dict, *, compressed: bool = False) -> str:
    raw = json.dumps(data, ensure_ascii=False).encode("utf-8")
    if compressed:
        compressor = zlib.compressobj(wbits=-zlib.MAX_WBITS)
        raw = compressor.compress(raw) + compressor.flush()
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def events(response) -> list:
    calendar = Calendar.from_ical(response.content)
    return [component for component in calendar.walk() if component.name == "VEVENT"]


def test_download_and_feed_return_the_same_all_day_events(client):
    data = snapshot()
    download = client.post("/calendar/ics", json=data)
    feed = client.get("/calendar/ics", params={"payload": payload(data, compressed=True), "encoding": "deflate"})
    assert download.status_code == feed.status_code == 200
    assert download.content == feed.content
    assert download.headers["content-type"].startswith("text/calendar")
    assert "attachment" in download.headers["content-disposition"]
    assert "inline" in feed.headers["content-disposition"]

    parsed = events(feed)
    assert len(parsed) == 3
    assert str(parsed[0]["summary"]) == "5 pág. • Água, Vento; Luz"
    assert parsed[0].decoded("dtstart").isoformat() == "2026-01-05"
    assert parsed[0].decoded("dtend").isoformat() == "2026-01-06"
    assert parsed[0].decoded("dtstamp").isoformat() == "2026-01-01T12:00:00+00:00"
    repeated = client.get("/calendar/ics", params={"payload": payload(data, compressed=True)})
    assert parsed[0]["uid"] == events(repeated)[0]["uid"]


def test_english_titles_and_plain_feed(client):
    data = snapshot("en")
    feed = client.get("/calendar/ics", params={"payload": payload(data), "encoding": "plain"})
    assert feed.status_code == 200
    assert str(events(feed)[0]["summary"]).startswith("5 pp • ")


def test_v2_mixed_units_and_v1_page_only_feed(client):
    old = snapshot("en")
    mixed = snapshot("en")
    mixed["v"] = 2
    mixed["events"] = [[0, 0, 5, "pages"], [0, 1, 30, "minutes"]]
    old_response = client.get("/calendar/ics", params={"payload": payload(old), "encoding": "plain"})
    new_response = client.get("/calendar/ics", params={"payload": payload(mixed), "encoding": "plain"})
    assert old_response.status_code == new_response.status_code == 200
    assert str(events(old_response)[0]["summary"]) == "5 pp • Água, Vento; Luz"
    assert [str(event["summary"]) for event in events(new_response)] == [
        "5 pp • Água, Vento; Luz",
        "30 min • Outro livro",
    ]
    mixed["locale"] = "pt-BR"
    localized = client.post("/calendar/ics", json=mixed)
    assert str(events(localized)[1]["summary"]) == "30 min • Outro livro"
    mixed["events"] = [[0, 0, 5]]
    assert client.post("/calendar/ics", json=mixed).status_code == 422


def test_download_accepts_a_title_too_long_for_a_portable_url(client):
    data = snapshot()
    data["books"][0] = "A" * 7000
    download = client.post("/calendar/ics", json=data)
    assert download.status_code == 200
    assert str(events(download)[0]["summary"]).endswith("A" * 7000)


def test_invalid_or_oversized_payloads_are_rejected(client):
    data = snapshot()
    data["events"] = [[0, 99, 5]]
    assert client.post("/calendar/ics", json=data).status_code == 422
    assert client.get("/calendar/ics", params={"payload": payload(data), "encoding": "plain"}).status_code == 422
    assert client.get("/calendar/ics", params={"payload": "%%", "encoding": "deflate"}).status_code == 422

    compressor = zlib.compressobj(wbits=-zlib.MAX_WBITS)
    bomb_bytes = compressor.compress(b"x" * (256 * 1024 + 1)) + compressor.flush()
    bomb = base64.urlsafe_b64encode(bomb_bytes).decode("ascii").rstrip("=")
    assert client.get("/calendar/ics", params={"payload": bomb, "encoding": "deflate"}).status_code == 413
