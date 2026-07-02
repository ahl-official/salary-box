"""Export service_account.json for Vercel environment variables."""
import argparse
import base64
import json
import sys
from pathlib import Path

DEFAULT = Path(__file__).resolve().parent / "service_account.json"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("path", nargs="?", default=str(DEFAULT))
    parser.add_argument("--base64", action="store_true", help="Print base64 for GOOGLE_SHEETS_CREDS_B64")
    args = parser.parse_args()

    path = Path(args.path)
    if not path.exists():
        print(f"File not found: {path}", file=sys.stderr)
        print("Download JSON key from Google Cloud → save as backend/service_account.json", file=sys.stderr)
        return 1

    raw = path.read_bytes()
    info = json.loads(raw.decode("utf-8"))
    email = info.get("client_email", "")

    if args.base64:
        print(base64.b64encode(raw).decode("ascii"))
        print(f"\nVercel: set GOOGLE_SHEETS_CREDS_B64 to the line above", file=sys.stderr)
    else:
        print(json.dumps(info))
        print(f"\nVercel: set GOOGLE_SHEETS_CREDS_JSON to the single line above", file=sys.stderr)

    print(f"Service account email: {email}", file=sys.stderr)
    print("Then share your Google Sheet with that email as Editor.", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
