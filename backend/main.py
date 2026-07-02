from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager
from datetime import datetime
from utils.datetime_utils import now_iso
from routers import auth, employees, attendance, settings, reports, notes, holidays
from models.sheets import init_sheets, get_datastore_info, SettingsSheet

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
    return JSONResponse(status_code=500, content={"detail": str(exc)})

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

@app.get("/api/health")
def health():
    info = get_datastore_info()
    sheet_id = info.get("spreadsheet_id")
    connected = info.get("type") == "google_sheets" and not info.get("connection_error")
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
            f"Share your spreadsheet with {info.get('service_account_email')} as Editor"
            if info.get("connection_error") and info.get("service_account_email")
            else (
                "Fix Vercel env: delete GOOGLE_SHEETS_CREDS_JSON and set "
                "GOOGLE_SHEETS_CREDS_B64 instead (run print_creds_oneline.py --base64)"
                if info.get("connection_error") and "invalid JSON" in str(info.get("connection_error", ""))
                else (
                    "Set GOOGLE_SHEETS_CREDS_B64 or a valid one-line GOOGLE_SHEETS_CREDS_JSON on Vercel"
                    if info.get("connection_error")
                    else None
                )
            )
        ),
    }
