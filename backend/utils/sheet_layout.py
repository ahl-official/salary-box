"""
Format and organize the Google Spreadsheet into a clean, systematic layout.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    import gspread

SHEETS_LAYOUT_VERSION = "2"

TAB_ORDER = [
    "README",
    "employees",
    "attendance",
    "branches",
    "departments",
    "settings",
    "holidays",
    "leave_requests",
    "notes",
    "reports",
]

README_ROWS = [
    ["Salary Box — Attendance Database"],
    [""],
    ["This spreadsheet is the live database for the attendance app."],
    ["Do not rename tabs or header rows — the app depends on them."],
    [""],
    ["Tab", "What it stores"],
    ["employees", "Staff directory — name, phone, role, branch, department"],
    ["attendance", "Every punch in/out — timestamp, GPS, distance from office"],
    ["branches", "Per-branch rules — geofence, shift times, late policy"],
    ["departments", "Department list"],
    ["settings", "Company-wide settings (key / value pairs)"],
    ["holidays", "HR-assigned holidays — all staff or selected employees"],
    ["leave_requests", "Employee leave applications — pending HR approval"],
    ["notes", "Daily office notes shown to employees"],
    ["reports", "Generated Excel report history"],
    [""],
    ["Timezone", "Asia/Kolkata (IST)"],
    ["App URL", "https://salarybox-alpha.vercel.app"],
]

HEADER_FORMAT = {
    "backgroundColor": {"red": 0.12, "green": 0.16, "blue": 0.22},
    "textFormat": {"bold": True, "foregroundColor": {"red": 1, "green": 1, "blue": 1}},
    "horizontalAlignment": "CENTER",
}

README_TITLE_FORMAT = {
    "textFormat": {"bold": True, "fontSize": 14},
}

README_HEADER_FORMAT = {
    "backgroundColor": {"red": 0.0, "green": 0.55, "blue": 0.42},
    "textFormat": {"bold": True, "foregroundColor": {"red": 1, "green": 1, "blue": 1}},
}


def _col_letter(n: int) -> str:
  """1-based column index to letter(s)."""
  result = ""
  while n:
    n, rem = divmod(n - 1, 26)
    result = chr(65 + rem) + result
  return result


def _format_data_tab(ws: "gspread.Worksheet", num_cols: int):
    if num_cols < 1:
        return
    end = _col_letter(num_cols)
    ws.freeze(rows=1)
    ws.format(f"A1:{end}1", HEADER_FORMAT)


def organize_spreadsheet(ss: "gspread.Spreadsheet", sheet_headers: dict):
    """Create README tab, format headers, and order tabs."""
    from models.sheets import SettingsSheet, get_sheet

    # README guide tab
    try:
        readme = ss.worksheet("README")
    except Exception:
        readme = ss.add_worksheet(title="README", rows=30, cols=4)

    readme.clear()
    readme.append_rows(README_ROWS, value_input_option="USER_ENTERED")
    readme.format("A1", README_TITLE_FORMAT)
    readme.format("A6:B6", README_HEADER_FORMAT)
    readme.freeze(rows=6)

    # Format each data tab
    for tab, headers in sheet_headers.items():
        try:
            ws = ss.worksheet(tab)
        except Exception:
            continue
        current_headers = ws.row_values(1)
        if current_headers != headers:
            ws.update("A1", [headers], value_input_option="USER_ENTERED")
        _format_data_tab(ws, len(headers))

    # Reorder tabs: README first, then data tabs, then anything else
    worksheets = {ws.title: ws for ws in ss.worksheets()}
    ordered = []
    for title in TAB_ORDER:
        if title in worksheets:
            ordered.append(worksheets[title])
    for ws in ss.worksheets():
        if ws.title not in TAB_ORDER:
            ordered.append(ws)
    if ordered:
        ss.reorder_worksheets(ordered)

    # Remove blank default sheet if present and unused
    for ws in ss.worksheets():
        if ws.title in ("Sheet1", "Sheet 1") and ws.row_count <= 1 and not ws.get_all_values():
            try:
                ss.del_worksheet(ws)
            except Exception:
                pass

    settings = SettingsSheet.get_all()
    if settings.get("sheets_layout_version") != SHEETS_LAYOUT_VERSION:
        ws = get_sheet("settings")
        headers = ws.row_values(1)
        if "key" in headers and "value" in headers:
            key_col = headers.index("key") + 1
            val_col = headers.index("value") + 1
            records = ws.get_all_records()
            if not any(r.get("key") == "sheets_layout_version" for r in records):
                ws.append_row(["sheets_layout_version", SHEETS_LAYOUT_VERSION])
            else:
                for i, r in enumerate(records, start=2):
                    if r.get("key") == "sheets_layout_version":
                        ws.update_cell(i, val_col, SHEETS_LAYOUT_VERSION)
                        break
