from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from models.sheets import EmployeeSheet
from utils.auth import create_token, get_current_user

router = APIRouter()

class LoginRequest(BaseModel):
    phone: str

@router.post("/login")
def login(req: LoginRequest):
    emp = EmployeeSheet.get_by_phone(req.phone.strip())
    if not emp:
        raise HTTPException(status_code=404, detail="Number not registered")
    token = create_token(int(emp["id"]), emp["phone"], emp["role"])
    return {
        "token": token,
        "role": emp["role"],
        "employee": {
            "id": emp["id"],
            "name": emp["name"],
            "phone": emp["phone"],
            "role": emp["role"],
            "designation": emp.get("designation", ""),
            "department_name": emp.get("department", ""),
            "branch_name": emp.get("branch", ""),
        }
    }

@router.get("/me")
def me_endpoint(current_user: dict = Depends(get_current_user)):
    return {
        **current_user,
        "department_name": current_user.get("department", ""),
        "branch_name": current_user.get("branch", ""),
    }
