from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional, List
from models.sheets import EmployeeSheet, BranchSheet, DeptSheet
from utils.auth import get_current_user, require_admin

router = APIRouter()

class EmployeeCreate(BaseModel):
    name: str
    phone: str
    role: str = "employee"
    department: Optional[str] = None
    branch: Optional[str] = None
    designation: Optional[str] = None

class EmployeeBulkRow(BaseModel):
    name: str
    phone: str
    role: str = "employee"
    department: Optional[str] = "General"
    branch: Optional[str] = None
    designation: Optional[str] = "Employee"

class EmployeeBulkImport(BaseModel):
    employees: List[EmployeeBulkRow]
    default_branch: Optional[str] = None

class EmployeeUpdate(BaseModel):
    name: Optional[str] = None
    role: Optional[str] = None
    department: Optional[str] = None
    branch: Optional[str] = None
    designation: Optional[str] = None

@router.get("/")
def list_employees(
    search: Optional[str] = None,
    department: Optional[str] = None,
    branch: Optional[str] = None,
    current_user: dict = Depends(require_admin),
):
    return EmployeeSheet.all(
        search=search or "",
        department=department or "",
        branch=branch or "",
    )

@router.get("/branches/all")
def list_branches(current_user: dict = Depends(get_current_user)):
    return BranchSheet.all()

@router.get("/departments/all")
def list_departments(current_user: dict = Depends(get_current_user)):
    return DeptSheet.all()

@router.get("/{emp_id}")
def get_employee(emp_id: int, current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "admin" and str(current_user["id"]) != str(emp_id):
        raise HTTPException(status_code=403, detail="Forbidden")
    emp = EmployeeSheet.get_by_id(emp_id)
    if not emp:
        raise HTTPException(status_code=404, detail="Not found")
    return {**emp, "department_name": emp.get("department", ""), "branch_name": emp.get("branch", "")}

@router.post("/bulk")
def bulk_import_employees(body: EmployeeBulkImport, current_user: dict = Depends(require_admin)):
    if not body.employees:
        raise HTTPException(status_code=400, detail="No employees to import")
    if len(body.employees) > 500:
        raise HTTPException(status_code=400, detail="Maximum 500 employees per upload")
    rows = [e.dict() for e in body.employees]
    result = EmployeeSheet.bulk_create(rows, default_branch=body.default_branch or "")
    return {
        "success": True,
        "count": result.get("count", 0),
        "created": result.get("created", []),
        "skipped": result.get("skipped", []),
    }

@router.post("/")
def create_employee(emp: EmployeeCreate, current_user: dict = Depends(require_admin)):
    try:
        new = EmployeeSheet.create(
            name=emp.name, phone=emp.phone, role=emp.role,
            department=emp.department or "", branch=emp.branch or "",
            designation=emp.designation or "",
        )
        return {**new, "department_name": new.get("department", ""), "branch_name": new.get("branch", "")}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.put("/{emp_id}")
def update_employee(emp_id: int, emp: EmployeeUpdate, current_user: dict = Depends(require_admin)):
    fields = {k: v for k, v in emp.dict().items() if v is not None}
    updated = EmployeeSheet.update(emp_id, fields)
    if not updated:
        raise HTTPException(status_code=404, detail="Employee not found")
    return {**updated, "department_name": updated.get("department", ""), "branch_name": updated.get("branch", "")}

@router.delete("/{emp_id}")
def delete_employee(emp_id: int, current_user: dict = Depends(require_admin)):
    EmployeeSheet.delete(emp_id)
    return {"success": True}
