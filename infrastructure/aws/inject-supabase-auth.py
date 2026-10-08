"""Inject Supabase Auth env into ECS api (+ optional JWT secret). Do not commit secrets."""
from __future__ import annotations

import json
import os
import re
import subprocess
import sys
from pathlib import Path

REGION = "us-east-1"
CLUSTER = "hanuman-prod"
NEEDED = ("SUPABASE_URL", "SUPABASE_ANON_KEY")
OPTIONAL = ("SUPABASE_JWT_SECRET",)
FAMILIES = (("hanuman-prod-api", "api"),)


def load_env(path: Path) -> dict[str, str]:
    env_map: dict[str, str] = {}
    if not path.exists():
        return env_map
    for line in path.read_text(encoding="utf-8").splitlines():
        m = re.match(r"^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$", line)
        if not m:
            continue
        key, raw = m.group(1), m.group(2).strip()
        if (raw.startswith('"') and raw.endswith('"')) or (
            raw.startswith("'") and raw.endswith("'")
        ):
            raw = raw[1:-1]
        if raw:
            env_map[key] = raw
    return env_map


def aws_json(args: list[str]) -> dict:
    out = subprocess.check_output(["aws", *args, "--region", REGION, "--output", "json"], text=True)
    return json.loads(out)


def update_family(family: str, secrets: dict[str, str]) -> str:
    td = aws_json(["ecs", "describe-task-definition", "--task-definition", family])[
        "taskDefinition"
    ]
    container = td["containerDefinitions"][0]
    env = {e["name"]: e["value"] for e in container.get("environment") or []}
    for key in (*NEEDED, *OPTIONAL):
        if key in secrets and secrets[key].strip():
            env[key] = secrets[key]

    new_container: dict = {
        "name": container["name"],
        "image": container["image"],
        "essential": True,
        "environment": [{"name": k, "value": v} for k, v in env.items()],
        "logConfiguration": container["logConfiguration"],
    }
    if container.get("portMappings"):
        new_container["portMappings"] = container["portMappings"]

    new_td = {
        "family": td["family"],
        "networkMode": td["networkMode"],
        "requiresCompatibilities": td["requiresCompatibilities"],
        "cpu": td["cpu"],
        "memory": td["memory"],
        "executionRoleArn": td["executionRoleArn"],
        "taskRoleArn": td["taskRoleArn"],
        "containerDefinitions": [new_container],
    }
    path = Path(os.environ["TEMP"]) / f"{family}-td-supabase.json"
    path.write_text(json.dumps(new_td), encoding="utf-8")
    uri = "file://" + str(path).replace("\\", "/")
    rev = subprocess.check_output(
        [
            "aws",
            "ecs",
            "register-task-definition",
            "--cli-input-json",
            uri,
            "--region",
            REGION,
            "--query",
            "taskDefinition.revision",
            "--output",
            "text",
        ],
        text=True,
    ).strip()
    print(f"Registered {family}:{rev}")
    return rev


def main() -> int:
    root = Path(__file__).resolve().parents[2]
    secrets = load_env(root / ".env")
    # Allow NEXT_PUBLIC_* aliases
    if "SUPABASE_URL" not in secrets and secrets.get("NEXT_PUBLIC_SUPABASE_URL"):
        secrets["SUPABASE_URL"] = secrets["NEXT_PUBLIC_SUPABASE_URL"]
    if "SUPABASE_ANON_KEY" not in secrets and secrets.get("NEXT_PUBLIC_SUPABASE_ANON_KEY"):
        secrets["SUPABASE_ANON_KEY"] = secrets["NEXT_PUBLIC_SUPABASE_ANON_KEY"]

    for key in NEEDED:
        if key not in secrets or not secrets[key].strip():
            print(f"Missing {key} in .env", file=sys.stderr)
            return 1
        print(f"Found {key} (len={len(secrets[key])})")

    for family, service in FAMILIES:
        rev = update_family(family, secrets)
        subprocess.check_call(
            [
                "aws",
                "ecs",
                "update-service",
                "--cluster",
                CLUSTER,
                "--service",
                service,
                "--task-definition",
                f"{family}:{rev}",
                "--force-new-deployment",
                "--region",
                REGION,
                "--query",
                "service.serviceName",
                "--output",
                "text",
            ]
        )
    print("Redeployed api with Supabase Auth env")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
