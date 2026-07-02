"""Merge company-wide settings with per-branch overrides."""

import json
from typing import Optional

BRANCH_RULE_KEYS = (
    "office_lat",
    "office_lng",
    "radius_meters",
    "shift_start",
    "shift_end",
    "standard_shift_hours",
    "working_days",
    "wifi_ip",
    "wifi_lock_enabled",
    "late_policy_type",
    "late_grace_minutes",
    "late_monthly_allowance",
)

DEFAULT_BACK_OFFICE_RULES = {
    "office_lat": "19.06996",
    "office_lng": "72.83748",
    "radius_meters": "100",
    "shift_start": "09:00",
    "shift_end": "18:00",
    "standard_shift_hours": "9",
    "working_days": '["Mon","Tue","Wed","Thu","Fri","Sat"]',
    "wifi_ip": "",
    "wifi_lock_enabled": "0",
    "late_policy_type": "office",
    "late_grace_minutes": "15",
    "late_monthly_allowance": "6",
}

DEFAULT_SALON_RULES = {
    "office_lat": "19.06996",
    "office_lng": "72.83748",
    "radius_meters": "100",
    "shift_start": "10:00",
    "shift_end": "19:00",
    "standard_shift_hours": "9",
    "working_days": '["Tue","Wed","Thu","Fri","Sat","Sun"]',
    "wifi_ip": "",
    "wifi_lock_enabled": "0",
    "late_policy_type": "salon",
    "late_grace_minutes": "0",
    "late_monthly_allowance": "0",
}

BRANCH_PRESETS = {
    "back office": DEFAULT_BACK_OFFICE_RULES,
    "salon": DEFAULT_SALON_RULES,
}


def parse_branch_working_days(branch: dict) -> list[str]:
    raw = branch.get("working_days", "")
    if isinstance(raw, list):
        return raw
    if isinstance(raw, str) and raw.strip():
        try:
            parsed = json.loads(raw)
            if isinstance(parsed, list):
                return parsed
        except Exception:
            pass
    return []


def serialize_branch(branch: dict) -> dict:
    """Return branch dict with working_days as a list for API responses."""
    out = dict(branch)
    days = parse_branch_working_days(out)
    if days:
        out["working_days"] = days
    elif "working_days" in out and isinstance(out["working_days"], str) and not out["working_days"].strip():
        out["working_days"] = []
    return out


def effective_settings(global_settings: dict, branch: Optional[dict]) -> dict:
    """Branch rules override company defaults where set."""
    merged = dict(global_settings or {})
    if not branch:
        return merged
    for key in BRANCH_RULE_KEYS:
        val = branch.get(key)
        if val not in (None, ""):
            merged[key] = val
    return merged


def rules_from_global(global_settings: dict) -> dict:
    return {k: str(global_settings.get(k, "")) for k in BRANCH_RULE_KEYS}
