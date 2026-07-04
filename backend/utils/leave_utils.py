import json
from datetime import date, timedelta
from typing import List


def parse_dates_json(raw) -> List[str]:
    if not raw:
        return []
    if isinstance(raw, list):
        return [str(d) for d in raw]
    try:
        parsed = json.loads(raw)
        return [str(d) for d in parsed] if isinstance(parsed, list) else []
    except (json.JSONDecodeError, TypeError):
        return []


def expand_date_range(start: str, end: str) -> List[str]:
    start_d = date.fromisoformat(start)
    end_d = date.fromisoformat(end)
    if end_d < start_d:
        raise ValueError("End date must be on or after start date")
    days = []
    cur = start_d
    while cur <= end_d:
        days.append(cur.isoformat())
        cur += timedelta(days=1)
    return days


def normalize_leave_dates(leave_type: str, dates: List[str]) -> List[str]:
    cleaned = sorted({d.strip() for d in dates if d and d.strip()})
    if leave_type == "single":
        if len(cleaned) != 1:
            raise ValueError("Single leave requires exactly one date")
    elif leave_type == "multiple":
        if len(cleaned) < 2:
            raise ValueError("Multiple leave requires at least two dates")
    else:
        raise ValueError("leave_type must be 'single' or 'multiple'")
    for d in cleaned:
        date.fromisoformat(d)
    return cleaned


def serialize_leave(record: dict) -> dict:
    dates = parse_dates_json(record.get("dates"))
    return {
        **record,
        "dates": dates,
        "date_count": len(dates),
        "date_label": dates[0] if len(dates) == 1 else f"{dates[0]} → {dates[-1]}",
    }
