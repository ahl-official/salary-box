"""
Google Sheets as the sole database.

Sheet layout (one Google Spreadsheet, multiple tabs):
  employees   | id | name | phone | role | department | branch | designation | created_at
  attendance  | id | emp_id | emp_name | punch_type | timestamp | lat | lng | status | distance_from_office
  settings    | key | value          (single row per key)
  branches    | id | name
  departments | id | name
  notes       | id | content | posted_by | date | created_at
  reports     | id | name | type | month | branch | department | generated_at | file_path

Setup:
  1. Create a Google Cloud service account and download credentials JSON.
  2. Share your Google Spreadsheet with the service account email (Editor).
  3. Set env vars:  GOOGLE_SHEETS_CREDS_JSON  (path to JSON file or JSON string)
                    GOOGLE_SPREADSHEET_ID      (the spreadsheet ID from the URL)
"""

import os
import json
import shutil
import base64
import threading
import re
from pathlib import Path
from datetime import datetime, date
from typing import Optional, List, Dict, Any
from dotenv import load_dotenv
from utils.datetime_utils import now_iso, today_iso, parse_timestamp, local_date_from_timestamp
from utils.branch_settings import (
    DEFAULT_BACK_OFFICE_RULES,
    DEFAULT_SALON_RULES,
    rules_from_global,
    serialize_branch,
)

import gspread
from google.oauth2.service_account import Credentials

_BACKEND_DIR = Path(__file__).resolve().parent.parent
load_dotenv(_BACKEND_DIR / ".env")

DEFAULT_SPREADSHEET_ID = "1vRNv44R5SohaZVMiFGbGntevFS1rs9yhsiCtnHXb5hE"
DEFAULT_CREDS_FILE = _BACKEND_DIR / "service_account.json"

# ---------------------------------------------------------------------------
# Connection & sheet bootstrap
# ---------------------------------------------------------------------------

SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive.file",
]

SHEET_HEADERS = {
    "employees":   ["id", "name", "phone", "role", "department", "branch", "designation", "created_at"],
    "attendance":  ["id", "emp_id", "emp_name", "punch_type", "timestamp", "lat", "lng", "status", "distance_from_office"],
    "settings":    ["key", "value"],
    "branches":    ["id", "name", "office_lat", "office_lng", "radius_meters",
                    "shift_start", "shift_end", "standard_shift_hours", "working_days",
                    "wifi_ip", "wifi_lock_enabled",
                    "late_policy_type", "late_grace_minutes", "late_monthly_allowance"],
    "departments": ["id", "name"],
    "notes":       ["id", "content", "posted_by", "date", "created_at"],
    "holidays":    ["id", "name", "month", "date", "scope", "emp_ids", "created_at", "created_by"],
    "reports":     ["id", "name", "type", "month", "branch", "department", "generated_at", "file_path"],
}

DEFAULT_SETTINGS = {
    "company_name":       "My Company",
    "address":            "",
    "gstin":              "",
    "office_lat":         "19.06996",
    "office_lng":         "72.83748",
    "radius_meters":      "100",
    "wifi_ip":            "",
    "wifi_lock_enabled":  "0",
    "shift_start":        "09:00",
    "shift_end":          "18:00",
    "standard_shift_hours": "9",
    "working_days":       '["Mon","Tue","Wed","Thu","Fri","Sat"]',
    "timezone":           "Asia/Kolkata",
}

DEFAULT_EMPLOYEES = [
    [1, "Admin User", "9999999999", "admin", "General", "Back Office", "Administrator"],
    [2, "Admin Demo", "9000000000", "admin", "General", "Back Office", "Administrator"],
    [3, "Employee Demo", "9111111111", "employee", "General", "Back Office", "Employee"],
    [4, "Salon Demo", "9222222222", "employee", "General", "Salon", "Stylist"],
]

_client_lock = threading.Lock()
_local_lock = threading.RLock()
_gc: Optional[gspread.Client] = None
_spreadsheet = None
_BUNDLED_LOCAL_DB = _BACKEND_DIR / "local_data.json"


def _resolve_local_db_path() -> str:
    if os.environ.get("VERCEL"):
        return "/tmp/attendance_local_data.json"
    return str(_BUNDLED_LOCAL_DB)


LOCAL_DB_PATH = _resolve_local_db_path()


