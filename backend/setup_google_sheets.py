"""
Check Google Sheets database connection and migrate local data if ready.

Usage (from backend/):
  .venv\\Scripts\\python.exe setup_google_sheets.py
  .venv\\Scripts\\python.exe setup_google_sheets.py --migrate
"""

import argparse
import json
import sys
from pathlib import Path

from models.sheets import (
    SHEET_HEADERS,
    _resolve_creds_raw,
    _resolve_spreadsheet_id,
    _using_local_store,
    get_spreadsheet,
    init_sheets,
)
from utils.sheet_layout import organize_spreadsheet

BACKEND_DIR = Path(__file__).resolve().parent
CREDS_FILE = BACKEND_DIR / "service_account.json"
LOCAL_DB = BACKEND_DIR / "local_data.json"
SHEET_URL = "https://docs.google.com/spreadsheets/d/{id}/edit"


def check_connection() -> int:
    sheet_id = _resolve_spreadsheet_id()
    creds_path = _resolve_creds_raw()

    print("Google Sheets database setup")
    print("=" * 40)
    print(f"Spreadsheet ID : {sheet_id}")
    print(f"Spreadsheet URL: {SHEET_URL.format(id=sheet_id)}")
    print(f"Credentials    : {creds_path or 'NOT FOUND'}")
    print()

    if not CREDS_FILE.exists():
        print("Missing: backend/service_account.json")
        print()
        print("To link Google Sheets as your database:")
        print("  1. Go to https://console.cloud.google.com/")
        print("  2. Enable Google Sheets API + Google Drive API")
        print("  3. Create a Service Account and download the JSON key")
        print(f"  4. Save it as: {CREDS_FILE}")
        print("  5. Open your spreadsheet -> Share -> add the service account")
        print("     email from the JSON file with Editor access")
        print("  6. Run: .venv\\Scripts\\python.exe setup_google_sheets.py --migrate")
        print("  7. Restart the backend")
        return 1

    try:
        with open(CREDS_FILE, encoding="utf-8") as f:
            info = json.load(f)
        email = info.get("client_email", "")
        print(f"Service account: {email}")
        print()
        print("Share your spreadsheet with this email (Editor access).")
        print()

        if _using_local_store():
            print("Credentials file found but not loaded. Check backend/.env")
            return 1

        ss = get_spreadsheet()
        print(f"Connected to: {ss.title}")
        init_sheets()
        tabs = [ws.title for ws in ss.worksheets()]
        print(f"Tabs ready   : {', '.join(tabs)}")
        print()
        print("Google Sheets is linked and ready as the database.")
        return 0
    except Exception as exc:
        print(f"Connection failed: {exc}")
        print()
        print("Common fixes:")
        print("  - Share the spreadsheet with the service account email")
        print("  - Enable Google Sheets API and Google Drive API in Google Cloud")
        return 1


def migrate_local_data() -> int:
    if check_connection() != 0:
        return 1

    if not LOCAL_DB.exists():
        print(f"No local data at {LOCAL_DB}")
        return 1

    with open(LOCAL_DB, encoding="utf-8") as f:
        local = json.load(f)

    ss = get_spreadsheet()
    print()
    print("Migrating local_data.json to Google Sheets...")

    for tab, headers in SHEET_HEADERS.items():
        rows = local.get(tab, [])
        data_rows = rows[1:] if rows and rows[0] == headers else rows
        if not data_rows:
            print(f"  {tab}: skip (empty)")
            continue
        try:
            ws = ss.worksheet(tab)
        except Exception:
            ws = ss.add_worksheet(title=tab, rows=max(len(data_rows) + 5, 100), cols=len(headers) + 2)
        ws.clear()
        ws.append_row(headers)
        ws.append_rows(data_rows, value_input_option="USER_ENTERED")
        print(f"  {tab}: {len(data_rows)} row(s)")

    print()
    print("Done. Restart the backend — all new data will save to Google Sheets.")
    return 0


def organize_only() -> int:
    if _using_local_store():
        print("Google Sheets credentials not configured.")
        return 1
    try:
        ss = get_spreadsheet()
        init_sheets()
        organize_spreadsheet(ss, SHEET_HEADERS)
        print("Spreadsheet organized: README tab, headers formatted, tabs ordered.")
        print(SHEET_URL.format(id=_resolve_spreadsheet_id()))
        return 0
    except Exception as exc:
        print(f"Organize failed: {exc}")
        return 1


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--migrate", action="store_true", help="Upload local_data.json to Google Sheets")
    parser.add_argument("--organize", action="store_true", help="Format tabs and add README guide")
    args = parser.parse_args()
    if args.migrate:
        return migrate_local_data()
    if args.organize:
        return organize_only()
    return check_connection()


if __name__ == "__main__":
    raise SystemExit(main())
