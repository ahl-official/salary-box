import jwt
from datetime import datetime
from fastapi import HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from models.sheets import EmployeeSheet

SECRET_KEY = "attendance_secret_key_2024_never_expires"
ALGORITHM = "HS256"
security = HTTPBearer()

def create_token(employee_id: int, phone: str, role: str) -> str:
    payload = {
        "sub": str(employee_id),
        "phone": phone,
        "role": role,
        "iat": datetime.utcnow().timestamp(),
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)

def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    payload = decode_token(credentials.credentials)
    emp = EmployeeSheet.get_by_id(int(payload["sub"]))
    if not emp:
        raise HTTPException(status_code=401, detail="User not found")
    return emp

def require_admin(current_user: dict = Depends(get_current_user)):
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user
