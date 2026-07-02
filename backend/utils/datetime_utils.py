from datetime import datetime, date, timezone, timedelta
from zoneinfo import ZoneInfo

DEFAULT_TZ = "Asia/Kolkata"
TZ_FALLBACKS = {
    "Asia/Kolkata": timezone(timedelta(hours=5, minutes=30)),
}


def get_company_tz(settings: dict | None = None) -> ZoneInfo:
    tz_name = DEFAULT_TZ
    if settings:
        tz_name = settings.get("timezone") or DEFAULT_TZ
    try:
        return ZoneInfo(tz_name)
    except Exception:
        return TZ_FALLBACKS.get(tz_name, timezone.utc)


def now_local(settings: dict | None = None) -> datetime:
    return datetime.now(get_company_tz(settings))


def now_iso(settings: dict | None = None) -> str:
    return now_local(settings).isoformat(timespec="seconds")


def today_iso(settings: dict | None = None) -> str:
    return now_local(settings).date().isoformat()


def parse_timestamp(value: str, settings: dict | None = None) -> datetime:
    """Parse stored timestamps; naive values are IST (company timezone)."""
    if not value:
        raise ValueError("Empty timestamp")
    normalized = value.replace("Z", "+00:00")
    try:
        dt = datetime.fromisoformat(normalized)
    except ValueError:
        dt = datetime.fromisoformat(value)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=get_company_tz(settings))
    return dt.astimezone(get_company_tz(settings))


def local_date_from_timestamp(value: str, settings: dict | None = None) -> str:
    return parse_timestamp(value, settings).date().isoformat()
