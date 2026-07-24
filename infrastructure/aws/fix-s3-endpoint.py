"""Point ECS api/orchestrator/media at real AWS S3 (not MinIO localhost)."""
from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

REGION = "us-east-1"
CLUSTER = "hanuman-prod"
FAMILIES = (
    ("hanuman-prod-api", "api"),
    ("hanuman-prod-orchestrator", "orchestrator"),
    ("hanuman-prod-media", "media"),
)


def aws_text(args: list[str]) -> str:
    return subprocess.check_output(["aws", *args], text=True).strip()


def main() -> int:
    # Live images still pass S3_ENDPOINT to boto3; use regional AWS endpoint until rebuild.
    access = aws_text(["configure", "get", "aws_access_key_id"])
    secret = aws_text(["configure", "get", "aws_secret_access_key"])
    if not access or not secret:
        print("AWS CLI credentials missing", file=sys.stderr)
        return 1

    updates = {
        "S3_ENDPOINT": "https://s3.us-east-1.amazonaws.com",
        "S3_ACCESS_KEY": access,
        "S3_SECRET_KEY": secret,
        "S3_REGION": "us-east-1",
    }

    for family, service in FAMILIES:
        td = json.loads(
            aws_text(
                [
                    "ecs",
                    "describe-task-definition",
                    "--task-definition",
                    family,
                    "--region",
                    REGION,
                    "--output",
                    "json",
                ]
            )
        )["taskDefinition"]
        c = td["containerDefinitions"][0]
        env = {e["name"]: e["value"] for e in (c.get("environment") or [])}
        env.update(updates)
        new_c = {
            "name": c["name"],
            "image": c["image"],
            "essential": True,
            "environment": [{"name": k, "value": v} for k, v in env.items()],
            "logConfiguration": c["logConfiguration"],
        }
        if c.get("portMappings"):
            new_c["portMappings"] = c["portMappings"]
        new_td = {
            "family": td["family"],
            "networkMode": td["networkMode"],
            "requiresCompatibilities": td["requiresCompatibilities"],
            "cpu": td["cpu"],
            "memory": td["memory"],
            "executionRoleArn": td["executionRoleArn"],
            "taskRoleArn": td["taskRoleArn"],
            "containerDefinitions": [new_c],
        }
        path = Path(os.environ["TEMP"]) / f"{family}-s3.json"
        path.write_text(json.dumps(new_td), encoding="utf-8")
        uri = "file://" + str(path).replace("\\", "/")
        rev = aws_text(
            [
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
            ]
        )
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
        print(f"Updated {family}:{rev} -> {service}")
    print("Done — retry generation after ~1-2 min")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
