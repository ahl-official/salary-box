from fastapi import APIRouter, HTTPException, Depends, Request
from pydantic import BaseModel
from typing import Optional
import math
from datetime import datetime
from models.sheets import AttendanceSheet, SettingsSheet, EmployeeSheet, BranchSheet, HolidaySheet
from utils.holiday_utils import holiday_on_date
from utils.datetime_utils import now_iso, parse_timestamp
from utils.shift_utils import shift_duration_hours, overtime_hours, regular_hours, is_week_off
from utils.branch_settings import effective_settings
from utils.late_policy import (
    evaluate_punch_in_late,
    build_monthly_late_summary,
    late_message_for_punch,
    get_late_policy,
)
from utils.auth import get_current_user, require_admin

router = APIRouter()

def haversine(lat1, lon1, lat2, lon2):
    R = 6371000
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi/2)**2 + math.cos(phi1)*math.cos(phi2)*math.sin(dlambda/2)**2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))

def _employee_settings(emp: dict, global_settings: dict) -> dict:
    branch = BranchSheet.get_by_name(emp.get("branch", "")) if emp.get("branch") else None
    return effective_settings(global_settings, branch)

def _day_late_info(punch_in, settings: dict, year: int, month: int, month_punches: list) -> dict:
    if not punch_in:
        return {
            "is_late": False,
            "late_minutes": 0,
            "half_day_deduction": False,
            "forgiven": False,
            "late_day_number": None,
        }
    ts = punch_in["timestamp"] if isinstance(punch_in, dict) else punch_in
    summary = build_monthly_late_summary(month_punches, settings, year, month)
    day_key = parse_timestamp(ts, settings).date().isoformat()
    day_detail = summary["days"].get(day_key)
    if day_detail:
        return day_detail
    late_info = evaluate_punch_in_late(ts, settings)
    return {
        "is_late": late_info["is_late"],
        "late_minutes": late_info["late_minutes"],
        "half_day_deduction": False,
        "forgiven": False,
        "late_day_number": None,
    }

class PunchRequest(BaseModel):
    punch_type: str          # 'in' or 'out'
    lat: float
    lng: float
    accuracy: Optional[float] = None
    is_mock: Optional[bool] = False

@router.post("/punch")
def punch(req: PunchRequest, request: Request, current_user: dict = Depends(get_current_user)):
    if req.is_mock:
        raise HTTPException(status_code=400, detail="Mock/fake GPS detected. Punch rejected.")

    global_s = SettingsSheet.get_all()
    s = _employee_settings(current_user, global_s)
    office_lat = float(s.get("office_lat", 19.06996))
    office_lng = float(s.get("office_lng", 72.83748))
    radius = int(s.get("radius_meters", 100))

    if s.get("wifi_lock_enabled") == "1":
        client_ip = request.client.host
        if s.get("wifi_ip") and client_ip != s["wifi_ip"]:
            raise HTTPException(status_code=400, detail=f"Not on office WiFi. Your IP: {client_ip}")

    distance = haversine(req.lat, req.lng, office_lat, office_lng)
    if distance > radius:
        raise HTTPException(
            status_code=400,
            detail=f"Outside office radius. You are {int(distance)}m away (allowed: {radius}m)."
        )

    today_punches = AttendanceSheet.for_employee_today(current_user["id"])
    ins  = [p for p in today_punches if p["punch_type"] == "in"]
    outs = [p for p in today_punches if p["punch_type"] == "out"]

    if req.punch_type == "in" and len(ins) > len(outs):
        raise HTTPException(status_code=400, detail="Already punched in. Punch out first.")
    if req.punch_type == "out" and len(outs) >= len(ins):
        raise HTTPException(status_code=400, detail="No active punch-in found.")

    now = now_iso(s)
    record = AttendanceSheet.add(
        emp_id=current_user["id"],
        emp_name=current_user["name"],
        punch_type=req.punch_type,
        timestamp=now,
        lat=req.lat,
        lng=req.lng,
        status="approved",
        distance=round(distance, 1),
    )

    late_payload = None
    if req.punch_type == "in":
        punch_dt = parse_timestamp(now, s)
        month_punches = AttendanceSheet.for_employee_month(
            current_user["id"], punch_dt.year, punch_dt.month
        )
        late_info = evaluate_punch_in_late(now, s)
        summary = build_monthly_late_summary(month_punches, s, punch_dt.year, punch_dt.month)
        day_key = punch_dt.date().isoformat()
        day_detail = summary["days"].get(day_key, {})
        message = late_message_for_punch(now, s, month_punches, punch_dt.year, punch_dt.month)
        late_payload = {
            **late_info,
            "half_day_deduction": day_detail.get("half_day_deduction", False),
            "forgiven": day_detail.get("forgiven", False),
            "late_day_number": day_detail.get("late_day_number"),
            "message": message,
        }

    return {
        "success": True,
        "punch": record,
        "distance": round(distance, 1),
        "late": late_payload,
    }

