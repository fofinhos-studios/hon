def positive_page_count(value: object) -> int | None:
    if not isinstance(value, int) or isinstance(value, bool) or value < 1:
        return None
    return value


def non_empty_string(value: object) -> str | None:
    if not isinstance(value, str):
        return None
    normalized = value.strip()
    return normalized or None


def first_author(value: object) -> str:
    if isinstance(value, list) and value:
        author = non_empty_string(value[0])
        if author:
            return author
    return "Unknown"
