from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
from datetime import date
from models.sheets import NoteSheet, SettingsSheet
from utils.datetime_utils import now_iso, today_iso
from utils.auth import get_current_user, require_admin

router = APIRouter()

class NoteCreate(BaseModel):
    content: str
    date: Optional[str] = None

@router.get("/today")
def get_today_note(current_user: dict = Depends(get_current_user)):
    return NoteSheet.for_date(today_iso(SettingsSheet.get_all()))

@router.get("/")
def list_notes(current_user: dict = Depends(require_admin)):
    return NoteSheet.all()

@router.post("/")
def create_note(body: NoteCreate, current_user: dict = Depends(require_admin)):
    note_date = body.date or today_iso(SettingsSheet.get_all())
    return NoteSheet.create(
        content=body.content,
        posted_by=current_user["name"],
        note_date=note_date,
    )

@router.delete("/{note_id}")
def delete_note(note_id: int, current_user: dict = Depends(require_admin)):
    NoteSheet.delete(note_id)
    return {"success": True}