def _ensure_local_db_seeded():
    """Vercel's filesystem is read-only except /tmp — copy bundled seed data once."""
    if os.path.exists(LOCAL_DB_PATH):
        return
    if _BUNDLED_LOCAL_DB.exists():
        shutil.copy(_BUNDLED_LOCAL_DB, LOCAL_DB_PATH)


class LocalWorksheet:
    def __init__(self, title: str):
        self.title = title

    def _read_db(self) -> dict:
        _ensure_local_db_seeded()
        if not os.path.exists(LOCAL_DB_PATH):
            return {}
        with open(LOCAL_DB_PATH, "r", encoding="utf-8") as f:
            return json.load(f)

    def _write_db(self, db: dict):
        _ensure_local_db_seeded()
        with open(LOCAL_DB_PATH, "w", encoding="utf-8") as f:
            json.dump(db, f, indent=2)

    def _ensure_sheet(self, db: dict):
        db.setdefault(self.title, [SHEET_HEADERS[self.title]])

    def get_all_records(self) -> List[dict]:
        with _local_lock:
            db = self._read_db()
            self._ensure_sheet(db)
            self._write_db(db)
            rows = db[self.title]
            headers = rows[0]
            return [_row_to_dict(headers, row) for row in rows[1:]]

    def append_row(self, row: List[Any]):
        with _local_lock:
            db = self._read_db()
            self._ensure_sheet(db)
            db[self.title].append(row)
            self._write_db(db)

    def row_values(self, row_idx: int) -> List[Any]:
        with _local_lock:
            db = self._read_db()
            self._ensure_sheet(db)
            rows = db[self.title]
            if row_idx < 1 or row_idx > len(rows):
                return []
            return rows[row_idx - 1]

    def col_values(self, col_idx: int) -> List[Any]:
        with _local_lock:
            db = self._read_db()
            self._ensure_sheet(db)
            values = []
            for row in db[self.title]:
                values.append(row[col_idx - 1] if col_idx <= len(row) else "")
            return values

    def update(self, cell: str, values: List[List[Any]]):
        match = re.match(r"[A-Z]+(\d+)", cell)
        if not match:
            return
        row_idx = int(match.group(1))
        with _local_lock:
            db = self._read_db()
            self._ensure_sheet(db)
            rows = db[self.title]
            while len(rows) < row_idx:
                rows.append([])
            rows[row_idx - 1] = values[0]
            self._write_db(db)

    def update_cell(self, row_idx: int, col_idx: int, value: Any):
        with _local_lock:
            db = self._read_db()
            self._ensure_sheet(db)
            rows = db[self.title]
            while len(rows) < row_idx:
                rows.append([])
            row = rows[row_idx - 1]
            while len(row) < col_idx:
                row.append("")
            row[col_idx - 1] = value
            self._write_db(db)

    def delete_rows(self, row_idx: int):
        with _local_lock:
            db = self._read_db()
            self._ensure_sheet(db)
            rows = db[self.title]
            if 1 < row_idx <= len(rows):
                del rows[row_idx - 1]
            self._write_db(db)


class LocalSpreadsheet:
    def worksheets(self):
        db = self._read_db()
        return [LocalWorksheet(title) for title in db.keys()]

    def worksheet(self, tab_name: str):
        db = self._read_db()
        if tab_name not in db:
            raise gspread.WorksheetNotFound(tab_name)
        return LocalWorksheet(tab_name)

    def add_worksheet(self, title: str, rows: int = 1000, cols: int = 20):
        with _local_lock:
            db = self._read_db()
            db.setdefault(title, [])
            self._write_db(db)
        return LocalWorksheet(title)

    def _read_db(self) -> dict:
        _ensure_local_db_seeded()
        if not os.path.exists(LOCAL_DB_PATH):
            return {}
        with open(LOCAL_DB_PATH, "r", encoding="utf-8") as f:
            return json.load(f)

    def _write_db(self, db: dict):
        _ensure_local_db_seeded()
        with open(LOCAL_DB_PATH, "w", encoding="utf-8") as f:
            json.dump(db, f, indent=2)


def _resolve_creds_raw() -> str:
    b64 = os.environ.get("GOOGLE_SHEETS_CREDS_B64", "").strip()
    if b64:
        try:
            return base64.b64decode(b64).decode("utf-8")
        except Exception as exc:
            raise RuntimeError(
                "GOOGLE_SHEETS_CREDS_B64 is invalid. "
                "Run: python print_creds_oneline.py --base64"
            ) from exc

    raw = os.environ.get("GOOGLE_SHEETS_CREDS_JSON", "").strip()
    if raw:
        if raw.startswith("{"):
            return raw
        path = Path(raw)
        if not path.is_absolute():
            path = _BACKEND_DIR / path
        if path.exists():
            return str(path)
        if os.path.exists(raw):
            return raw
    if DEFAULT_CREDS_FILE.exists():
        return str(DEFAULT_CREDS_FILE)
    return ""


