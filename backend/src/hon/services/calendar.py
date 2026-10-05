import hashlib
from datetime import UTC, timedelta
from typing import cast

from icalendar import Calendar, Event

from hon.models.calendar import CalendarEvent, CalendarEventV2, CalendarSnapshot


def generate_ical(snapshot: CalendarSnapshot) -> bytes:
    calendar = Calendar()
    calendar.add("prodid", "-//Hon//Reading Planner//EN")
    calendar.add("version", "2.0")
    calendar.add("calscale", "GREGORIAN")
    calendar.add(
        "x-wr-calname",
        "Hon · Cronograma de leitura" if snapshot.locale == "pt-BR" else "Hon · Reading schedule",
    )
    stamp = snapshot.created_at.astimezone(UTC)

    for index, item in enumerate(snapshot.events):
        if len(item) == 4:
            day_offset, book_index, amount, unit_kind = cast("CalendarEventV2", item)
        else:
            day_offset, book_index, amount = cast("CalendarEvent", item)
            unit_kind = "pages"
        day = snapshot.start_date + timedelta(days=day_offset)
        title = snapshot.books[book_index]
        display_count = f"{amount:,}".replace(",", ".") if snapshot.locale == "pt-BR" else f"{amount:,}"
        unit = "min" if unit_kind == "minutes" else ("pág." if snapshot.locale == "pt-BR" else "pp")
        event = Event()
        event.add("summary", f"{display_count} {unit} • {title}")
        event.add("dtstart", day)
        event.add("dtend", day + timedelta(days=1))
        event.add("dtstamp", stamp)
        identity = f"{snapshot.created_at.isoformat()}|{snapshot.start_date}|{index}|{book_index}|{amount}|{title}"
        if snapshot.v == 2:
            identity += f"|{unit_kind}"
        event.add("uid", f"{hashlib.sha256(identity.encode('utf-8')).hexdigest()}@hon.fofinhos.studio")
        calendar.add_component(event)

    return calendar.to_ical()
