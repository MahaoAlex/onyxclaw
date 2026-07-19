#!/usr/bin/env python3
"""Minimal JSON-lines bridge between the Node BFF and the ACS E2B SDK."""

import base64
import json
import os
import sys
from urllib.parse import urlparse


base_url = urlparse(os.environ["E2B_BASE_URL"])
if base_url.scheme not in ("http", "https") or not base_url.netloc:
    raise RuntimeError("E2B_BASE_URL must be an HTTP(S) URL")
os.environ["E2B_DOMAIN"] = base_url.netloc

from kruise_agents.patch_e2b import patch_e2b

patch_e2b(https=base_url.scheme == "https")
from e2b import Sandbox


api_key = os.environ["E2B_API_KEY"]
route_domain = os.environ.get("E2B_ROUTE_DOMAIN")
sessions = {}


def routed(session):
    if not route_domain:
        return session
    return Sandbox(
        sandbox_id=session.sandbox_id,
        sandbox_domain=route_domain,
        connection_config=session.connection_config,
        envd_version=session._envd_version,
        envd_access_token=session._envd_access_token,
        traffic_access_token=session.traffic_access_token,
    )


def connect_session(sandbox_id):
    if sandbox_id not in sessions:
        claimed = Sandbox.connect(sandbox_id, api_key=api_key)
        sessions[sandbox_id] = (claimed, routed(claimed))
    return sessions[sandbox_id]


def dispatch(op, params):
    if op == "create":
        claimed = Sandbox.create(
            template=params["template"],
            timeout=params.get("timeoutSeconds", 300),
            metadata=params.get("metadata"),
            envs=params.get("envs"),
            secure=params.get("secure", True),
            api_key=api_key,
        )
        sessions[claimed.sandbox_id] = (claimed, routed(claimed))
        return {"sandboxId": claimed.sandbox_id}

    sandbox_id = params["sandboxId"]
    claimed, session = connect_session(sandbox_id)
    if op == "connect":
        return {"sandboxId": sandbox_id}
    if op == "command":
        result = session.commands.run(
            params["command"],
            user=params.get("user"),
        )
        return {
            "exitCode": getattr(result, "exit_code", 0),
            "stdout": result.stdout,
            "stderr": result.stderr,
        }
    if op == "writeFile":
        content = params["content"]
        if params.get("encoding") == "base64":
            content = base64.b64decode(content)
        session.files.write(params["path"], content, user=params.get("user"))
        return {"written": True}
    if op == "readFile":
        content = session.files.read(params["path"], user=params.get("user"))
        return {"content": content}
    if op == "kill":
        claimed.kill()
        sessions.pop(sandbox_id, None)
        return {"killed": True}
    raise ValueError("unsupported bridge operation")


for line in sys.stdin:
    try:
        request = json.loads(line)
        result = dispatch(request["op"], request.get("params", {}))
        response = {"id": request["id"], "result": result}
    except Exception as error:
        response = {
            "id": request.get("id") if "request" in locals() else None,
            "error": {
                "code": "E2B_BRIDGE_OPERATION_FAILED",
                "message": f"bridge operation failed ({type(error).__name__})",
            },
        }
    print(json.dumps(response, separators=(",", ":")), flush=True)
