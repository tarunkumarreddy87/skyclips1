#!/usr/bin/env python3
"""Backfill Cache-Control on derived preview objects (proxy / poster / sprite).

Existing objects predate ADR 0012 — without Cache-Control the browser re-fetches
proxies on every editor open. New uploads already set CACHE_CONTROL_DERIVED_MEDIA.

Usage:
  python infrastructure/aws/backfill-media-cache-control.py
  python infrastructure/aws/backfill-media-cache-control.py --bucket hanuman-artifacts-623271127861
"""

from __future__ import annotations

import argparse
import sys

import boto3

CACHE = "public, max-age=86400"
SUFFIXES = (".proxy.mp4", ".poster.jpg", ".sprite.jpg")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--bucket",
        default="hanuman-artifacts-623271127861",
        help="Artifacts bucket",
    )
    parser.add_argument("--prefix", default="projects/", help="Key prefix")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    s3 = boto3.client("s3")
    paginator = s3.get_paginator("list_objects_v2")
    updated = skipped = errors = 0

    for page in paginator.paginate(Bucket=args.bucket, Prefix=args.prefix):
        for obj in page.get("Contents", []):
            key = obj["Key"]
            if not any(key.endswith(s) for s in SUFFIXES):
                continue
            try:
                head = s3.head_object(Bucket=args.bucket, Key=key)
            except Exception as exc:  # noqa: BLE001
                print(f"HEAD fail {key}: {exc}", file=sys.stderr)
                errors += 1
                continue
            if head.get("CacheControl") == CACHE:
                skipped += 1
                continue
            ctype = head.get("ContentType") or "application/octet-stream"
            meta = head.get("Metadata") or {}
            if args.dry_run:
                print(f"Would update {key}")
                updated += 1
                continue
            params = {
                "Bucket": args.bucket,
                "Key": key,
                "CopySource": {"Bucket": args.bucket, "Key": key},
                "MetadataDirective": "REPLACE",
                "CacheControl": CACHE,
                "ContentType": ctype,
            }
            if meta:
                params["Metadata"] = meta
            try:
                s3.copy_object(**params)
                updated += 1
                print(f"Updated {key}")
            except Exception as exc:  # noqa: BLE001
                print(f"COPY fail {key}: {exc}", file=sys.stderr)
                errors += 1

    print(f"Done. updated={updated} skipped={skipped} errors={errors}")
    return 1 if errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
