"""
HTTP client for the Apps Script Web App data layer.
Used when APPS_SCRIPT_URL + APPS_SCRIPT_SECRET are set on Vercel.

Uses GET requests (query params) because Google Apps Script POST redirects
return HTTP 405 on the googleusercontent.com target from server-side callers.
"""

import os
import json
import urllib.parse
import urllib.request
import urllib.error
from typing import Any, Optional


def _clean_env(value: str) -> str:
    return value.strip().strip('"').strip("'")


_APPS_SCRIPT_URL = _clean_env(os.environ.get("APPS_SCRIPT_URL", "")).rstrip("/")
_APPS_SCRIPT_SECRET = _clean_env(os.environ.get("APPS_SCRIPT_SECRET", ""))


class AppsScriptError(RuntimeError):
    pass


def apps_script_enabled() -> bool:
    return bool(_APPS_SCRIPT_URL and _APPS_SCRIPT_SECRET)


def _read_json_response(resp) -> dict:
    try:
        return json.loads(resp.read().decode("utf-8"))
    finally:
        resp.close()


def _get_json(url: str) -> dict:
    req = urllib.request.Request(url, method="GET")
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return _read_json_response(resp)
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")[:500]
        raise AppsScriptError(f"Apps Script HTTP {exc.code}: {detail}") from exc
    except urllib.error.URLError as exc:
        raise AppsScriptError(f"Cannot reach Apps Script: {exc.reason}") from exc


def call_action_health() -> Any:
    """Health check via GET (no secret required)."""
    if not _APPS_SCRIPT_URL:
        raise AppsScriptError("APPS_SCRIPT_URL must be set")
    body = _get_json(_APPS_SCRIPT_URL)
    if not body.get("ok"):
        raise AppsScriptError(body.get("error") or "Apps Script health check failed")
    return body.get("data")


def call_action(action: str, args: Optional[dict] = None) -> Any:
    if not apps_script_enabled():
        raise AppsScriptError("APPS_SCRIPT_URL and APPS_SCRIPT_SECRET must be set")

    query = urllib.parse.urlencode({
        "secret": _APPS_SCRIPT_SECRET,
        "action": action,
        "args": json.dumps(args or {}, separators=(",", ":")),
    })
    url = f"{_APPS_SCRIPT_URL}?{query}"
    body = _get_json(url)

    if not body.get("ok"):
        raise AppsScriptError(body.get("error") or "Apps Script request failed")
    return body.get("data")
