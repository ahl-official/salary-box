"""
Vercel serverless entrypoint — exposes the FastAPI app at /api/*
"""
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parent.parent / "backend"
sys.path.insert(0, str(BACKEND))

from main import app  # noqa: E402