def _resolve_spreadsheet_id() -> str:
    return os.environ.get("GOOGLE_SPREADSHEET_ID", DEFAULT_SPREADSHEET_ID).strip()


def _using_local_store() -> bool:
    return not _resolve_creds_raw() or not _resolve_spreadsheet_id()


def _load_creds_info() -> dict:
    raw = _resolve_creds_raw()
    if not raw:
        raise RuntimeError(
            "Google Sheets credentials not found. "
            "Place service_account.json in the backend/ folder "
            "or set GOOGLE_SHEETS_CREDS_JSON."
        )
    if not raw.strip().startswith("{"):
        with open(raw, encoding="utf-8") as f:
            return json.load(f)

    text = raw.strip()
    if (text.startswith("'") and text.endswith("'")) or (text.startswith('"') and text.endswith('"')):
        text = text[1:-1].strip()

    attempts = [
        text,
        text.replace("\r\n", "\n"),
        "".join(line.strip() for line in text.splitlines()),
    ]
    last_error = None
    for candidate in attempts:
        try:
            return json.loads(candidate)
        except json.JSONDecodeError as exc:
            last_error = exc
    raise RuntimeError(
        "GOOGLE_SHEETS_CREDS_JSON is invalid JSON. "
        "In Vercel, paste the entire service_account.json as one single line."
    ) from last_error


def _get_credentials() -> Credentials:
    info = _load_creds_info()
    return Credentials.from_service_account_info(info, scopes=SCOPES)


def _service_account_email() -> Optional[str]:
    try:
        return _load_creds_info().get("client_email")
    except Exception:
        return None


def get_spreadsheet():
    global _gc, _spreadsheet
    with _client_lock:
        if _spreadsheet is not None:
            return _spreadsheet
        if _using_local_store():
            _spreadsheet = LocalSpreadsheet()
            return _spreadsheet
        try:
            creds = _get_credentials()
            _gc = gspread.authorize(creds)
            spreadsheet_id = _resolve_spreadsheet_id()
            if not spreadsheet_id:
                raise RuntimeError("GOOGLE_SPREADSHEET_ID not set.")
            _spreadsheet = _gc.open_by_key(spreadsheet_id)
            return _spreadsheet
        except Exception as exc:
            email = _service_account_email() or "your service account email"
            sheet_id = _resolve_spreadsheet_id()
            raise RuntimeError(
                f"Cannot open Google Sheet {sheet_id}. "
                f"Open the sheet → Share → add {email} with Editor access. "
                f"Details: {exc}"
            ) from exc


def get_sheet(tab_name: str) -> gspread.Worksheet:
    ss = get_spreadsheet()
    try:
        ws = ss.worksheet(tab_name)
    except gspread.WorksheetNotFound:
        ws = ss.add_worksheet(title=tab_name, rows=1000, cols=20)
        ws.append_row(SHEET_HEADERS[tab_name])
    return ws


def get_datastore_info() -> dict:
    using_local = _using_local_store()
    info = {
        "type": "local_json" if using_local else "google_sheets",
        "spreadsheet_id": None if using_local else _resolve_spreadsheet_id(),
        "creds_configured": bool(
            os.environ.get("GOOGLE_SHEETS_CREDS_JSON", "").strip()
            or os.environ.get("GOOGLE_SHEETS_CREDS_B64", "").strip()
            or DEFAULT_CREDS_FILE.exists()
        ),
        "creds_format": (
            "base64" if os.environ.get("GOOGLE_SHEETS_CREDS_B64", "").strip()
            else "json" if os.environ.get("GOOGLE_SHEETS_CREDS_JSON", "").strip()
            else "file" if DEFAULT_CREDS_FILE.exists()
            else None
        ),
        "service_account_email": None,
    }
    try:
        info["service_account_email"] = _service_account_email()
    except Exception:
        pass
    if using_local:
        return info
    try:
        ss = get_spreadsheet()
        info["spreadsheet_title"] = ss.title
        info["tabs"] = [ws.title for ws in ss.worksheets()]
        if isinstance(ss, LocalSpreadsheet):
            info["type"] = "local_json"
            info["warning"] = "Credentials are set but Google Sheets is not connected."
    except Exception as exc:
        info["connection_error"] = str(exc)
        info["type"] = "disconnected"
    return info


