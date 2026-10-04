import hashlib
from datetime import UTC, timedelta

from icalendar import Calendar, Event

from hon.models.calendar import CalendarSnapshot


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

    for index, (day_offset, book_index, pages) in enumerate(snapshot.events):
        day = snapshot.start_date + timedelta(days=day_offset)
        title = snapshot.books[book_index]
        page_count = f"{pages:,}".replace(",", ".") if snapshot.locale == "pt-BR" else f"{pages:,}"
        unit = "pág." if snapshot.locale == "pt-BR" else "pp"
        event = Event()
        event.add("summary", f"{page_count} {unit} • {title}")
        event.add("dtstart", day)
        event.add("dtend", day + timedelta(days=1))
        event.add("dtstamp", stamp)
        identity = f"{snapshot.created_at.isoformat()}|{snapshot.start_date}|{index}|{book_index}|{pages}|{title}"
        event.add("uid", f"{hashlib.sha256(identity.encode('utf-8')).hexdigest()}@hon.fofinhos.studio")
        calendar.add_component(event)

    return calendar.to_ical()