@router.get("/today")
def today_status(current_user: dict = Depends(get_current_user)):
    global_s = SettingsSheet.get_all()
    s = _employee_settings(current_user, global_s)
    punches = AttendanceSheet.for_employee_today(current_user["id"])
    punches.sort(key=lambda p: p["timestamp"])
    punch_in  = next((p for p in punches if p["punch_type"] == "in"),  None)
    punch_out = next((p for p in punches if p["punch_type"] == "out"), None)

    late_today = None
    if punch_in:
        punch_dt = parse_timestamp(punch_in["timestamp"], s)
        month_punches = AttendanceSheet.for_employee_month(
            current_user["id"], punch_dt.year, punch_dt.month
        )
        late_info = evaluate_punch_in_late(punch_in["timestamp"], s)
        summary = build_monthly_late_summary(month_punches, s, punch_dt.year, punch_dt.month)
        day_detail = summary["days"].get(punch_dt.date().isoformat(), {})
        late_today = {
            **late_info,
            "half_day_deduction": day_detail.get("half_day_deduction", False),
            "forgiven": day_detail.get("forgiven", False),
            "late_day_number": day_detail.get("late_day_number"),
            "message": late_message_for_punch(
                punch_in["timestamp"], s, month_punches, punch_dt.year, punch_dt.month
            ),
        }

    policy = get_late_policy(s)
    return {
        "punched_in": punch_in is not None and punch_out is None,
        "punch_in": punch_in,
        "punch_out": punch_out,
        "all_punches": punches,
        "late": late_today,
        "late_policy": policy,
    }

@router.get("/my/month")
def my_month(year: int, month: int, current_user: dict = Depends(get_current_user)):
    return AttendanceSheet.for_employee_month(current_user["id"], year, month)

@router.get("/my/late-summary")
def my_late_summary(year: int, month: int, current_user: dict = Depends(get_current_user)):
    global_s = SettingsSheet.get_all()
    s = _employee_settings(current_user, global_s)
    punches = AttendanceSheet.for_employee_month(current_user["id"], year, month)
    return build_monthly_late_summary(punches, s, year, month)

@router.get("/employee/{emp_id}/late-summary")
def employee_late_summary(
    emp_id: int,
    year: int,
    month: int,
    current_user: dict = Depends(require_admin),
):
    emp = EmployeeSheet.get_by_id(emp_id)
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")
    global_s = SettingsSheet.get_all()
    s = _employee_settings(emp, global_s)
    punches = AttendanceSheet.for_employee_month(emp_id, year, month)
    return build_monthly_late_summary(punches, s, year, month)

@router.get("/date/{date_str}")
def attendance_by_date(
    date_str: str,
    department: Optional[str] = None,
    branch: Optional[str] = None,
    current_user: dict = Depends(require_admin),
):
    employees = EmployeeSheet.all(
        department=department or "",
        branch=branch or "",
    )
    day_punches = AttendanceSheet.for_date(date_str)
    global_settings = SettingsSheet.get_all()
    try:
        day = datetime.fromisoformat(date_str).date()
        year, month = day.year, day.month
    except ValueError:
        year, month = datetime.now().year, datetime.now().month

    month_holidays = HolidaySheet.all(month=f"{year}-{month:02d}")

    result = []
    for emp in employees:
        emp_id = str(emp["id"])
        settings = _employee_settings(emp, global_settings)
        emp_punches = [p for p in day_punches if str(p["emp_id"]) == emp_id]
        emp_punches.sort(key=lambda p: p["timestamp"])
        punch_in  = next((p for p in emp_punches if p["punch_type"] == "in"),  None)
        punch_out = next((p for p in emp_punches if p["punch_type"] == "out"), None)
        month_punches = AttendanceSheet.for_employee_month(emp["id"], year, month)
        late_info = _day_late_info(punch_in, settings, year, month, month_punches)
        holiday = holiday_on_date(month_holidays, emp["id"], date_str)

        if punch_in and punch_out:
            h = (parse_timestamp(punch_out["timestamp"], settings) -
                 parse_timestamp(punch_in["timestamp"], settings)).total_seconds() / 3600
            status = "Present"
            hours_worked = round(h, 2)
            ot_hours = overtime_hours(hours_worked, settings)
        elif punch_in:
            status = "Not Punched Out"
            hours_worked = None
            ot_hours = None
        elif holiday:
            status = "Holiday"
            hours_worked = None
            ot_hours = None
        else:
            day_obj = datetime.fromisoformat(date_str).date() if date_str else None
            if day_obj and is_week_off(day_obj, settings):
                status = "Week Off"
            else:
                status = "Absent"
            hours_worked = None
            ot_hours = None

        result.append({
            **emp,
            "department_name": emp.get("department", ""),
            "branch_name": emp.get("branch", ""),
            "punch_in": punch_in["timestamp"] if punch_in else None,
            "punch_out": punch_out["timestamp"] if punch_out else None,
            "hours_worked": hours_worked,
            "regular_hours": regular_hours(hours_worked, settings) if hours_worked is not None else None,
            "overtime_hours": ot_hours,
            "shift_hours": shift_duration_hours(settings),
            "status": status,
            "holiday_name": holiday.get("name") if holiday else None,
            "is_late": late_info.get("is_late", False),
            "late_minutes": late_info.get("late_minutes", 0),
            "half_day_deduction": late_info.get("half_day_deduction", False),
            "late_forgiven": late_info.get("forgiven", False),
            "late_day_number": late_info.get("late_day_number"),
        })
    return result

@router.get("/employee/{emp_id}/month")
def employee_month(emp_id: int, year: int, month: int, current_user: dict = Depends(require_admin)):
    return AttendanceSheet.for_employee_month(emp_id, year, month)