def init_sheets():
    """Called at startup — ensures all tabs + default data exist."""
    if _using_local_store():
        _ensure_local_db_seeded()
    ss = get_spreadsheet()
    existing = {ws.title for ws in ss.worksheets()}

    for tab, headers in SHEET_HEADERS.items():
        if tab not in existing:
            ws = ss.add_worksheet(title=tab, rows=1000, cols=len(headers) + 2)
            ws.append_row(headers)

    if _using_local_store():
        with _local_lock:
            local_ss = LocalSpreadsheet()
            db = local_ss._read_db()
            for tab, headers in SHEET_HEADERS.items():
                rows = db.setdefault(tab, [headers])
                if not rows:
                    rows.append(headers)
                if rows[0] != headers:
                    rows.insert(0, headers)
                db[tab] = [rows[0]] + [row for row in rows[1:] if row != headers]
            local_ss._write_db(db)

    # Seed default settings
    ws = get_sheet("settings")
    rows = ws.get_all_records()
    existing_keys = {r["key"] for r in rows}
    for k, v in DEFAULT_SETTINGS.items():
        if k not in existing_keys:
            ws.append_row([k, v])

    # Seed default branches with per-branch rules
    _ensure_default_branches()
    _migrate_branch_late_policies()
    _migrate_head_office_employees()

    # Seed default department
    if not get_sheet("departments").get_all_records():
        get_sheet("departments").append_row([1, "General"])

    # Seed default demo employees
    emp_ws = get_sheet("employees")
    employees = emp_ws.get_all_records()
    existing_phones = {str(e.get("phone", "")).strip() for e in employees}
    existing_ids = [
        int(e.get("id", 0))
        for e in employees
        if str(e.get("id", "")).isdigit()
    ]
    next_id = max(existing_ids, default=0) + 1
    for default_id, name, phone, role, department, branch, designation in DEFAULT_EMPLOYEES:
        if phone in existing_phones:
            continue
        emp_id = default_id if default_id not in existing_ids else next_id
        next_id = max(next_id, emp_id + 1)
        emp_ws.append_row([emp_id, name, phone, role, department, branch, designation, now_iso()])
        existing_phones.add(phone)
        existing_ids.append(emp_id)

    store = "local JSON store" if _using_local_store() else "Google Sheets"
    if _using_local_store() and _resolve_spreadsheet_id():
        print(
            f"Attendance data initialized using {store}. "
            f"Add backend/service_account.json and share the Google Sheet to switch to Google Sheets."
        )
    else:
        print(f"Attendance data initialized successfully using {store}.")

    if not _using_local_store():
        try:
            from utils.sheet_layout import SHEETS_LAYOUT_VERSION, organize_spreadsheet
            settings_rows = get_sheet("settings").get_all_records()
            layout_version = next(
                (r.get("value") for r in settings_rows if r.get("key") == "sheets_layout_version"),
                None,
            )
            if layout_version != SHEETS_LAYOUT_VERSION:
                organize_spreadsheet(ss, SHEET_HEADERS)
        except Exception as exc:
            print(f"Sheet layout organize skipped: {exc}")


# ---------------------------------------------------------------------------
# Generic CRUD helpers
# ---------------------------------------------------------------------------

def _next_id(ws: gspread.Worksheet) -> int:
    """Return max(id) + 1 across all rows, or 1 if empty."""
    records = ws.get_all_records()
    if not records:
        return 1
    ids = [int(r.get("id", 0)) for r in records if str(r.get("id", "")).isdigit()]
    return max(ids, default=0) + 1


def _find_row_index(ws: gspread.Worksheet, col_name: str, value: Any) -> Optional[int]:
    """Return 1-based row index (including header) or None."""
    headers = ws.row_values(1)
    if col_name not in headers:
        return None
    col_idx = headers.index(col_name) + 1
    col_values = ws.col_values(col_idx)
    for i, v in enumerate(col_values):
        if i == 0:
            continue  # skip header
        if str(v) == str(value):
            return i + 1  # 1-based
    return None


def _row_to_dict(headers: List[str], row: List[str]) -> Dict[str, str]:
    d = {}
    for i, h in enumerate(headers):
        d[h] = row[i] if i < len(row) else ""
    return d


