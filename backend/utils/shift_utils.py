import json
from datetime import date, datetime

DEFAULT_WORKING_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
JS_DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
PY_WEEKDAY_TO_NAME = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]


def parse_working_days(settings: dict) -> list[str]:
    raw = settings.get("working_days", DEFAULT_WORKING_DAYS)
    if isinstance(raw, str):
        try:
            raw = json.loads(raw)
        except Exception:
            raw = DEFAULT_WORKING_DAYS
    return raw or DEFAULT_WORKING_DAYS


def shift_duration_hours(settings: dict) -> float:
  explicit = settings.get("standard_shift_hours")
  if explicit not in (None, ""):
      try:
          return float(explicit)
      except (TypeError, ValueError):
          pass
  start = settings.get("shift_start", "09:00")
  end = settings.get("shift_end", "18:00")
  sh, sm = map(int, str(start).split(":")[:2])
  eh, em = map(int, str(end).split(":")[:2])
  return max(0.0, ((eh * 60 + em) - (sh * 60 + sm)) / 60.0)


def is_working_day(value: date | datetime, settings: dict) -> bool:
    if isinstance(value, datetime):
        value = value.date()
    working_days = parse_working_days(settings)
    day_name = PY_WEEKDAY_TO_NAME[value.weekday()]
    return day_name in working_days


def is_week_off(value: date | datetime, settings: dict) -> bool:
    return not is_working_day(value, settings)


def overtime_hours(hours_worked: float | None, settings: dict) -> float:
    if hours_worked is None:
        return 0.0
    standard = shift_duration_hours(settings)
    return round(max(0.0, hours_worked - standard), 2)


def regular_hours(hours_worked: float | None, settings: dict) -> float:
    if hours_worked is None:
        return 0.0
    standard = shift_duration_hours(settings)
    return round(min(hours_worked, standard), 2)
