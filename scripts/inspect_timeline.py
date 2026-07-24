import json
import boto3
from botocore.client import Config
from src.config import settings

key = "projects/2f710f11-e926-4be4-95a4-975b254ed434/runs/17b6bb98-4cfe-4063-94f5-b8839458c611/timeline.v1.json"
client = boto3.client(
    "s3",
    endpoint_url=settings.s3_endpoint,
    aws_access_key_id=settings.s3_access_key,
    aws_secret_access_key=settings.s3_secret_key,
    region_name=settings.s3_region,
    config=Config(signature_version="s3v4"),
)
data = json.loads(client.get_object(Bucket=settings.s3_bucket, Key=key)["Body"].read())
print("duration_sec:", data["metadata"]["duration_sec"])
for clip in data["tracks"]["video"]:
    print(f"  {clip['id']}: {clip['duration_sec']}s src={clip['src']}")