# ---------------------------------------------------------------------------
# Employees
# ---------------------------------------------------------------------------

class EmployeeSheet:
    @staticmethod
    def all(search: str = "", department: str = "", branch: str = "") -> List[dict]:
        ws = get_sheet("employees")
        records = ws.get_all_records()
        result = []
        for r in records:
            if search and search.lower() not in r["name"].lower() and search not in r["phone"]:
                continue
            if department and r.get("department", "").lower() != department.lower():
                continue
            if branch and r.get("branch", "").lower() != branch.lower():
                continue
            result.append(dict(r))
        return sorted(result, key=lambda x: x.get("name", ""))

    @staticmethod
    def get_by_id(emp_id: int) -> Optional[dict]:
        ws = get_sheet("employees")
        for r in ws.get_all_records():
            if str(r.get("id")) == str(emp_id):
                return dict(r)
        return None

    @staticmethod
    def get_by_phone(phone: str) -> Optional[dict]:
        ws = get_sheet("employees")
        for r in ws.get_all_records():
            if str(r.get("phone", "")).strip() == str(phone).strip():
                return dict(r)
        return None

    @staticmethod
    def create(name: str, phone: str, role: str, department: str, branch: str, designation: str) -> dict:
        ws = get_sheet("employees")
        # Check duplicate phone
        if EmployeeSheet.get_by_phone(phone):
            raise ValueError("Phone number already registered")
        new_id = _next_id(ws)
        row = [new_id, name, phone, role, department or "", branch or "", designation or "", now_iso()]
        ws.append_row(row)
        return {"id": new_id, "name": name, "phone": phone, "role": role,
                "department": department, "branch": branch, "designation": designation}

    @staticmethod
    def update(emp_id: int, fields: dict) -> Optional[dict]:
        ws = get_sheet("employees")
        headers = ws.row_values(1)
        row_idx = _find_row_index(ws, "id", emp_id)
        if not row_idx:
            return None
        row = ws.row_values(row_idx)
        rec = _row_to_dict(headers, row)
        rec.update(fields)
        ws.update(f"A{row_idx}", [[rec.get(h, "") for h in headers]])
        return rec

    @staticmethod
    def delete(emp_id: int) -> bool:
        ws = get_sheet("employees")
        row_idx = _find_row_index(ws, "id", emp_id)
        if not row_idx:
            return False
        ws.delete_rows(row_idx)
        return True


# ---------------------------------------------------------------------------
# Attendance
# ---------------------------------------------------------------------------

class AttendanceSheet:
    @staticmethod
    def add(emp_id: int, emp_name: str, punch_type: str, timestamp: str,
            lat: float, lng: float, status: str, distance: float) -> dict:
        ws = get_sheet("attendance")
        new_id = _next_id(ws)
        row = [new_id, emp_id, emp_name, punch_type, timestamp,
               round(lat, 6), round(lng, 6), status, round(distance, 1)]
        ws.append_row(row)
        return {
            "id": new_id, "emp_id": emp_id, "emp_name": emp_name,
            "punch_type": punch_type, "timestamp": timestamp,
            "lat": lat, "lng": lng, "status": status, "distance_from_office": distance
        }

    @staticmethod
    def for_employee_today(emp_id: int) -> List[dict]:
        settings = SettingsSheet.get_all()
        today = today_iso(settings)
        ws = get_sheet("attendance")
        return [
            dict(r) for r in ws.get_all_records()
            if str(r.get("emp_id")) == str(emp_id)
            and local_date_from_timestamp(str(r.get("timestamp", "")), settings) == today
        ]

    @staticmethod
    def for_employee_month(emp_id: int, year: int, month: int) -> List[dict]:
        settings = SettingsSheet.get_all()
        ws = get_sheet("attendance")
        result = []
        for r in ws.get_all_records():
            if str(r.get("emp_id")) != str(emp_id):
                continue
            ts = str(r.get("timestamp", ""))
            if not ts:
                continue
            try:
                local_dt = parse_timestamp(ts, settings)
                if local_dt.year == year and local_dt.month == month:
                    result.append(dict(r))
            except ValueError:
                continue
        return result

    @staticmethod
    def for_date(date_str: str) -> List[dict]:
        settings = SettingsSheet.get_all()
        ws = get_sheet("attendance")
        return [
            dict(r) for r in ws.get_all_records()
            if local_date_from_timestamp(str(r.get("timestamp", "")), settings) == date_str
        ]

    @staticmethod
    def for_employee_date(emp_id: int, date_str: str) -> List[dict]:
        settings = SettingsSheet.get_all()
        ws = get_sheet("attendance")
        return [
            dict(r) for r in ws.get_all_records()
            if str(r.get("emp_id")) == str(emp_id)
            and local_date_from_timestamp(str(r.get("timestamp", "")), settings) == date_str
        ]


