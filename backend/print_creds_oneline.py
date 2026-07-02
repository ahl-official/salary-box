"""Print service_account.json as a single line for Vercel env vars."""
import json
import sys
from pathlib import Path

path = Path(__file__).resolve().parent.parent / "service_account.json"
if len(sys.argv) > 1:
    path = Path(sys.argv[1])

if not path.exists():
    print(f"File not found: {path}", file=sys.stderr)
    raise SystemExit(1)

info = json.loads(path.read_text(encoding="utf-8"))
print(json.dumps(info))
print(f"\nService account email: {info.get('client_email', '')}", file=sys.stderr)
