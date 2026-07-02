"""
Upload local_data.json into the configured Google Spreadsheet.

Usage (from backend/):
  .venv\\Scripts\\python.exe migrate_to_sheets.py
"""

import json
from pathlib import Path

from models.sheets import (
    SHEET_HEADERS,
    _using_local_store,
    _resolve_spreadsheet_id,
    get_spreadsheet,
    init_sheets,
)

LOCAL_DB_PATH = Path(__file__).resolve().parent / "local_data.json"


def migrate():
    if _using_local_store():
        print("Google Sheets is not configured yet.")
        print("1. Download a service-account JSON from Google Cloud")
        print("2. Save it as backend/service_account.json")
        print("3. Share your spreadsheet with the service account email (Editor)")
        print(f"   Spreadsheet ID: {_resolve_spreadsheet_id()}")
        return 1

    if not LOCAL_DB_PATH.exists():
        print(f"No local data found at {LOCAL_DB_PATH}")
        return 1

    with open(LOCAL_DB_PATH, encoding="utf-8") as f:
        local = json.load(f)

    print(f"Migrating to Google Sheet: {_resolve_spreadsheet_id()}")
    init_sheets()
    ss = get_spreadsheet()

    for tab, headers in SHEET_HEADERS.items():
        rows = local.get(tab, [])
        data_rows = rows[1:] if rows and rows[0] == headers else rows
        if not data_rows:
            print(f"  {tab}: nothing to migrate")
            continue

        try:
            ws = ss.worksheet(tab)
        except Exception:
            ws = ss.add_worksheet(title=tab, rows=max(len(data_rows) + 5, 100), cols=len(headers) + 2)
        ws.clear()
        ws.append_row(headers)
        ws.append_rows(data_rows, value_input_option="USER_ENTERED")
        print(f"  {tab}: migrated {len(data_rows)} row(s)")

    print("Migration complete. Restart the backend to use Google Sheets.")
    return 0


if __name__ == "__main__":
    raise SystemExit(migrate())