# ---------------------------------------------------------------------------
# Settings
# ---------------------------------------------------------------------------

class SettingsSheet:
    @staticmethod
    def get_all() -> dict:
        ws = get_sheet("settings")
        records = ws.get_all_records()
        result = {}
        for r in records:
            result[r["key"]] = r["value"]
        return result

    @staticmethod
    def get(key: str, default: str = "") -> str:
        return SettingsSheet.get_all().get(key, default)

    @staticmethod
    def set(key: str, value: str):
        ws = get_sheet("settings")
        row_idx = _find_row_index(ws, "key", key)
        if row_idx:
            ws.update_cell(row_idx, 2, value)
        else:
            ws.append_row([key, value])

    @staticmethod
    def update_many(updates: dict):
        """Batch update multiple settings keys."""
        ws = get_sheet("settings")
        records = ws.get_all_records()
        existing = {r["key"]: idx + 2 for idx, r in enumerate(records)}  # +2 = header offset
        for key, value in updates.items():
            str_val = str(value)
            if key in existing:
                ws.update_cell(existing[key], 2, str_val)
            else:
                ws.append_row([key, str_val])


# ---------------------------------------------------------------------------
# Branches
# ---------------------------------------------------------------------------

def _branch_row(branch_id: int, name: str, rules: dict) -> list:
    return [
        branch_id,
        name,
        rules.get("office_lat", ""),
        rules.get("office_lng", ""),
        rules.get("radius_meters", "100"),
        rules.get("shift_start", "09:00"),
        rules.get("shift_end", "18:00"),
        rules.get("standard_shift_hours", "9"),
        rules.get("working_days", '["Mon","Tue","Wed","Thu","Fri","Sat"]'),
        rules.get("wifi_ip", ""),
        rules.get("wifi_lock_enabled", "0"),
        rules.get("late_policy_type", "office"),
        rules.get("late_grace_minutes", "15"),
        rules.get("late_monthly_allowance", "6"),
    ]


def _migrate_branch_late_policies():
    ws = get_sheet("branches")
    headers = ws.row_values(1)
    if "late_policy_type" not in headers:
        return
    policy_col = headers.index("late_policy_type") + 1
    grace_col = headers.index("late_grace_minutes") + 1
    allowance_col = headers.index("late_monthly_allowance") + 1
    for idx, r in enumerate(ws.get_all_records(), start=2):
        name = str(r.get("name", "")).lower()
        if str(r.get("late_policy_type", "")).strip():
            continue
        if name == "salon":
            ws.update_cell(idx, policy_col, "salon")
            ws.update_cell(idx, grace_col, "0")
            ws.update_cell(idx, allowance_col, "0")
        else:
            ws.update_cell(idx, policy_col, "office")
            ws.update_cell(idx, grace_col, "15")
            ws.update_cell(idx, allowance_col, "6")


def _ensure_default_branches():
    ws = get_sheet("branches")
    records = [dict(r) for r in ws.get_all_records()]
    names = {r.get("name", "").lower() for r in records}
    global_rules = rules_from_global(SettingsSheet.get_all())

    presets = [
        ("Back Office", DEFAULT_BACK_OFFICE_RULES),
        ("Salon", DEFAULT_SALON_RULES),
    ]
    for name, rules in presets:
        if name.lower() not in names:
            new_id = _next_id(ws)
            merged = {**global_rules, **rules}
            ws.append_row(_branch_row(new_id, name, merged))
            names.add(name.lower())

    # Remove legacy Head Office if Back Office exists
    if "back office" in names and "head office" in names:
        for r in records:
            if r.get("name", "").lower() == "head office":
                row_idx = _find_row_index(ws, "id", r.get("id"))
                if row_idx:
                    ws.delete_rows(row_idx)
                break


def _migrate_head_office_employees():
    emp_ws = get_sheet("employees")
    headers = emp_ws.row_values(1)
    if "branch" not in headers:
        return
    branch_col = headers.index("branch") + 1
    records = emp_ws.get_all_records()
    for idx, r in enumerate(records, start=2):
        if str(r.get("branch", "")).strip().lower() == "head office":
            emp_ws.update_cell(idx, branch_col, "Back Office")


