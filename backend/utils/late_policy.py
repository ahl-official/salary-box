"""Per-branch late arrival rules and monthly half-day deductions."""

from datetime import date, datetime
from typing import Optional

from utils.datetime_utils import get_company_tz, parse_timestamp
from utils.shift_utils import is_week_off


def get_late_policy(settings: dict) -> dict:
    policy_type = str(settings.get("late_policy_type") or "office").lower()
    if policy_type == "salon":
        return {
            "type": "salon",
            "grace_minutes": 0,
            "monthly_allowance": 0,
        }
    return {
        "type": "office",
        "grace_minutes": int(settings.get("late_grace_minutes") or 15),
        "monthly_allowance": int(settings.get("late_monthly_allowance") or 6),
    }


def shift_start_on_date(day: date, settings: dict) -> datetime:
    tz = get_company_tz(settings)
    start = str(settings.get("shift_start") or "09:00")
    hour, minute = map(int, start.split(":")[:2])
    return datetime(day.year, day.month, day.day, hour, minute, tzinfo=tz)


def evaluate_punch_in_late(punch_in_ts: str, settings: dict) -> dict:
    """Return late status for a single punch-in timestamp."""
    policy = get_late_policy(settings)
    punch_dt = parse_timestamp(punch_in_ts, settings)
    start_dt = shift_start_on_date(punch_dt.date(), settings)
    delta_seconds = (punch_dt - start_dt).total_seconds()
    raw_late_minutes = max(0, int(delta_seconds // 60)) if delta_seconds > 0 else 0

    if policy["type"] == "salon":
        is_late = delta_seconds > 0
    else:
        is_late = raw_late_minutes > policy["grace_minutes"]

    return {
        "is_late": is_late,
        "late_minutes": raw_late_minutes if is_late else 0,
        "raw_late_minutes": raw_late_minutes,
        "grace_minutes": policy["grace_minutes"],
        "late_policy_type": policy["type"],
        "shift_start": settings.get("shift_start", "09:00"),
    }


def _first_punch_in_per_day(punches: list[dict], settings: dict) -> dict[str, str]:
    day_map: dict[str, str] = {}
    for p in sorted(punches, key=lambda x: x.get("timestamp", "")):
        if p.get("punch_type") != "in":
            continue
        ts = str(p.get("timestamp", ""))
        if not ts:
            continue
        try:
            day_key = parse_timestamp(ts, settings).date().isoformat()
        except ValueError:
            continue
        if day_key not in day_map:
            day_map[day_key] = ts
    return day_map


def build_monthly_late_summary(
    punches: list[dict],
    settings: dict,
    year: int,
    month: int,
) -> dict:
    """Compute late days and half-day deductions for a month (working days only)."""
    policy = get_late_policy(settings)
    day_ins = _first_punch_in_per_day(punches, settings)

    late_events: list[dict] = []
    for day_key in sorted(day_ins.keys()):
        try:
            day = date.fromisoformat(day_key)
        except ValueError:
            continue
        if day.year != year or day.month != month:
            continue
        if is_week_off(day, settings):
            continue

        punch_in_ts = day_ins[day_key]
        late_info = evaluate_punch_in_late(punch_in_ts, settings)
        if not late_info["is_late"]:
            continue
        late_events.append({"date": day_key, **late_info})

    days_out: dict[str, dict] = {}
    half_day_count = 0
    forgiven_count = 0

    for idx, event in enumerate(late_events, start=1):
        day_key = event["date"]
        if policy["type"] == "salon":
            half_day = True
            forgiven = False
            penalty_reason = "salon_zero_tolerance"
        elif idx <= policy["monthly_allowance"]:
            half_day = False
            forgiven = True
            penalty_reason = None
            forgiven_count += 1
        else:
            half_day = True
            forgiven = False
            penalty_reason = "office_monthly_limit_exceeded"

        if half_day:
            half_day_count += 1

        days_out[day_key] = {
            "is_late": True,
            "late_minutes": event["late_minutes"],
            "late_day_number": idx,
            "half_day_deduction": half_day,
            "forgiven": forgiven,
            "penalty_reason": penalty_reason,
            "late_policy_type": policy["type"],
        }

    return {
        "year": year,
        "month": month,
        "late_policy_type": policy["type"],
        "late_grace_minutes": policy["grace_minutes"],
        "late_monthly_allowance": policy["monthly_allowance"],
        "late_days_count": len(late_events),
        "forgiven_late_days": forgiven_count,
        "half_day_deductions": half_day_count,
        "days": days_out,
    }


def late_message_for_punch(
    punch_in_ts: str,
    settings: dict,
    month_punches: list[dict],
    year: int,
    month: int,
) -> Optional[str]:
    """Human-readable late message after punch-in."""
    late_info = evaluate_punch_in_late(punch_in_ts, settings)
    if not late_info["is_late"]:
        return None

    summary = build_monthly_late_summary(month_punches, settings, year, month)
    day_key = parse_timestamp(punch_in_ts, settings).date().isoformat()
    day_detail = summary["days"].get(day_key)
    if not day_detail:
        return f"Late arrival ({late_info['late_minutes']} min after shift start)."

    policy = get_late_policy(settings)
    if policy["type"] == "salon":
        return (
            f"Late arrival ({late_info['late_minutes']} min). "
            "Salon policy: automatic half-day deduction."
        )

    n = day_detail["late_day_number"]
    allowance = policy["monthly_allowance"]
    if day_detail["forgiven"]:
        return (
            f"Late arrival ({late_info['late_minutes']} min). "
            f"Late day {n} of {allowance} allowed this month — no deduction."
        )
    return (
        f"Late arrival ({late_info['late_minutes']} min). "
        f"Late day {n} this month — half-day deduction applies."
    )
