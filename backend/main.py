from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager
from datetime import datetime
from utils.datetime_utils import now_iso
from routers import auth, employees, attendance, settings, reports, notes, holidays, leaves
from models.sheets import init_sheets, get_datastore_info, SettingsSheet
from models.apps_script_client import AppsScriptError

@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        init_sheets()
    except Exception as exc:
        print(f"init_sheets failed: {exc}")
    yield

app = FastAPI(title="Attendance System API", lifespan=lifespan)

@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    if isinstance(exc, AppsScriptError):
        return JSONResponse(
            status_code=503,
            content={"detail": f"Apps Script unavailable: {exc}"},
        )
    detail = str(exc)
    if "429" in detail and "sheets.googleapis.com" in detail:
        return JSONResponse(
            status_code=503,
            content={
                "detail": (
                    "Google Sheets API quota exceeded. "
                    "Remove GOOGLE_SHEETS_CREDS_B64 from Vercel and use APPS_SCRIPT_URL + APPS_SCRIPT_SECRET."
                )
            },
        )
    return JSONResponse(status_code=500, content={"detail": detail})

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router,       prefix="/api/auth",       tags=["auth"])
app.include_router(employees.router,  prefix="/api/employees",  tags=["employees"])
app.include_router(attendance.router, prefix="/api/attendance", tags=["attendance"])
app.include_router(settings.router,   prefix="/api/settings",   tags=["settings"])
app.include_router(reports.router,    prefix="/api/reports",    tags=["reports"])
app.include_router(notes.router,      prefix="/api/notes",      tags=["notes"])
app.include_router(holidays.router,   prefix="/api/holidays",   tags=["holidays"])
app.include_router(leaves.router,     prefix="/api/leaves",     tags=["leaves"])

@app.get("/api/health")
def health():
    info = get_datastore_info()
    sheet_id = info.get("spreadsheet_id")
    connected = info.get("type") in ("google_sheets", "apps_script") and not info.get("connection_error")
    if connected:
        s = SettingsSheet.get_all()
        timestamp = now_iso(s)
        timezone = s.get("timezone", "Asia/Kolkata")
    else:
        timestamp = now_iso({})
        timezone = "Asia/Kolkata"
    return {
        "status": "ok" if connected else "degraded",
        "timestamp": timestamp,
        "timezone": timezone,
        **info,
        "spreadsheet_url": f"https://docs.google.com/spreadsheets/d/{sheet_id}/edit" if sheet_id else None,
        "setup_hint": (
            "Deploy Apps Script from apps-script/ and set APPS_SCRIPT_URL + APPS_SCRIPT_SECRET on Vercel. "
            "Then delete GOOGLE_SHEETS_CREDS_B64."
            if info.get("type") == "disconnected" and not info.get("connection_error")
            else (
                f"Apps Script error: {info.get('connection_error')}"
                if info.get("type") == "disconnected" and info.get("connection_error")
                else (
                    f"Share your spreadsheet with {info.get('service_account_email')} as Editor"
                    if info.get("connection_error") and info.get("service_account_email")
                    else (
                        "Set APPS_SCRIPT_URL + APPS_SCRIPT_SECRET on Vercel (deploy apps-script/ to Google Sheets)"
                        if info.get("connection_error")
                        else None
                    )
                )
            )
        ),
    }