class BranchSheet:
    @staticmethod
    def all() -> List[dict]:
        ws = get_sheet("branches")
        return [serialize_branch(dict(r)) for r in ws.get_all_records()]

    @staticmethod
    def get_by_id(branch_id: int) -> Optional[dict]:
        for b in BranchSheet.all():
            if str(b.get("id")) == str(branch_id):
                return b
        return None

    @staticmethod
    def get_by_name(name: str) -> Optional[dict]:
        for b in BranchSheet.all():
            if b["name"].lower() == name.lower():
                return b
        return None

    @staticmethod
    def create(name: str) -> dict:
        if BranchSheet.get_by_name(name):
            raise ValueError("Branch already exists")
        ws = get_sheet("branches")
        new_id = _next_id(ws)
        rules = rules_from_global(SettingsSheet.get_all())
        ws.append_row(_branch_row(new_id, name, rules))
        return serialize_branch({"id": new_id, "name": name, **rules})

    @staticmethod
    def update(branch_id: int, fields: dict) -> Optional[dict]:
        ws = get_sheet("branches")
        headers = ws.row_values(1)
        row_idx = _find_row_index(ws, "id", branch_id)
        if not row_idx:
            return None
        row = ws.row_values(row_idx)
        rec = _row_to_dict(headers, row)
        updates = {k: v for k, v in fields.items() if k in headers and k not in ("id",)}
        if "working_days" in updates and isinstance(updates["working_days"], list):
            updates["working_days"] = json.dumps(updates["working_days"])
        rec.update(updates)
        ws.update(f"A{row_idx}", [[rec.get(h, "") for h in headers]])
        return serialize_branch(rec)

    @staticmethod
    def delete(branch_id: int) -> bool:
        ws = get_sheet("branches")
        row_idx = _find_row_index(ws, "id", branch_id)
        if not row_idx:
            return False
        ws.delete_rows(row_idx)
        return True


# ---------------------------------------------------------------------------
# Departments
# ---------------------------------------------------------------------------

class DeptSheet:
    @staticmethod
    def all() -> List[dict]:
        ws = get_sheet("departments")
        return [dict(r) for r in ws.get_all_records()]

    @staticmethod
    def get_by_name(name: str) -> Optional[dict]:
        for d in DeptSheet.all():
            if d["name"].lower() == name.lower():
                return d
        return None

    @staticmethod
    def create(name: str) -> dict:
        if DeptSheet.get_by_name(name):
            raise ValueError("Department already exists")
        ws = get_sheet("departments")
        new_id = _next_id(ws)
        ws.append_row([new_id, name])
        return {"id": new_id, "name": name}

    @staticmethod
    def delete(dept_id: int) -> bool:
        ws = get_sheet("departments")
        row_idx = _find_row_index(ws, "id", dept_id)
        if not row_idx:
            return False
        ws.delete_rows(row_idx)
        return True


# ---------------------------------------------------------------------------
# Notes
# ---------------------------------------------------------------------------

class NoteSheet:
    @staticmethod
    def all(limit: int = 50) -> List[dict]:
        ws = get_sheet("notes")
        records = ws.get_all_records()
        return sorted(records, key=lambda r: r.get("date", ""), reverse=True)[:limit]

    @staticmethod
    def for_date(date_str: str) -> Optional[dict]:
        ws = get_sheet("notes")
        matches = [r for r in ws.get_all_records() if str(r.get("date", "")) == date_str]
        return dict(matches[-1]) if matches else None

    @staticmethod
    def create(content: str, posted_by: str, note_date: str) -> dict:
        ws = get_sheet("notes")
        new_id = _next_id(ws)
        now = now_iso()
        ws.append_row([new_id, content, posted_by, note_date, now])
        return {"id": new_id, "content": content, "posted_by": posted_by, "date": note_date, "created_at": now}

    @staticmethod
    def delete(note_id: int) -> bool:
        ws = get_sheet("notes")
        row_idx = _find_row_index(ws, "id", note_id)
        if not row_idx:
            return False
        ws.delete_rows(row_idx)
        return True


# ---------------------------------------------------------------------------
# Holidays (HR assigns all staff or selected individuals — no tags)
# ---------------------------------------------------------------------------

