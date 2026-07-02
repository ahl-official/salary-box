from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import List, Optional
from models.sheets import HolidaySheet, EmployeeSheet
from utils.auth import get_current_user, require_admin

router = APIRouter()


class HolidayCreate(BaseModel):
    name: str
    date: str
    scope: str = "all"
    emp_ids: List[int] = []


class HolidayUpdate(BaseModel):
    name: Optional[str] = None
    date: Optional[str] = None
    scope: Optional[str] = None
    emp_ids: Optional[List[int]] = None


@router.get("/")
def list_holidays(month: Optional[str] = None, current_user: dict = Depends(require_admin)):
    employees = EmployeeSheet.all()
    return HolidaySheet.all(month=month or "", employees=employees)


@router.get("/my-month")
def my_holidays(year: int, month: int, current_user: dict = Depends(get_current_user)):
    dates = HolidaySheet.for_employee_month(current_user["id"], year, month)
    return {
        "year": year,
        "month": month,
        "days": {k: {"name": v["name"], "holiday_id": v["id"]} for k, v in dates.items()},
    }


@router.get("/{holiday_id}")
def get_holiday(holiday_id: int, current_user: dict = Depends(require_admin)):
    employees = EmployeeSheet.all()
    holiday = HolidaySheet.get_by_id(holiday_id, employees=employees)
    if not holiday:
        raise HTTPException(status_code=404, detail="Holiday not found")
    return holiday


@router.post("/")
def create_holiday(body: HolidayCreate, current_user: dict = Depends(require_admin)):
    if body.scope == "selected" and not body.emp_ids:
        raise HTTPException(status_code=400, detail="Select at least one employee for a targeted holiday")
    if body.scope not in ("all", "selected"):
        raise HTTPException(status_code=400, detail="scope must be 'all' or 'selected'")
    holiday = HolidaySheet.create(
        name=body.name.strip(),
        date_str=body.date,
        scope=body.scope,
        emp_ids=body.emp_ids,
        created_by=current_user.get("name", "HR"),
    )
    employees = EmployeeSheet.all()
    return HolidaySheet.get_by_id(holiday["id"], employees=employees) or holiday


@router.put("/{holiday_id}")
def update_holiday(holiday_id: int, body: HolidayUpdate, current_user: dict = Depends(require_admin)):
    updates = {k: v for k, v in body.dict().items() if v is not None}
    if updates.get("scope") == "selected" and updates.get("emp_ids") == []:
        raise HTTPException(status_code=400, detail="Select at least one employee")
    updated = HolidaySheet.update(holiday_id, updates)
    if not updated:
        raise HTTPException(status_code=404, detail="Holiday not found")
    return HolidaySheet.get_by_id(holiday_id, employees=EmployeeSheet.all()) or updated


@router.delete("/{holiday_id}")
def delete_holiday(holiday_id: int, current_user: dict = Depends(require_admin)):
    if not HolidaySheet.delete(holiday_id):
        raise HTTPException(status_code=404, detail="Holiday not found")
    return {"success": True}
