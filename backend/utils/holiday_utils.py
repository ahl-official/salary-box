"""Holiday assignment helpers — individuals picked by HR, no employee tags."""

import json
from typing import Optional


def parse_emp_ids(raw) -> list[int]:
    if isinstance(raw, list):
        return [int(x) for x in raw if str(x).isdigit()]
    if isinstance(raw, str) and raw.strip():
        try:
            parsed = json.loads(raw)
            if isinstance(parsed, list):
                return [int(x) for x in parsed if str(x).isdigit()]
        except Exception:
            pass
    return []


def serialize_holiday(record: dict, employees: list[dict] | None = None) -> dict:
    out = dict(record)
    emp_ids = parse_emp_ids(out.get("emp_ids"))
    out["emp_ids"] = emp_ids
    out["scope"] = out.get("scope") or "all"
    if employees is not None:
        by_id = {int(e["id"]): e for e in employees if str(e.get("id", "")).isdigit()}
        out["assignees"] = [by_id[eid] for eid in emp_ids if eid in by_id]
    else:
        out["assignees"] = []
    return out


def holiday_applies_to_employee(holiday: dict, emp_id: int | str) -> bool:
    if str(holiday.get("scope", "all")).lower() == "all":
        return True
    return int(emp_id) in parse_emp_ids(holiday.get("emp_ids"))


def holiday_on_date(holidays: list[dict], emp_id: int | str, date_str: str) -> Optional[dict]:
    for h in holidays:
        if str(h.get("date", "")) != date_str:
            continue
        if holiday_applies_to_employee(h, emp_id):
            return h
    return None