class HolidaySheet:
    @staticmethod
    def _serialize(record: dict, employees: list[dict] | None = None) -> dict:
        from utils.holiday_utils import serialize_holiday
        return serialize_holiday(dict(record), employees)

    @staticmethod
    def all(month: str = "", employees: list[dict] | None = None) -> List[dict]:
        ws = get_sheet("holidays")
        records = ws.get_all_records()
        if month:
            records = [r for r in records if str(r.get("month", "")) == month]
        return [HolidaySheet._serialize(r, employees) for r in records]

    @staticmethod
    def get_by_id(holiday_id: int, employees: list[dict] | None = None) -> Optional[dict]:
        for h in HolidaySheet.all(employees=employees):
            if str(h.get("id")) == str(holiday_id):
                return h
        return None

    @staticmethod
    def for_employee_month(emp_id: int, year: int, month: int) -> dict[str, dict]:
        month_key = f"{year}-{month:02d}"
        from utils.holiday_utils import holiday_applies_to_employee
        result: dict[str, dict] = {}
        for h in HolidaySheet.all(month=month_key):
            date_str = str(h.get("date", ""))
            if not date_str.startswith(month_key):
                continue
            if holiday_applies_to_employee(h, emp_id):
                result[date_str] = h
        return result

    @staticmethod
    def create(name: str, date_str: str, scope: str, emp_ids: list[int], created_by: str) -> dict:
        ws = get_sheet("holidays")
        new_id = _next_id(ws)
        month = date_str[:7] if len(date_str) >= 7 else ""
        scope = scope if scope in ("all", "selected") else "all"
        ids_json = json.dumps([int(x) for x in emp_ids]) if scope == "selected" else "[]"
        now = now_iso()
        ws.append_row([new_id, name, month, date_str, scope, ids_json, now, created_by])
        return HolidaySheet.get_by_id(new_id) or {
            "id": new_id, "name": name, "month": month, "date": date_str,
            "scope": scope, "emp_ids": parse_emp_ids_local(ids_json),
            "created_at": now, "created_by": created_by,
        }

    @staticmethod
    def update(holiday_id: int, fields: dict) -> Optional[dict]:
        ws = get_sheet("holidays")
        headers = ws.row_values(1)
        row_idx = _find_row_index(ws, "id", holiday_id)
        if not row_idx:
            return None
        row = ws.row_values(row_idx)
        rec = _row_to_dict(headers, row)
        updates = {k: v for k, v in fields.items() if k in headers and k != "id"}
        if "emp_ids" in updates and isinstance(updates["emp_ids"], list):
            updates["emp_ids"] = json.dumps([int(x) for x in updates["emp_ids"]])
        if "date" in updates:
            updates["month"] = str(updates["date"])[:7]
        rec.update(updates)
        ws.update(f"A{row_idx}", [[rec.get(h, "") for h in headers]])
        return HolidaySheet.get_by_id(holiday_id)

    @staticmethod
    def delete(holiday_id: int) -> bool:
        ws = get_sheet("holidays")
        row_idx = _find_row_index(ws, "id", holiday_id)
        if not row_idx:
            return False
        ws.delete_rows(row_idx)
        return True


def parse_emp_ids_local(raw) -> list[int]:
    from utils.holiday_utils import parse_emp_ids
    return parse_emp_ids(raw)


# ---------------------------------------------------------------------------
# Reports metadata
# ---------------------------------------------------------------------------

class ReportSheet:
    @staticmethod
    def all() -> List[dict]:
        ws = get_sheet("reports")
        return sorted(ws.get_all_records(), key=lambda r: r.get("generated_at", ""), reverse=True)

    @staticmethod
    def create(name: str, rtype: str, month: str, branch: str, department: str, file_path: str) -> dict:
        ws = get_sheet("reports")
        new_id = _next_id(ws)
        now = now_iso()
        ws.append_row([new_id, name, rtype, month, branch, department, now, file_path])
        return {"id": new_id, "name": name, "type": rtype, "month": month,
                "branch": branch, "department": department, "generated_at": now, "file_path": file_path}

    @staticmethod
    def get_by_id(report_id: int) -> Optional[dict]:
        ws = get_sheet("reports")
        for r in ws.get_all_records():
            if str(r.get("id")) == str(report_id):
                return dict(r)
        return None

    @staticmethod
    def delete(report_id: int) -> bool:
        ws = get_sheet("reports")
        row_idx = _find_row_index(ws, "id", report_id)
        if not row_idx:
            return False
        ws.delete_rows(row_idx)
        return True
