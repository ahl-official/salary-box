"""
HTTP client for the Apps Script Web App data layer.
Used when APPS_SCRIPT_URL + APPS_SCRIPT_SECRET are set on Vercel.
"""

import os
import json
import urllib.request
import urllib.error
from typing import Any, Optional

_APPS_SCRIPT_URL = os.environ.get("APPS_SCRIPT_URL", "").strip().rstrip("/")
_APPS_SCRIPT_SECRET = os.environ.get("APPS_SCRIPT_SECRET", "").strip()


class AppsScriptError(RuntimeError):
    pass


class _KeepPostRedirectHandler(urllib.request.HTTPRedirectHandler):
    """Google Apps Script web apps redirect POST; keep method and body."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        if code in (301, 302, 303, 307, 308):
            return urllib.request.Request(
                newurl,
                data=req.data,
                headers=dict(req.header_items()),
                method=req.get_method(),
            )
        return None


def apps_script_enabled() -> bool:
    return bool(_APPS_SCRIPT_URL and _APPS_SCRIPT_SECRET)


def call_action(action: str, args: Optional[dict] = None) -> Any:
    if not apps_script_enabled():
        raise AppsScriptError("APPS_SCRIPT_URL and APPS_SCRIPT_SECRET must be set")

    payload = json.dumps({
        "secret": _APPS_SCRIPT_SECRET,
        "action": action,
        "args": args or {},
    }).encode("utf-8")

    req = urllib.request.Request(
        _APPS_SCRIPT_URL,
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    opener = urllib.request.build_opener(_KeepPostRedirectHandler())
    try:
        with opener.open(req, timeout=30) as resp:
            body = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise AppsScriptError(f"Apps Script HTTP {exc.code}: {detail}") from exc
    except urllib.error.URLError as exc:
        raise AppsScriptError(f"Cannot reach Apps Script: {exc.reason}") from exc

    if not body.get("ok"):
        raise AppsScriptError(body.get("error") or "Apps Script request failed")
    return body.get("data")
