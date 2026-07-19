#!/usr/bin/env python3
"""Claim an ACS Sandbox through E2B and verify commands and files."""

import argparse
import base64
import json
import os
from pathlib import Path
import subprocess


ROOT = Path(__file__).resolve().parent.parent


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--kubeconfig", default=str(ROOT / "generated" / "kubeconfig"))
    parser.add_argument("--manager-domain", default="127.0.0.1:18081")
    parser.add_argument("--route-domain", default="127.0.0.1:18081")
    parser.add_argument("--template", default="onyxclaw")
    parser.add_argument("--runtime-user", default="node")
    return parser.parse_args()


def load_runtime_key(kubeconfig):
    result = subprocess.run(
        [
            "kubectl",
            "--kubeconfig",
            kubeconfig,
            "get",
            "secret/e2b-key-store",
            "-n",
            "sandbox-system",
            "-o",
            "json",
        ],
        check=True,
        capture_output=True,
        text=True,
    )
    secret = json.loads(result.stdout)
    for value in secret.get("data", {}).values():
        record = json.loads(base64.b64decode(value))
        if record.get("key"):
            return record["key"]
    raise RuntimeError("e2b-key-store does not contain a usable runtime key")


def main():
    args = parse_args()
    runtime_key = load_runtime_key(args.kubeconfig)
    os.environ["E2B_DOMAIN"] = args.manager_domain

    # The ACS private-protocol patch must run before importing Sandbox.
    from kruise_agents.patch_e2b import patch_e2b

    patch_e2b(https=False)
    from e2b import Sandbox

    claimed = None
    try:
        claimed = Sandbox.create(
            template=args.template,
            api_key=runtime_key,
            timeout=300,
        )
        # A local port-forward differs from the VPC domain returned by Manager.
        sandbox = Sandbox(
            sandbox_id=claimed.sandbox_id,
            sandbox_domain=args.route_domain,
            connection_config=claimed.connection_config,
            envd_version=claimed._envd_version,
            envd_access_token=claimed._envd_access_token,
            traffic_access_token=claimed.traffic_access_token,
        )
        command = sandbox.commands.run(
            "id && test -f /run/e2b/.E2B_SANDBOX && printf sdk-command-ok",
            user=args.runtime_user,
        )
        sandbox.files.write(
            "/tmp/onyxclaw-e2b-smoke.txt",
            "sdk-file-ok",
            user=args.runtime_user,
        )
        content = sandbox.files.read(
            "/tmp/onyxclaw-e2b-smoke.txt",
            user=args.runtime_user,
        )
        if "sdk-command-ok" not in command.stdout or content != "sdk-file-ok":
            raise RuntimeError("E2B smoke assertions failed")
        print(f"sandbox_id={sandbox.sandbox_id}")
        print(f"command_test=passed user={args.runtime_user}")
        print(f"file_test=passed user={args.runtime_user}")
    finally:
        if claimed is not None:
            claimed.kill()


if __name__ == "__main__":
    main()
