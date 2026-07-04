from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import List, Optional
from datetime import date

from models.sheets import LeaveSheet
from utils.auth import get_current_user
from utils.leave_utils import normalize_leave_dates

router = APIRouter()


class LeaveApplyRequest(BaseModel):
    leave_type: str
    dates: List[str]
    reason: Optional[str] = ""


@router.get("/my")
def my_leaves(current_user: dict = Depends(get_current_user)):
    return LeaveSheet.for_employee(int(current_user["id"]))


@router.post("/")
def apply_leave(body: LeaveApplyRequest, current_user: dict = Depends(get_current_user)):
    leave_type = body.leave_type.strip().lower()
    if leave_type not in ("single", "multiple"):
        raise HTTPException(status_code=400, detail="leave_type must be 'single' or 'multiple'")

    try:
        dates = normalize_leave_dates(leave_type, body.dates)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    today = date.today()
    for d in dates:
        if date.fromisoformat(d) < today:
            raise HTTPException(status_code=400, detail="Leave dates cannot be in the past")

    if LeaveSheet.has_overlap(int(current_user["id"]), dates):
        raise HTTPException(status_code=400, detail="You already have a leave request for one of these dates")

    record = LeaveSheet.create(
        emp_id=int(current_user["id"]),
        emp_name=current_user.get("name", ""),
        branch=current_user.get("branch", ""),
        leave_type=leave_type,
        dates=dates,
        reason=(body.reason or "").strip(),
    )
    return {"success": True, "leave": record}
