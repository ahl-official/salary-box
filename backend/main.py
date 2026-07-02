from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from datetime import datetime
from utils.datetime_utils import now_iso
from routers import auth, employees, attendance, settings, reports, notes, holidays
from models.sheets import init_sheets, get_datastore_info, SettingsSheet

@asynccontextmanager
async def lifespan(app: FastAPI):
    init_sheets()
    yield

app = FastAPI(title="Attendance System API", lifespan=lifespan)

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
    s = SettingsSheet.get_all()
    return {
        "status": "ok",
        "timestamp": now_iso(s),
        "timezone": s.get("timezone", "Asia/Kolkata"),
        **get_datastore_info(),
    }
