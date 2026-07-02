from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional, List
import json
from models.sheets import SettingsSheet, BranchSheet, DeptSheet, EmployeeSheet
from utils.auth import get_current_user, require_admin
from utils.branch_settings import effective_settings

router = APIRouter()

class CompanySettingsUpdate(BaseModel):
    company_name: Optional[str] = None
    address: Optional[str] = None
    gstin: Optional[str] = None
    office_lat: Optional[float] = None
    office_lng: Optional[float] = None
    radius_meters: Optional[int] = None
    wifi_ip: Optional[str] = None
    wifi_lock_enabled: Optional[int] = None
    standard_shift_hours: Optional[float] = None
    shift_start: Optional[str] = None
    shift_end: Optional[str] = None
    working_days: Optional[List[str]] = None

class BranchCreate(BaseModel):
    name: str

class BranchRulesUpdate(BaseModel):
    office_lat: Optional[float] = None
    office_lng: Optional[float] = None
    radius_meters: Optional[int] = None
    shift_start: Optional[str] = None
    shift_end: Optional[str] = None
    standard_shift_hours: Optional[float] = None
    working_days: Optional[List[str]] = None
    wifi_ip: Optional[str] = None
    wifi_lock_enabled: Optional[int] = None
    late_policy_type: Optional[str] = None
    late_grace_minutes: Optional[int] = None
    late_monthly_allowance: Optional[int] = None

class DeptCreate(BaseModel):
    name: str

def _parse_settings_response(s: dict) -> dict:
    if "working_days" in s:
        try:
            s["working_days"] = json.loads(s["working_days"])
        except Exception:
            pass
    return s

@router.get("/company")
def get_company(current_user: dict = Depends(get_current_user)):
    return _parse_settings_response(SettingsSheet.get_all())

@router.put("/company")
def update_company(body: CompanySettingsUpdate, current_user: dict = Depends(require_admin)):
    updates = {k: v for k, v in body.dict().items() if v is not None}
    if "working_days" in updates:
        updates["working_days"] = json.dumps(updates["working_days"])
    if not updates:
        raise HTTPException(status_code=400, detail="No fields provided")
    SettingsSheet.update_many(updates)
    return _parse_settings_response(SettingsSheet.get_all())

@router.get("/branch/me")
def my_branch_settings(current_user: dict = Depends(get_current_user)):
    global_s = SettingsSheet.get_all()
    branch_name = current_user.get("branch", "")
    branch = BranchSheet.get_by_name(branch_name) if branch_name else None
    effective = effective_settings(global_s, branch)
    return _parse_settings_response({
        **effective,
        "branch_name": branch_name or None,
        "branch_id": branch.get("id") if branch else None,
        "timezone": global_s.get("timezone", "Asia/Kolkata"),
    })

@router.get("/branch/{branch_name}")
def branch_settings(branch_name: str, current_user: dict = Depends(get_current_user)):
    global_s = SettingsSheet.get_all()
    branch = BranchSheet.get_by_name(branch_name)
    if not branch:
        raise HTTPException(status_code=404, detail="Branch not found")
    effective = effective_settings(global_s, branch)
    return _parse_settings_response({
        **effective,
        "branch_name": branch["name"],
        "branch_id": branch["id"],
        "timezone": global_s.get("timezone", "Asia/Kolkata"),
    })

@router.get("/branches")
def list_branches(current_user: dict = Depends(get_current_user)):
    return BranchSheet.all()

@router.post("/branches")
def add_branch(body: BranchCreate, current_user: dict = Depends(require_admin)):
    try:
        return BranchSheet.create(body.name)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.put("/branches/{branch_id}")
def update_branch_rules(
    branch_id: int,
    body: BranchRulesUpdate,
    current_user: dict = Depends(require_admin),
):
    updates = {k: v for k, v in body.dict().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="No fields provided")
    updated = BranchSheet.update(branch_id, updates)
    if not updated:
        raise HTTPException(status_code=404, detail="Branch not found")
    return updated

@router.delete("/branches/{branch_id}")
def delete_branch(branch_id: int, current_user: dict = Depends(require_admin)):
    branch = BranchSheet.get_by_id(branch_id)
    if not branch:
        raise HTTPException(status_code=404, detail="Branch not found")
    in_use = any(
        str(e.get("branch", "")).lower() == branch["name"].lower()
        for e in EmployeeSheet.all()
    )
    if in_use:
        raise HTTPException(status_code=400, detail="Cannot delete branch assigned to employees")
    BranchSheet.delete(branch_id)
    return {"success": True}

@router.get("/departments")
def list_depts(current_user: dict = Depends(get_current_user)):
    return DeptSheet.all()

@router.post("/departments")
def add_dept(body: DeptCreate, current_user: dict = Depends(require_admin)):
    try:
        return DeptSheet.create(body.name)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.delete("/departments/{dept_id}")
def delete_dept(dept_id: int, current_user: dict = Depends(require_admin)):
    DeptSheet.delete(dept_id)
    return {"success": True}
